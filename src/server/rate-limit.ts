import { TRPCError } from "@trpc/server";

import type { PrismaClient } from "../../generated/prisma";
import { db } from "~/server/db";

export type RateLimitDelegate = Pick<
  PrismaClient["rateLimitAttempt"],
  "findUnique" | "upsert" | "deleteMany"
>;

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

function tooManyRequests(message?: string): never {
  throw new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: message ?? DEFAULT_MESSAGE,
  });
}

/**
 * Enforces a rate limit that counts *every* call within a rolling window,
 * regardless of whether the call goes on to succeed or fail. Used where
 * every attempt itself is the thing being throttled (e.g. signups per IP,
 * reports per user).
 *
 * Mirrors the existing `LoginAttempt` upsert pattern: read the current
 * state, compute the next count/window/lockout, then upsert it. Throws
 * `TOO_MANY_REQUESTS` if this call is already locked out, or if it is the
 * call that reaches/exceeds the limit.
 */
export async function consumeRateLimit(
  config: RateLimitConfig,
  rateLimits: RateLimitDelegate = db.rateLimitAttempt,
): Promise<void> {
  const { scope, key, limit, windowMs, lockoutMs, message } = config;
  const now = new Date();
  const existing = await rateLimits.findUnique({
    where: { scope_key: { scope, key } },
  });

  if (existing?.lockedUntil && existing.lockedUntil > now) {
    tooManyRequests(message);
  }

  const withinWindow =
    !!existing && now.getTime() - existing.windowStart.getTime() < windowMs;
  const count = withinWindow ? existing.count + 1 : 1;
  const windowStart = withinWindow ? existing.windowStart : now;
  const lockedUntil = count >= limit ? new Date(now.getTime() + lockoutMs) : null;

  await rateLimits.upsert({
    where: { scope_key: { scope, key } },
    create: { scope, key, count, windowStart, lockedUntil },
    update: { count, windowStart, lockedUntil },
  });

  if (count >= limit) {
    tooManyRequests(message);
  }
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
  const { scope, key, limit, windowMs, lockoutMs } = config;
  const now = new Date();
  const existing = await rateLimits.findUnique({
    where: { scope_key: { scope, key } },
  });

  const withinWindow =
    !!existing &&
    existing.lockedUntil === null &&
    now.getTime() - existing.windowStart.getTime() < windowMs;
  const count = withinWindow ? existing.count + 1 : 1;
  const windowStart = withinWindow ? existing.windowStart : now;
  const lockedUntil = count >= limit ? new Date(now.getTime() + lockoutMs) : null;

  await rateLimits.upsert({
    where: { scope_key: { scope, key } },
    create: { scope, key, count, windowStart, lockedUntil },
    update: { count, windowStart, lockedUntil },
  });
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
 * Resolves the caller's IP address from standard proxy headers
 * (`x-forwarded-for`, falling back to `x-real-ip`). If neither header is
 * present or parseable — e.g. a direct connection in local dev with no
 * proxy in front of it — degrades safely to a single shared "unknown"
 * bucket rather than throwing, so signup never breaks because of a missing
 * header.
 */
export function resolveClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}
