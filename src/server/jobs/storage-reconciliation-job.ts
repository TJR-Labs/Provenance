import type { PrismaClient } from "../../../generated/prisma";

import { db } from "~/server/db";
import type { StorageClientFactory } from "~/server/storage";
import { countAbandonedUploadStaging } from "~/server/upload-staging-cleanup";
import { countPendingStorageDeletions } from "~/server/storage-deletions";
import { reconcileStorage } from "~/server/storage-reconciliation";

// This job does two sequential sub-steps per invocation (pending-deletion
// reconciliation, each row a DB transaction plus a Storage call; then
// abandoned-staging cleanup, each row a Storage call plus a DB update). Both
// are capped to this many oldest-eligible rows so the pair comfortably fits
// Vercel Hobby's 10s function timeout even at ~300-400ms per row; a backlog
// beyond the cap is finished by the next day's run.
export const STORAGE_RECONCILIATION_BATCH_SIZE = 10;

type StorageReconciliationJobDependencies = {
  prisma?: PrismaClient;
  getStorageClient?: StorageClientFactory;
  now?: () => Date;
};

export async function runStorageReconciliation(
  batchSize: number,
  dependencies: StorageReconciliationJobDependencies = {},
) {
  const prisma = dependencies.prisma ?? db;
  const result = await reconcileStorage({ ...dependencies, take: batchSize });
  const remaining =
    (await countPendingStorageDeletions({ prisma })) +
    (await countAbandonedUploadStaging(dependencies));
  return { ...result, remaining };
}
