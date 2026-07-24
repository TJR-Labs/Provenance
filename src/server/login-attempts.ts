import type { PrismaClient } from "../../generated/prisma";
import { db } from "~/server/db";

export interface LoginFailureConfig {
  threshold: number;
  windowMs: number;
  lockoutMs: number;
}

type LoginAttemptSqlClient = Pick<PrismaClient, "$queryRaw">;

/**
 * Records one credentials failure in a single Postgres statement. The
 * username primary key serializes concurrent updates, and an active lock is
 * never cleared by failures that were already in flight when the threshold
 * was reached.
 */
export async function recordLoginFailure(
  username: string,
  config: LoginFailureConfig,
  prisma: LoginAttemptSqlClient = db,
): Promise<void> {
  const { threshold, windowMs, lockoutMs } = config;
  const rows = await prisma.$queryRaw<Array<{ failedCount: number }>>`
    INSERT INTO "LoginAttempt" AS current_attempt
      ("username", "failedCount", "firstFailedAt", "lockedUntil")
    VALUES (
      ${username},
      1,
      CURRENT_TIMESTAMP,
      CASE
        WHEN 1 >= ${threshold}
          THEN CURRENT_TIMESTAMP + (${lockoutMs} * INTERVAL '1 millisecond')
        ELSE NULL
      END
    )
    ON CONFLICT ("username") DO UPDATE SET
      "failedCount" = CASE
        WHEN current_attempt."lockedUntil" > CURRENT_TIMESTAMP
          THEN current_attempt."failedCount"
        WHEN (
          current_attempt."lockedUntil" IS NOT NULL
          OR CURRENT_TIMESTAMP >= current_attempt."firstFailedAt"
            + (${windowMs} * INTERVAL '1 millisecond')
        ) THEN 1
        ELSE current_attempt."failedCount" + 1
      END,
      "firstFailedAt" = CASE
        WHEN current_attempt."lockedUntil" > CURRENT_TIMESTAMP
          THEN current_attempt."firstFailedAt"
        WHEN (
          current_attempt."lockedUntil" IS NOT NULL
          OR CURRENT_TIMESTAMP >= current_attempt."firstFailedAt"
            + (${windowMs} * INTERVAL '1 millisecond')
        ) THEN CURRENT_TIMESTAMP
        ELSE current_attempt."firstFailedAt"
      END,
      "lockedUntil" = CASE
        WHEN current_attempt."lockedUntil" > CURRENT_TIMESTAMP
          THEN current_attempt."lockedUntil"
        WHEN (
          CASE
            WHEN (
              current_attempt."lockedUntil" IS NOT NULL
              OR CURRENT_TIMESTAMP >= current_attempt."firstFailedAt"
                + (${windowMs} * INTERVAL '1 millisecond')
            ) THEN 1
            ELSE current_attempt."failedCount" + 1
          END
        ) >= ${threshold}
          THEN CURRENT_TIMESTAMP + (${lockoutMs} * INTERVAL '1 millisecond')
        ELSE NULL
      END
    RETURNING "failedCount"
  `;

  if (!rows[0]) throw new Error("Atomic login-attempt update returned no row.");
}
