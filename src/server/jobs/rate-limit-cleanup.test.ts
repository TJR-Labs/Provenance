import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import {
  ANONYMIZED_REPORT_RETENTION_MS,
  LIMITER_STALE_RETENTION_MS,
  runRateLimitCleanup,
} from "~/server/jobs/rate-limit-cleanup";

function delegate(rows: unknown[], deleteCount: number, remaining: number) {
  return {
    findMany: vi.fn().mockResolvedValue(rows),
    deleteMany: vi.fn().mockResolvedValue({ count: deleteCount }),
    count: vi.fn().mockResolvedValue(remaining),
  };
}

describe("runRateLimitCleanup", () => {
  it("deletes only inactive stale limiters and expired OAuth flow rows, bounded to batchSize", async () => {
    const now = new Date("2026-07-22T18:00:00.000Z");
    const staleBefore = new Date(now.getTime() - LIMITER_STALE_RETENTION_MS);
    const reportsBefore = new Date(
      now.getTime() - ANONYMIZED_REPORT_RETENTION_MS,
    );

    const prisma = {
      rateLimitAttempt: delegate(
        [{ scope: "signup", key: "1.2.3.4" }],
        1,
        2,
      ),
      loginAttempt: delegate([{ username: "alice" }], 1, 0),
      pendingOAuthSignup: delegate([{ id: "oauth-1" }], 1, 0),
      oAuthLinkIntent: delegate([{ id: "link-1" }], 1, 0),
      passwordResetToken: delegate([{ id: "reset-1" }], 1, 0),
      emailVerificationToken: delegate([{ id: "verify-1" }], 1, 0),
      report: delegate([{ id: "report-1" }], 1, 3),
    };

    await expect(
      runRateLimitCleanup(500, { prisma: prisma as never, now: () => now }),
    ).resolves.toEqual({
      rateLimitAttemptsDeleted: 1,
      loginAttemptsDeleted: 1,
      pendingOAuthSignupsDeleted: 1,
      oAuthLinkIntentsDeleted: 1,
      passwordResetTokensDeleted: 1,
      emailVerificationTokensDeleted: 1,
      anonymizedReportsDeleted: 1,
      remaining: 5,
    });

    expect(prisma.rateLimitAttempt.findMany).toHaveBeenCalledWith({
      where: {
        windowStart: { lt: staleBefore },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      select: { scope: true, key: true },
      orderBy: { windowStart: "asc" },
      take: 500,
    });
    expect(prisma.rateLimitAttempt.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ scope: "signup", key: "1.2.3.4" }] },
    });
    expect(prisma.report.findMany).toHaveBeenCalledWith({
      where: { reporterId: null, createdAt: { lt: reportsBefore } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
  });

  it("returns zero-count success and skips deleteMany when nothing is eligible", async () => {
    const now = new Date("2026-07-22T18:00:00.000Z");
    const prisma = {
      rateLimitAttempt: delegate([], 0, 0),
      loginAttempt: delegate([], 0, 0),
      pendingOAuthSignup: delegate([], 0, 0),
      oAuthLinkIntent: delegate([], 0, 0),
      passwordResetToken: delegate([], 0, 0),
      emailVerificationToken: delegate([], 0, 0),
      report: delegate([], 0, 0),
    };

    await expect(
      runRateLimitCleanup(500, { prisma: prisma as never, now: () => now }),
    ).resolves.toEqual({
      rateLimitAttemptsDeleted: 0,
      loginAttemptsDeleted: 0,
      pendingOAuthSignupsDeleted: 0,
      oAuthLinkIntentsDeleted: 0,
      passwordResetTokensDeleted: 0,
      emailVerificationTokensDeleted: 0,
      anonymizedReportsDeleted: 0,
      remaining: 0,
    });
    expect(prisma.rateLimitAttempt.deleteMany).not.toHaveBeenCalled();
  });
});
