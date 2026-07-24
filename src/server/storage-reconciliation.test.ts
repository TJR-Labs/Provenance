import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/storage", () => ({ createStorageClient: vi.fn() }));

import {
  getStorageReport,
  RECONCILIATION_FAILURE_THRESHOLD,
} from "~/server/storage-reconciliation";

describe("getStorageReport", () => {
  it("returns aggregate operational counts without object or secret details", async () => {
    const uploadIntent = {
      aggregate: vi.fn(async () => ({ _sum: { resultByteSize: 1234 } })),
      count: vi.fn(async () => 7),
    };
    const pendingStorageDeletion = {
      count: vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(2),
    };

    const report = await getStorageReport({
      prisma: { uploadIntent, pendingStorageDeletion } as never,
      now: () => new Date("2026-07-22T12:00:00.000Z"),
    });

    expect(report).toEqual({
      totalOwnedBytes: 1234,
      pendingDeletions: 3,
      abandonedStagingObjects: 7,
      reconciliationFailures: 2,
      failureThreshold: RECONCILIATION_FAILURE_THRESHOLD,
    });
    expect(JSON.stringify(report)).not.toContain("service-role");
    expect(pendingStorageDeletion.count).toHaveBeenLastCalledWith({
      where: { attempts: { gte: RECONCILIATION_FAILURE_THRESHOLD } },
    });
  });
});
