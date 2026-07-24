import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runStorageReconciliation = vi.hoisted(() => vi.fn());

vi.mock("~/env", () => ({ env: { CRON_SECRET: "test-secret" } }));
vi.mock("~/server/jobs/storage-reconciliation-job", () => ({
  runStorageReconciliation,
  STORAGE_RECONCILIATION_BATCH_SIZE: 10,
}));

import { GET } from "./route";

function request(authorization?: string) {
  return new Request("http://localhost/api/cron/storage-reconcile", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  runStorageReconciliation.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/cron/storage-reconcile", () => {
  it("returns 401 and does not run reconciliation without a valid bearer token", async () => {
    const response = await GET(request("Bearer wrong-secret"));
    expect(response.status).toBe(401);
    expect(runStorageReconciliation).not.toHaveBeenCalled();
  });

  it("returns processed/remaining counts for a populated backlog", async () => {
    runStorageReconciliation.mockResolvedValue({
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

    const response = await GET(request("Bearer test-secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      processed: 3,
      remaining: 5,
    });
    expect(runStorageReconciliation).toHaveBeenCalledWith(10);
  });

  it("returns a zero-count success when there is nothing to reconcile", async () => {
    runStorageReconciliation.mockResolvedValue({
      pendingDeletions: {
        selected: 0,
        deleted: 0,
        referenced: 0,
        missing: 0,
        failed: 0,
      },
      abandonedStaging: { selected: 0, deleted: 0, expired: 0, failed: 0 },
      remaining: 0,
    });

    const response = await GET(request("Bearer test-secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      processed: 0,
      remaining: 0,
    });
  });

  it("returns a non-200 status when a row fails mid-batch", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    runStorageReconciliation.mockResolvedValue({
      pendingDeletions: {
        selected: 2,
        deleted: 1,
        referenced: 0,
        missing: 0,
        failed: 1,
      },
      abandonedStaging: { selected: 0, deleted: 0, expired: 0, failed: 0 },
      remaining: 0,
    });

    const response = await GET(request("Bearer test-secret"));

    expect(response.status).not.toBe(200);
    await expect(response.json()).resolves.toEqual({
      processed: 1,
      remaining: 0,
    });
    expect(log).toHaveBeenCalledOnce();
  });
});
