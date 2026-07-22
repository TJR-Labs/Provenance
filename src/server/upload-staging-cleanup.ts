import { db } from "~/server/db";
import {
  createStorageClient,
  type StorageClientFactory,
} from "~/server/storage";

type CleanupDependencies = {
  prisma?: typeof db;
  getStorageClient?: StorageClientFactory;
  now?: () => Date;
};

export async function cleanupUploadStaging(
  dependencies: CleanupDependencies = {},
) {
  const prisma = dependencies.prisma ?? db;
  const getStorageClient = dependencies.getStorageClient ?? createStorageClient;
  const now = dependencies.now?.() ?? new Date();
  const eligible = {
    OR: [
      { status: "PENDING" as const, expiresAt: { lt: now } },
      { status: "FAILED" as const },
    ],
  };
  const intents = await prisma.uploadIntent.findMany({
    where: eligible,
    select: { id: true, stagingBucket: true, stagingPath: true },
  });

  let deleted = 0;
  let expired = 0;
  let failed = 0;

  for (const intent of intents) {
    try {
      const { error } = await getStorageClient()
        .storage.from(intent.stagingBucket)
        .remove([intent.stagingPath]);
      if (error) throw error;
      deleted += 1;

      const result = await prisma.uploadIntent.updateMany({
        where: { id: intent.id, ...eligible },
        data: { status: "EXPIRED" },
      });
      expired += result.count;
    } catch (error) {
      failed += 1;
      console.error("Upload staging cleanup failed", error);
    }
  }

  return { selected: intents.length, deleted, expired, failed };
}
