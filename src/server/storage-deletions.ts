import type { Prisma, PrismaClient } from "../../generated/prisma";

import { db } from "~/server/db";
import {
  createStorageClient,
  type StorageClientFactory,
} from "~/server/storage";

export type StorageObjectKey = { bucket: string; path: string };

type ReconciliationDependencies = {
  prisma?: PrismaClient;
  getStorageClient?: StorageClientFactory;
  only?: StorageObjectKey[];
  now?: () => Date;
  /** Caps how many pending deletions are reconciled in this call. Unbounded when omitted. */
  take?: number;
};

function uniqueObjects(objects: StorageObjectKey[]) {
  return [
    ...new Map(
      objects.map((object) => [`${object.bucket}\0${object.path}`, object]),
    ).values(),
  ];
}

export async function queueStorageDeletions(
  transaction: Prisma.TransactionClient,
  objects: StorageObjectKey[],
  reason: string,
) {
  const unique = uniqueObjects(objects);
  if (unique.length === 0) return [];
  await transaction.pendingStorageDeletion.createMany({
    data: unique.map((object) => ({ ...object, reason })),
    skipDuplicates: true,
  });
  return unique;
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Storage failure";
  return message.slice(0, 1_000);
}

function isAlreadyGone(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const status = record.status ?? record.statusCode;
  if (status === 404 || status === "404") return true;
  return (
    typeof record.message === "string" && /not[ -]?found/i.test(record.message)
  );
}

async function reconcileOne(
  prisma: PrismaClient,
  getStorageClient: StorageClientFactory,
  object: StorageObjectKey,
  now: () => Date,
) {
  try {
    return await prisma.$transaction(
      async (transaction) => {
        const pending = await transaction.pendingStorageDeletion.findUnique({
          where: { bucket_path: object },
        });
        if (!pending) return "missing" as const;

        const owner = await transaction.uploadIntent.findFirst({
          where: {
            resultStorageBucket: object.bucket,
            resultStoragePath: object.path,
          },
          select: { id: true, resultUrl: true, storageDeletedAt: true },
        });

        // New owned rows are attached through UploadIntent. Locking that ledger
        // row makes reference creation and deletion mutually exclusive. The
        // Storage call stays inside this short transaction so a live reference
        // cannot appear between the final reference check and object removal.
        if (owner) {
          await transaction.$queryRaw`SELECT "id" FROM "UploadIntent" WHERE "id" = ${owner.id} FOR UPDATE`;
        }
        await transaction.$queryRaw`SELECT "bucket" FROM "PendingStorageDeletion" WHERE "bucket" = ${object.bucket} AND "path" = ${object.path} FOR UPDATE`;
        const stillPending =
          await transaction.pendingStorageDeletion.findUnique({
            where: { bucket_path: object },
          });
        if (!stillPending) return "missing" as const;

        const [projectMedia, imageResources, userReferences] =
          await Promise.all([
            transaction.projectMedia.count({
              where: {
                storageBucket: object.bucket,
                storagePath: object.path,
              },
            }),
            transaction.imageResource.count({
              where: {
                storageBucket: object.bucket,
                storagePath: object.path,
              },
            }),
            owner?.resultUrl
              ? transaction.user.count({
                  where: {
                    OR: [
                      { canvasBackgroundImageUrl: owner.resultUrl },
                      { avatarUrl: owner.resultUrl },
                    ],
                  },
                })
              : Promise.resolve(0),
          ]);

        if (projectMedia + imageResources + userReferences > 0) {
          await transaction.pendingStorageDeletion.delete({
            where: { bucket_path: object },
          });
          return "referenced" as const;
        }

        const { error } = await getStorageClient()
          .storage.from(object.bucket)
          .remove([object.path]);
        if (error && !isAlreadyGone(error)) throw error;

        await transaction.pendingStorageDeletion.delete({
          where: { bucket_path: object },
        });
        await transaction.uploadIntent.updateMany({
          where: {
            resultStorageBucket: object.bucket,
            resultStoragePath: object.path,
            storageDeletedAt: null,
          },
          data: { storageDeletedAt: now() },
        });
        return "deleted" as const;
      },
      { maxWait: 5_000, timeout: 15_000 },
    );
  } catch (error) {
    await prisma.pendingStorageDeletion.updateMany({
      where: object,
      data: {
        attempts: { increment: 1 },
        lastError: safeErrorMessage(error),
      },
    });
    return "failed" as const;
  }
}

export async function reconcilePendingStorageDeletions(
  dependencies: ReconciliationDependencies = {},
) {
  const prisma = dependencies.prisma ?? db;
  const getStorageClient = dependencies.getStorageClient ?? createStorageClient;
  const only = dependencies.only ? uniqueObjects(dependencies.only) : undefined;
  if (only?.length === 0) {
    return { selected: 0, deleted: 0, referenced: 0, missing: 0, failed: 0 };
  }
  const pending = await prisma.pendingStorageDeletion.findMany({
    where: only?.length
      ? {
          OR: only.map((object) => ({
            bucket: object.bucket,
            path: object.path,
          })),
        }
      : undefined,
    select: { bucket: true, path: true },
    orderBy: { createdAt: "asc" },
    ...(dependencies.take !== undefined ? { take: dependencies.take } : {}),
  });

  const result = {
    selected: pending.length,
    deleted: 0,
    referenced: 0,
    missing: 0,
    failed: 0,
  };
  for (const object of pending) {
    const outcome = await reconcileOne(
      prisma,
      getStorageClient,
      object,
      dependencies.now ?? (() => new Date()),
    );
    result[outcome] += 1;
  }
  return result;
}

export async function countPendingStorageDeletions(
  dependencies: Pick<ReconciliationDependencies, "prisma"> = {},
) {
  const prisma = dependencies.prisma ?? db;
  return prisma.pendingStorageDeletion.count();
}

export async function queueAndDeleteStorageObjectBestEffort(
  object: StorageObjectKey,
  reason: string,
  dependencies: Omit<ReconciliationDependencies, "only"> = {},
) {
  const prisma = dependencies.prisma ?? db;
  await prisma.pendingStorageDeletion.upsert({
    where: { bucket_path: object },
    create: { ...object, reason },
    update: {},
  });
  return reconcilePendingStorageDeletions({
    ...dependencies,
    prisma,
    only: [object],
  });
}
