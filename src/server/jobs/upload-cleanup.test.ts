import { describe, expect, it, vi } from "vitest";

const cleanupUploadStaging = vi.hoisted(() => vi.fn());
const countAbandonedUploadStaging = vi.hoisted(() => vi.fn());

vi.mock("~/server/upload-staging-cleanup", () => ({
  cleanupUploadStaging,
  countAbandonedUploadStaging,
}));

import { runUploadCleanup } from "~/server/jobs/upload-cleanup";

describe("runUploadCleanup", () => {
  it("forwards batchSize as take and reports processed/remaining for a populated backlog", async () => {
    cleanupUploadStaging.mockResolvedValue({
      selected: 3,
      deleted: 3,
      expired: 2,
      failed: 0,
    });
    countAbandonedUploadStaging.mockResolvedValue(7);
    const dependencies = { now: () => new Date("2026-07-22T12:00:00.000Z") };

    await expect(runUploadCleanup(25, dependencies)).resolves.toEqual({
      selected: 3,
      deleted: 3,
      expired: 2,
      failed: 0,
      remaining: 7,
    });

    expect(cleanupUploadStaging).toHaveBeenCalledWith({
      ...dependencies,
      take: 25,
    });
    expect(countAbandonedUploadStaging).toHaveBeenCalledWith(dependencies);
  });

  it("returns a zero-count success when there is nothing to clean up", async () => {
    cleanupUploadStaging.mockResolvedValue({
      selected: 0,
      deleted: 0,
      expired: 0,
      failed: 0,
    });
    countAbandonedUploadStaging.mockResolvedValue(0);

    await expect(runUploadCleanup(25)).resolves.toEqual({
      selected: 0,
      deleted: 0,
      expired: 0,
      failed: 0,
      remaining: 0,
    });
  });
});
