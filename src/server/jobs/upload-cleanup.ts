import type { db } from "~/server/db";
import type { StorageClientFactory } from "~/server/storage";
import {
  cleanupUploadStaging,
  countAbandonedUploadStaging,
} from "~/server/upload-staging-cleanup";

// Each eligible row costs one Supabase Storage network call plus a DB update,
// processed sequentially. Budgeting ~300ms per row keeps 25 rows well inside
// Vercel Hobby's 10s function timeout; the next day's run continues with the
// oldest remaining rows.
export const UPLOAD_CLEANUP_BATCH_SIZE = 25;

type UploadCleanupDependencies = {
  prisma?: typeof db;
  getStorageClient?: StorageClientFactory;
  now?: () => Date;
};

export async function runUploadCleanup(
  batchSize: number,
  dependencies: UploadCleanupDependencies = {},
) {
  const result = await cleanupUploadStaging({
    ...dependencies,
    take: batchSize,
  });
  const remaining = await countAbandonedUploadStaging(dependencies);
  return { ...result, remaining };
}
