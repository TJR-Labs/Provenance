import { TRPCError } from "@trpc/server";

import type { PrismaClient } from "../../generated/prisma";
import { db } from "~/server/db";

export type RateLimitDelegate = Pick<
  PrismaClient["rateLimitAttempt"],
  "findUnique" | "upsert" | "deleteMany"
> & {
  [RATE_LIMIT_ATOMIC_UPDATE]?: AtomicRateLimitUpdate;
};

export interface RateLimitConfig {
  /** Namespaces the limiter, e.g. "signup", "report", "change-password". */
  scope: string;
  /** Identifies the caller within the scope: an IP address or a user id. */
  key: string;
  /** How many attempts are allowed within the rolling window. */
  limit: number;
  /** Length of the rolling window, in milliseconds. */
  windowMs: number;
  /** How long a caller stays locked out once the limit is reached, in milliseconds. */
  lockoutMs: number;
  /** Message returned to the client once locked out. */
  message?: string;
}

const DEFAULT_MESSAGE = "Too many requests. Please try again later.";

type RateLimitUpdateMode = "consume" | "failure";

interface AtomicRateLimitResult {
  allowed: boolean;
  count: number;
  lockedUntil: Date | null;
}

type AtomicRateLimitUpdate = (
  config: Omit<RateLimitConfig, "message">,
  mode: RateLimitUpdateMode,
) => Promise<AtomicRateLimitResult>;

/** Dependency-injection seam for unit tests; production delegates use Postgres. */
export const RATE_LIMIT_ATOMIC_UPDATE = Symbol("rate-limit-atomic-update");

function tooManyRequests(message?: string): never {
  throw new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: message ?? DEFAULT_MESSAGE,
  });
}

async function updateRateLimitAtomically(
  config: Omit<RateLimitConfig, "message">,
  mode: RateLimitUpdateMode,
  rateLimits: RateLimitDelegate,
): Promise<AtomicRateLimitResult> {
  const injectedUpdate = rateLimits[RATE_LIMIT_ATOMIC_UPDATE];
  if (injectedUpdate) return injectedUpdate(config, mode);

  const { scope, key, limit, windowMs, lockoutMs } = config;
  const resetAfterLock = mode === "failure";
  const rows = await db.$queryRaw<AtomicRateLimitResult[]>`
    WITH updated AS (
      INSERT INTO "RateLimitAttempt" AS current_attempt
        ("scope", "key", "count", "windowStart", "lockedUntil")
      VALUES (
        ${scope},
        ${key},
        1,
        CURRENT_TIMESTAMP,
        CASE
          WHEN 1 >= ${limit}
            THEN CURRENT_TIMESTAMP + (${lockoutMs} * INTERVAL '1 millisecond')
          ELSE NULL
        END
      )
      ON CONFLICT ("scope", "key") DO UPDATE SET
        "count" = CASE
          WHEN current_attempt."lockedUntil" > CURRENT_TIMESTAMP
            THEN current_attempt."count"
          WHEN (
            (${resetAfterLock} AND current_attempt."lockedUntil" IS NOT NULL)
            OR CURRENT_TIMESTAMP >= current_attempt."windowStart"
              + (${windowMs} * INTERVAL '1 millisecond')
          ) THEN 1
          ELSE current_attempt."count" + 1
        END,
        "windowStart" = CASE
          WHEN current_attempt."lockedUntil" > CURRENT_TIMESTAMP
            THEN current_attempt."windowStart"
          WHEN (
            (${resetAfterLock} AND current_attempt."lockedUntil" IS NOT NULL)
            OR CURRENT_TIMESTAMP >= current_attempt."windowStart"
              + (${windowMs} * INTERVAL '1 millisecond')
          ) THEN CURRENT_TIMESTAMP
          ELSE current_attempt."windowStart"
        END,
        "lockedUntil" = CASE
          WHEN current_attempt."lockedUntil" > CURRENT_TIMESTAMP
            THEN current_attempt."lockedUntil"
          WHEN (
            CASE
              WHEN (
                (${resetAfterLock} AND current_attempt."lockedUntil" IS NOT NULL)
                OR CURRENT_TIMESTAMP >= current_attempt."windowStart"
                  + (${windowMs} * INTERVAL '1 millisecond')
              ) THEN 1
              ELSE current_attempt."count" + 1
            END
          ) >= ${limit}
            THEN CURRENT_TIMESTAMP + (${lockoutMs} * INTERVAL '1 millisecond')
          ELSE NULL
        END
      RETURNING "count", "lockedUntil"
    )
    SELECT
      "count",
      "lockedUntil",
      ("lockedUntil" IS NULL AND "count" < ${limit}) AS "allowed"
    FROM updated
  `;

  const result = rows[0];
  if (!result) throw new Error("Atomic rate-limit update returned no row.");
  return result;
}

/**
 * Enforces a rate limit that counts *every* call within a rolling window,
 * regardless of whether the call goes on to succeed or fail. Used where
 * every attempt itself is the thing being throttled (e.g. signups per IP,
 * reports per user).
 *
 * Postgres decides and records the result in one upsert statement, so
 * concurrent calls for the same scope/key serialize on the unique row.
 * Throws `TOO_MANY_REQUESTS` if this call is already locked out, or if it is
 * the call that reaches/exceeds the limit.
 */
export async function consumeRateLimit(
  config: RateLimitConfig,
  rateLimits: RateLimitDelegate = db.rateLimitAttempt,
): Promise<void> {
  const { scope, key, limit, windowMs, lockoutMs, message } = config;
  const result = await updateRateLimitAtomically(
    { scope, key, limit, windowMs, lockoutMs },
    "consume",
    rateLimits,
  );
  if (!result.allowed) tooManyRequests(message);
}

/**
 * Throws `TOO_MANY_REQUESTS` if scope/key is currently locked out, without
 * recording anything. Used to gate a failure-based check (e.g. verifying a
 * password) before it runs.
 */
export async function assertNotLockedOut(
  scope: string,
  key: string,
  rateLimits: RateLimitDelegate = db.rateLimitAttempt,
  message?: string,
): Promise<void> {
  const existing = await rateLimits.findUnique({
    where: { scope_key: { scope, key } },
  });
  if (existing?.lockedUntil && existing.lockedUntil > new Date()) {
    tooManyRequests(message);
  }
}

/**
 * Records a failed attempt for a failure-based lockout, mirroring the
 * existing `LoginAttempt` semantics: consecutive failures within a rolling
 * window accumulate, and once `limit` is reached the scope/key is locked
 * for `lockoutMs`. A window that has expired (and wasn't already locked)
 * starts over at count 1. Does not throw itself — call `assertNotLockedOut`
 * beforehand to reject already-locked callers.
 */
export async function recordRateLimitFailure(
  config: Omit<RateLimitConfig, "message">,
  rateLimits: RateLimitDelegate = db.rateLimitAttempt,
): Promise<void> {
  await updateRateLimitAtomically(config, "failure", rateLimits);
}

/** Clears any rate-limit state for scope/key, e.g. after a successful attempt. */
export async function resetRateLimit(
  scope: string,
  key: string,
  rateLimits: RateLimitDelegate = db.rateLimitAttempt,
): Promise<void> {
  await rateLimits.deleteMany({ where: { scope, key } });
}

/**
 * Resolves the caller's IP address from trusted proxy headers. On Vercel,
 * uses the final `x-forwarded-for` entry; elsewhere that header is ignored.
 * Falls back to `x-real-ip`, then to a single shared "unknown" bucket rather
 * than throwing, so signup never breaks because of a missing header.
 */
export function resolveClientIp(headers: Headers): string {
  if (process.env.VERCEL === "1") {
    const forwardedFor = headers.get("x-forwarded-for");
    if (forwardedFor) {
      // Vercel appends its trusted client address at the proxy boundary.
      // Earlier entries may be client-supplied, so only the final value is
      // authoritative.
      const last = forwardedFor.split(",").at(-1)?.trim();
      if (last) return last;
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}
