import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertNotLockedOut,
  consumeRateLimit,
  recordRateLimitFailure,
  resetRateLimit,
  resolveClientIp,
  type RateLimitDelegate,
} from "~/server/rate-limit";

interface RateLimitRow {
  scope: string;
  key: string;
  count: number;
  windowStart: Date;
  lockedUntil: Date | null;
}

function fakeRateLimits(): RateLimitDelegate & {
  rows: Map<string, RateLimitRow>;
} {
  const rows = new Map<string, RateLimitRow>();
  const rowKey = (scope: string, key: string) => `${scope}:${key}`;

  return {
    rows,
    findUnique: vi.fn(
      async ({
        where,
      }: {
        where: { scope_key: { scope: string; key: string } };
      }) => rows.get(rowKey(where.scope_key.scope, where.scope_key.key)) ?? null,
    ) as never,
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { scope_key: { scope: string; key: string } };
        create: RateLimitRow;
        update: Partial<RateLimitRow>;
      }) => {
        const k = rowKey(where.scope_key.scope, where.scope_key.key);
        const existing = rows.get(k);
        const row = existing ? { ...existing, ...update } : create;
        rows.set(k, row);
        return row;
      },
    ) as never,
    deleteMany: vi.fn(
      async ({ where }: { where: { scope: string; key: string } }) => {
        const k = rowKey(where.scope, where.key);
        const deleted = rows.delete(k);
        return { count: deleted ? 1 : 0 };
      },
    ) as never,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("consumeRateLimit (count-every-attempt limiter)", () => {
  const config = {
    scope: "signup",
    key: "203.0.113.1",
    limit: 5,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000,
  };

  it("allows requests under the threshold", async () => {
    const rateLimits = fakeRateLimits();
    for (let i = 0; i < 4; i += 1) {
      await expect(
        consumeRateLimit(config, rateLimits),
      ).resolves.toBeUndefined();
    }
  });

  it("rejects the request that reaches the threshold", async () => {
    const rateLimits = fakeRateLimits();
    for (let i = 0; i < 4; i += 1) {
      await consumeRateLimit(config, rateLimits);
    }
    await expect(consumeRateLimit(config, rateLimits)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("keeps rejecting further requests while locked out", async () => {
    const rateLimits = fakeRateLimits();
    for (let i = 0; i < 5; i += 1) {
      await consumeRateLimit(config, rateLimits).catch(() => undefined);
    }
    await expect(consumeRateLimit(config, rateLimits)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("resets and allows requests again after the lockout window expires", async () => {
    const rateLimits = fakeRateLimits();
    for (let i = 0; i < 5; i += 1) {
      await consumeRateLimit(config, rateLimits).catch(() => undefined);
    }

    vi.setSystemTime(
      new Date(Date.now() + config.windowMs + config.lockoutMs + 1000),
    );

    await expect(
      consumeRateLimit(config, rateLimits),
    ).resolves.toBeUndefined();
  });

  it("tracks separate identifiers (e.g. IPs) independently", async () => {
    const rateLimits = fakeRateLimits();
    for (let i = 0; i < 5; i += 1) {
      await consumeRateLimit(config, rateLimits).catch(() => undefined);
    }

    await expect(
      consumeRateLimit({ ...config, key: "198.51.100.7" }, rateLimits),
    ).resolves.toBeUndefined();
  });
});

describe("failure-based lockout helpers (assertNotLockedOut / recordRateLimitFailure / resetRateLimit)", () => {
  const config = {
    scope: "change-password",
    key: "user-1",
    limit: 10,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000,
  };

  it("does not lock out after a single failure", async () => {
    const rateLimits = fakeRateLimits();
    await recordRateLimitFailure(config, rateLimits);
    await expect(
      assertNotLockedOut(config.scope, config.key, rateLimits),
    ).resolves.toBeUndefined();
  });

  it("locks out after reaching the failure threshold", async () => {
    const rateLimits = fakeRateLimits();
    for (let i = 0; i < 10; i += 1) {
      await recordRateLimitFailure(config, rateLimits);
    }
    await expect(
      assertNotLockedOut(config.scope, config.key, rateLimits),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("clears the lockout and counter on reset (e.g. after a success)", async () => {
    const rateLimits = fakeRateLimits();
    for (let i = 0; i < 10; i += 1) {
      await recordRateLimitFailure(config, rateLimits);
    }
    await resetRateLimit(config.scope, config.key, rateLimits);

    await expect(
      assertNotLockedOut(config.scope, config.key, rateLimits),
    ).resolves.toBeUndefined();
    for (let i = 0; i < 9; i += 1) {
      await recordRateLimitFailure(config, rateLimits);
    }
    await expect(
      assertNotLockedOut(config.scope, config.key, rateLimits),
    ).resolves.toBeUndefined();
  });
});

describe("resolveClientIp", () => {
  it("reads the first address from x-forwarded-for", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178",
    });
    expect(resolveClientIp(headers)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.9" });
    expect(resolveClientIp(headers)).toBe("203.0.113.9");
  });

  it("degrades to a shared bucket instead of throwing when no IP header is present", () => {
    const headers = new Headers();
    expect(resolveClientIp(headers)).toBe("unknown");
  });
});
