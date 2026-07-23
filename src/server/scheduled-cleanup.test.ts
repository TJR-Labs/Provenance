import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import {
  cleanupSecurityAndOAuthRows,
  LIMITER_STALE_RETENTION_MS,
} from "~/server/scheduled-cleanup";

describe("cleanupSecurityAndOAuthRows", () => {
  it("deletes only inactive stale limiters and expired OAuth flow rows", async () => {
    const now = new Date("2026-07-22T18:00:00.000Z");
    const staleBefore = new Date(now.getTime() - LIMITER_STALE_RETENTION_MS);
    const prisma = {
      rateLimitAttempt: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
      loginAttempt: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
      pendingOAuthSignup: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      oAuthLinkIntent: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };

    await expect(
      cleanupSecurityAndOAuthRows({ prisma: prisma as never, now: () => now }),
    ).resolves.toEqual({
      rateLimitAttemptsDeleted: 4,
      loginAttemptsDeleted: 3,
      pendingOAuthSignupsDeleted: 2,
      oAuthLinkIntentsDeleted: 1,
    });

    expect(prisma.rateLimitAttempt.deleteMany).toHaveBeenCalledWith({
      where: {
        windowStart: { lt: staleBefore },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
    });
    expect(prisma.loginAttempt.deleteMany).toHaveBeenCalledWith({
      where: {
        firstFailedAt: { lt: staleBefore },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
    });
    expect(prisma.pendingOAuthSignup.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
    expect(prisma.oAuthLinkIntent.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
  });
});
