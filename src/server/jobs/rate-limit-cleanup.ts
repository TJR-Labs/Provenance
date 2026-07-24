import { db } from "~/server/db";

export const LIMITER_STALE_RETENTION_MS = 24 * 60 * 60 * 1000;
export const ANONYMIZED_REPORT_RETENTION_MS = 730 * 24 * 60 * 60 * 1000;

// Runs unattended on Vercel Hobby's 10s function timeout. Each of the 7
// deletes below targets an indexed column and is capped to this many rows,
// oldest-first, per invocation — comfortably sub-second per table even at
// the cap, leaving headroom well inside 10s. A backlog beyond the cap is
// picked up, oldest rows first, by the next day's run (see requirement 6).
export const RATE_LIMIT_CLEANUP_BATCH_SIZE = 500;

type ScheduledCleanupDatabase = Pick<
  typeof db,
  | "rateLimitAttempt"
  | "loginAttempt"
  | "pendingOAuthSignup"
  | "oAuthLinkIntent"
  | "passwordResetToken"
  | "emailVerificationToken"
  | "report"
>;

interface RateLimitCleanupDependencies {
  prisma?: ScheduledCleanupDatabase;
  now?: () => Date;
}

async function batchDeleteOldest<Row>(params: {
  findOldest: () => Promise<Row[]>;
  deleteRows: (rows: Row[]) => Promise<{ count: number }>;
  countRemaining: () => Promise<number>;
}): Promise<{ deleted: number; remaining: number }> {
  const rows = await params.findOldest();
  if (rows.length === 0) {
    return { deleted: 0, remaining: await params.countRemaining() };
  }
  const { count } = await params.deleteRows(rows);
  return { deleted: count, remaining: await params.countRemaining() };
}

/**
 * Removes expired OAuth flow rows and limiter rows that have been inactive
 * for at least a day. The retention is longer than every current limiter
 * window/lockout, and active future locks are always retained.
 *
 * Bounded to `batchSize` oldest-eligible rows per table per call so a single
 * invocation fits Vercel Hobby's 10s function timeout; a backlog beyond the
 * cap is finished by subsequent runs (see requirement 6 in the spec).
 */
export async function runRateLimitCleanup(
  batchSize: number,
  dependencies: RateLimitCleanupDependencies = {},
) {
  const prisma = dependencies.prisma ?? db;
  const now = dependencies.now?.() ?? new Date();
  const staleBefore = new Date(now.getTime() - LIMITER_STALE_RETENTION_MS);
  const reportsBefore = new Date(
    now.getTime() - ANONYMIZED_REPORT_RETENTION_MS,
  );

  const rateLimitAttemptWhere = {
    windowStart: { lt: staleBefore },
    OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
  };
  const rateLimitAttempts = await batchDeleteOldest({
    findOldest: () =>
      prisma.rateLimitAttempt.findMany({
        where: rateLimitAttemptWhere,
        select: { scope: true, key: true },
        orderBy: { windowStart: "asc" },
        take: batchSize,
      }),
    deleteRows: (rows) =>
      prisma.rateLimitAttempt.deleteMany({
        where: { OR: rows.map((row) => ({ scope: row.scope, key: row.key })) },
      }),
    countRemaining: () => prisma.rateLimitAttempt.count({ where: rateLimitAttemptWhere }),
  });

  const loginAttemptWhere = {
    firstFailedAt: { lt: staleBefore },
    OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
  };
  const loginAttempts = await batchDeleteOldest({
    findOldest: () =>
      prisma.loginAttempt.findMany({
        where: loginAttemptWhere,
        select: { username: true },
        orderBy: { firstFailedAt: "asc" },
        take: batchSize,
      }),
    deleteRows: (rows) =>
      prisma.loginAttempt.deleteMany({
        where: { username: { in: rows.map((row) => row.username) } },
      }),
    countRemaining: () => prisma.loginAttempt.count({ where: loginAttemptWhere }),
  });

  const pendingOAuthSignupWhere = { expiresAt: { lt: now } };
  const pendingOAuthSignups = await batchDeleteOldest({
    findOldest: () =>
      prisma.pendingOAuthSignup.findMany({
        where: pendingOAuthSignupWhere,
        select: { id: true },
        orderBy: { expiresAt: "asc" },
        take: batchSize,
      }),
    deleteRows: (rows) =>
      prisma.pendingOAuthSignup.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      }),
    countRemaining: () =>
      prisma.pendingOAuthSignup.count({ where: pendingOAuthSignupWhere }),
  });

  const oAuthLinkIntentWhere = { expiresAt: { lt: now } };
  const oAuthLinkIntents = await batchDeleteOldest({
    findOldest: () =>
      prisma.oAuthLinkIntent.findMany({
        where: oAuthLinkIntentWhere,
        select: { id: true },
        orderBy: { expiresAt: "asc" },
        take: batchSize,
      }),
    deleteRows: (rows) =>
      prisma.oAuthLinkIntent.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      }),
    countRemaining: () =>
      prisma.oAuthLinkIntent.count({ where: oAuthLinkIntentWhere }),
  });

  const passwordResetTokenWhere = { expiresAt: { lt: now } };
  const passwordResetTokens = await batchDeleteOldest({
    findOldest: () =>
      prisma.passwordResetToken.findMany({
        where: passwordResetTokenWhere,
        select: { id: true },
        orderBy: { expiresAt: "asc" },
        take: batchSize,
      }),
    deleteRows: (rows) =>
      prisma.passwordResetToken.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      }),
    countRemaining: () =>
      prisma.passwordResetToken.count({ where: passwordResetTokenWhere }),
  });

  const emailVerificationTokenWhere = { expiresAt: { lt: now } };
  const emailVerificationTokens = await batchDeleteOldest({
    findOldest: () =>
      prisma.emailVerificationToken.findMany({
        where: emailVerificationTokenWhere,
        select: { id: true },
        orderBy: { expiresAt: "asc" },
        take: batchSize,
      }),
    deleteRows: (rows) =>
      prisma.emailVerificationToken.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      }),
    countRemaining: () =>
      prisma.emailVerificationToken.count({ where: emailVerificationTokenWhere }),
  });

  const reportWhere = {
    reporterId: null,
    createdAt: { lt: reportsBefore },
  };
  const anonymizedReports = await batchDeleteOldest({
    findOldest: () =>
      prisma.report.findMany({
        where: reportWhere,
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: batchSize,
      }),
    deleteRows: (rows) =>
      prisma.report.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      }),
    countRemaining: () => prisma.report.count({ where: reportWhere }),
  });

  return {
    rateLimitAttemptsDeleted: rateLimitAttempts.deleted,
    loginAttemptsDeleted: loginAttempts.deleted,
    pendingOAuthSignupsDeleted: pendingOAuthSignups.deleted,
    oAuthLinkIntentsDeleted: oAuthLinkIntents.deleted,
    passwordResetTokensDeleted: passwordResetTokens.deleted,
    emailVerificationTokensDeleted: emailVerificationTokens.deleted,
    anonymizedReportsDeleted: anonymizedReports.deleted,
    remaining:
      rateLimitAttempts.remaining +
      loginAttempts.remaining +
      pendingOAuthSignups.remaining +
      oAuthLinkIntents.remaining +
      passwordResetTokens.remaining +
      emailVerificationTokens.remaining +
      anonymizedReports.remaining,
  };
}
