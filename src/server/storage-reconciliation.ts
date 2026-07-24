import type { PrismaClient } from "../../generated/prisma";

import { db } from "~/server/db";
import { reconcilePendingStorageDeletions } from "~/server/storage-deletions";
import {
  cleanupUploadStaging,
  countAbandonedUploadStaging,
} from "~/server/upload-staging-cleanup";
import type { StorageClientFactory } from "~/server/storage";

export const RECONCILIATION_FAILURE_THRESHOLD = 5;

type StorageReconciliationDependencies = {
  prisma?: PrismaClient;
  getStorageClient?: StorageClientFactory;
  now?: () => Date;
  /** Caps how many rows each sub-step reconciles in this call. Unbounded when omitted. */
  take?: number;
};

export async function reconcileStorage(
  dependencies: StorageReconciliationDependencies = {},
) {
  const prisma = dependencies.prisma ?? db;
  const pendingDeletions = await reconcilePendingStorageDeletions({
    prisma,
    getStorageClient: dependencies.getStorageClient,
    now: dependencies.now,
    take: dependencies.take,
  });
  const abandonedStaging = await cleanupUploadStaging({
    prisma,
    getStorageClient: dependencies.getStorageClient,
    now: dependencies.now,
    take: dependencies.take,
  });
  return { pendingDeletions, abandonedStaging };
}

export async function getStorageReport(
  dependencies: Pick<StorageReconciliationDependencies, "prisma" | "now"> = {},
) {
  const prisma = dependencies.prisma ?? db;
  const [owned, pendingDeletions, abandonedStagingObjects, failures] =
    await Promise.all([
      prisma.uploadIntent.aggregate({
        where: {
          status: "FINALIZED",
          storageDeletedAt: null,
          resultStorageBucket: { not: null },
          resultStoragePath: { not: null },
        },
        _sum: { resultByteSize: true },
      }),
      prisma.pendingStorageDeletion.count(),
      countAbandonedUploadStaging({ prisma, now: dependencies.now }),
      prisma.pendingStorageDeletion.count({
        where: { attempts: { gte: RECONCILIATION_FAILURE_THRESHOLD } },
      }),
    ]);

  return {
    totalOwnedBytes: owned._sum.resultByteSize ?? 0,
    pendingDeletions,
    abandonedStagingObjects,
    reconciliationFailures: failures,
    failureThreshold: RECONCILIATION_FAILURE_THRESHOLD,
  };
}
