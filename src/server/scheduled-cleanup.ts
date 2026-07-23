import { db } from "~/server/db";

export const LIMITER_STALE_RETENTION_MS = 24 * 60 * 60 * 1000;

type ScheduledCleanupDatabase = Pick<
  typeof db,
  "rateLimitAttempt" | "loginAttempt" | "pendingOAuthSignup" | "oAuthLinkIntent"
>;

interface ScheduledCleanupDependencies {
  prisma?: ScheduledCleanupDatabase;
  now?: () => Date;
}

/**
 * Removes expired OAuth flow rows and limiter rows that have been inactive
 * for at least a day. The retention is longer than every current limiter
 * window/lockout, and active future locks are always retained.
 */
export async function cleanupSecurityAndOAuthRows(
  dependencies: ScheduledCleanupDependencies = {},
) {
  const prisma = dependencies.prisma ?? db;
  const now = dependencies.now?.() ?? new Date();
  const staleBefore = new Date(now.getTime() - LIMITER_STALE_RETENTION_MS);

  const [rateLimits, loginAttempts, pendingOAuthSignups, oAuthLinkIntents] =
    await Promise.all([
      prisma.rateLimitAttempt.deleteMany({
        where: {
          windowStart: { lt: staleBefore },
          OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
      }),
      prisma.loginAttempt.deleteMany({
        where: {
          firstFailedAt: { lt: staleBefore },
          OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
      }),
      prisma.pendingOAuthSignup.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      prisma.oAuthLinkIntent.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
    ]);

  return {
    rateLimitAttemptsDeleted: rateLimits.count,
    loginAttemptsDeleted: loginAttempts.count,
    pendingOAuthSignupsDeleted: pendingOAuthSignups.count,
    oAuthLinkIntentsDeleted: oAuthLinkIntents.count,
  };
}
