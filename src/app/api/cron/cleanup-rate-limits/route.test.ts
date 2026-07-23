import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runRateLimitCleanup = vi.hoisted(() => vi.fn());

vi.mock("~/env", () => ({ env: { CRON_SECRET: "test-secret" } }));
vi.mock("~/server/jobs/rate-limit-cleanup", () => ({
  runRateLimitCleanup,
  RATE_LIMIT_CLEANUP_BATCH_SIZE: 500,
}));

import { GET } from "./route";

function request(authorization?: string) {
  return new Request("http://localhost/api/cron/cleanup-rate-limits", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  runRateLimitCleanup.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/cron/cleanup-rate-limits", () => {
  it("returns 401 and does not run cleanup when the bearer token is missing or wrong", async () => {
    const response = await GET(request("Bearer wrong-secret"));
    expect(response.status).toBe(401);
    expect(runRateLimitCleanup).not.toHaveBeenCalled();

    const noHeader = await GET(request());
    expect(noHeader.status).toBe(401);
    expect(runRateLimitCleanup).not.toHaveBeenCalled();
  });

  it("returns processed/remaining counts for a populated backlog with a valid token", async () => {
    runRateLimitCleanup.mockResolvedValue({
      rateLimitAttemptsDeleted: 2,
      loginAttemptsDeleted: 1,
      pendingOAuthSignupsDeleted: 0,
      oAuthLinkIntentsDeleted: 0,
      passwordResetTokensDeleted: 0,
      emailVerificationTokensDeleted: 0,
      anonymizedReportsDeleted: 0,
      remaining: 4,
    });

    const response = await GET(request("Bearer test-secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      processed: 3,
      remaining: 4,
    });
    expect(runRateLimitCleanup).toHaveBeenCalledWith(500);
  });

  it("returns a zero-count success when there is nothing to clean up", async () => {
    runRateLimitCleanup.mockResolvedValue({
      rateLimitAttemptsDeleted: 0,
      loginAttemptsDeleted: 0,
      pendingOAuthSignupsDeleted: 0,
      oAuthLinkIntentsDeleted: 0,
      passwordResetTokensDeleted: 0,
      emailVerificationTokensDeleted: 0,
      anonymizedReportsDeleted: 0,
      remaining: 0,
    });

    const response = await GET(request("Bearer test-secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      processed: 0,
      remaining: 0,
    });
  });
});
