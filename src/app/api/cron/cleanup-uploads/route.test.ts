import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runUploadCleanup = vi.hoisted(() => vi.fn());

vi.mock("~/env", () => ({ env: { CRON_SECRET: "test-secret" } }));
vi.mock("~/server/jobs/upload-cleanup", () => ({
  runUploadCleanup,
  UPLOAD_CLEANUP_BATCH_SIZE: 25,
}));

import { GET } from "./route";

function request(authorization?: string) {
  return new Request("http://localhost/api/cron/cleanup-uploads", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  runUploadCleanup.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/cron/cleanup-uploads", () => {
  it("returns 401 and does not run cleanup without a valid bearer token", async () => {
    const response = await GET(request("Bearer wrong-secret"));
    expect(response.status).toBe(401);
    expect(runUploadCleanup).not.toHaveBeenCalled();
  });

  it("returns processed/remaining counts for a populated backlog", async () => {
    runUploadCleanup.mockResolvedValue({
      selected: 3,
      deleted: 3,
      expired: 2,
      failed: 0,
      remaining: 7,
    });

    const response = await GET(request("Bearer test-secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      processed: 3,
      remaining: 7,
    });
    expect(runUploadCleanup).toHaveBeenCalledWith(25);
  });

  it("returns a zero-count success when there is nothing to clean up", async () => {
    runUploadCleanup.mockResolvedValue({
      selected: 0,
      deleted: 0,
      expired: 0,
      failed: 0,
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
    runUploadCleanup.mockResolvedValue({
      selected: 2,
      deleted: 1,
      expired: 1,
      failed: 1,
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
