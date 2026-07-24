import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

const reconcileStorage = vi.hoisted(() => vi.fn());
const countPendingStorageDeletions = vi.hoisted(() => vi.fn());
const countAbandonedUploadStaging = vi.hoisted(() => vi.fn());

vi.mock("~/server/storage-reconciliation", () => ({ reconcileStorage }));
vi.mock("~/server/storage-deletions", () => ({ countPendingStorageDeletions }));
vi.mock("~/server/upload-staging-cleanup", () => ({
  countAbandonedUploadStaging,
}));

import { runStorageReconciliation } from "~/server/jobs/storage-reconciliation-job";

describe("runStorageReconciliation", () => {
  it("forwards batchSize as take and sums remaining across both sub-steps", async () => {
    reconcileStorage.mockResolvedValue({
      pendingDeletions: {
        selected: 2,
        deleted: 2,
        referenced: 0,
        missing: 0,
        failed: 0,
      },
      abandonedStaging: { selected: 1, deleted: 1, expired: 1, failed: 0 },
    });
    countPendingStorageDeletions.mockResolvedValue(3);
    countAbandonedUploadStaging.mockResolvedValue(2);

    const result = await runStorageReconciliation(10);

    expect(result).toEqual({
      pendingDeletions: {
        selected: 2,
        deleted: 2,
        referenced: 0,
        missing: 0,
        failed: 0,
      },
      abandonedStaging: { selected: 1, deleted: 1, expired: 1, failed: 0 },
      remaining: 5,
    });
    expect(reconcileStorage).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });

  it("returns a zero-count success when there is nothing to reconcile", async () => {
    reconcileStorage.mockResolvedValue({
      pendingDeletions: {
        selected: 0,
        deleted: 0,
        referenced: 0,
        missing: 0,
        failed: 0,
      },
      abandonedStaging: { selected: 0, deleted: 0, expired: 0, failed: 0 },
    });
    countPendingStorageDeletions.mockResolvedValue(0);
    countAbandonedUploadStaging.mockResolvedValue(0);

    const result = await runStorageReconciliation(10);

    expect(result.remaining).toBe(0);
  });
});
