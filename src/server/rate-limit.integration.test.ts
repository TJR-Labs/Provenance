import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "~/server/db";
import { recordLoginFailure } from "~/server/login-attempts";
import { consumeRateLimit, recordRateLimitFailure } from "~/server/rate-limit";

const runId = randomUUID();
const integrationScope = `integration-rate-limit-${runId}`;
const loginUsername = `integration-login-${runId}`;
let databaseAvailable = false;

function isExplicitlyIsolatedTestDatabase() {
  if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "true") return true;
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return false;

  try {
    const url = new URL(rawUrl);
    return /(?:^|[-_.\/])(test|ci)(?:$|[-_.\/])/i.test(
      `${url.hostname}${url.pathname}`,
    );
  } catch {
    return false;
  }
}

beforeAll(async () => {
  if (process.env.NODE_ENV !== "test" || !isExplicitlyIsolatedTestDatabase()) {
    return;
  }
  try {
    await db.$queryRaw`SELECT 1`;
    databaseAvailable = true;
  } catch {
    // Unit-only environments intentionally skip these live-Postgres checks.
  }
});

afterAll(async () => {
  if (!databaseAvailable) return;
  await Promise.all([
    db.rateLimitAttempt.deleteMany({
      where: { scope: integrationScope },
    }),
    db.loginAttempt.deleteMany({ where: { username: loginUsername } }),
  ]);
});

describe("atomic rate limiting against Postgres", () => {
  it("never allows parallel count-every-attempt calls past the threshold", async (context) => {
    if (!databaseAvailable) {
      context.skip(
        "DATABASE_URL did not provide an explicitly isolated, reachable Postgres test database",
      );
      return;
    }

    const limit = 12;
    const attempts = 64;
    const key = "parallel-consume";
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () =>
        consumeRateLimit({
          scope: integrationScope,
          key,
          limit,
          windowMs: 15 * 60 * 1000,
          lockoutMs: 15 * 60 * 1000,
        }),
      ),
    );
    const allowed = results.filter(
      (result) => result.status === "fulfilled",
    ).length;

    // This limiter rejects the statement that reaches the threshold, so the
    // exact bound is limit - 1; the single atomic upsert needs no tolerance.
    expect(allowed).toBe(limit - 1);
    expect(allowed).toBeLessThanOrEqual(limit - 1);

    await expect(
      db.rateLimitAttempt.findUniqueOrThrow({
        where: { scope_key: { scope: integrationScope, key } },
      }),
    ).resolves.toMatchObject({ count: limit });
  }, 30_000);

  it("preserves the lock when parallel failure records cross the threshold", async (context) => {
    if (!databaseAvailable) {
      context.skip(
        "DATABASE_URL did not provide an explicitly isolated, reachable Postgres test database",
      );
      return;
    }

    const limit = 10;
    const key = "parallel-failure";
    await Promise.all(
      Array.from({ length: 48 }, () =>
        recordRateLimitFailure({
          scope: integrationScope,
          key,
          limit,
          windowMs: 15 * 60 * 1000,
          lockoutMs: 15 * 60 * 1000,
        }),
      ),
    );

    const row = await db.rateLimitAttempt.findUniqueOrThrow({
      where: { scope_key: { scope: integrationScope, key } },
    });
    expect(row.count).toBe(limit);
    expect(row.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
  }, 30_000);

  it("serializes parallel LoginAttempt failures by username", async (context) => {
    if (!databaseAvailable) {
      context.skip(
        "DATABASE_URL did not provide an explicitly isolated, reachable Postgres test database",
      );
      return;
    }

    const threshold = 10;
    await Promise.all(
      Array.from({ length: 48 }, () =>
        recordLoginFailure(loginUsername, {
          threshold,
          windowMs: 15 * 60 * 1000,
          lockoutMs: 15 * 60 * 1000,
        }),
      ),
    );

    const row = await db.loginAttempt.findUniqueOrThrow({
      where: { username: loginUsername },
    });
    expect(row.failedCount).toBe(threshold);
    expect(row.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
  }, 30_000);
});
