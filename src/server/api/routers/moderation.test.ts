import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));

import { Role } from "../../../../generated/prisma";
import { appRouter } from "~/server/api/root";
import {
  RATE_LIMIT_ATOMIC_UPDATE,
  type RateLimitConfig,
} from "~/server/rate-limit";

interface RateLimitRow {
  scope: string;
  key: string;
  count: number;
  windowStart: Date;
  lockedUntil: Date | null;
}

function fakeRateLimits() {
  const rows = new Map<string, RateLimitRow>();
  const rowKey = (scope: string, key: string) => `${scope}:${key}`;
  return {
    [RATE_LIMIT_ATOMIC_UPDATE]: vi.fn(
      async (config: Omit<RateLimitConfig, "message">) => {
        const now = new Date();
        const k = rowKey(config.scope, config.key);
        const existing = rows.get(k);
        const activelyLocked =
          (existing?.lockedUntil?.getTime() ?? 0) > now.getTime();
        const startsNewWindow =
          !existing ||
          now.getTime() - existing.windowStart.getTime() >= config.windowMs;
        const count = activelyLocked
          ? existing!.count
          : startsNewWindow
            ? 1
            : existing.count + 1;
        const windowStart =
          activelyLocked || !startsNewWindow
            ? (existing?.windowStart ?? now)
            : now;
        const lockedUntil = activelyLocked
          ? existing!.lockedUntil
          : count >= config.limit
            ? new Date(now.getTime() + config.lockoutMs)
            : null;
        rows.set(k, {
          scope: config.scope,
          key: config.key,
          count,
          windowStart,
          lockedUntil,
        });
        return {
          allowed: lockedUntil === null && count < config.limit,
          count,
          lockedUntil,
        };
      },
    ),
    findUnique: vi.fn(
      async ({
        where,
      }: {
        where: { scope_key: { scope: string; key: string } };
      }) =>
        rows.get(rowKey(where.scope_key.scope, where.scope_key.key)) ?? null,
    ),
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
    ),
    deleteMany: vi.fn(
      async ({ where }: { where: { scope: string; key: string } }) => {
        const k = rowKey(where.scope, where.key);
        const deleted = rows.delete(k);
        return { count: deleted ? 1 : 0 };
      },
    ),
  };
}

function session(userId: string) {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: {
      id: userId,
      role: Role.USER,
      displayName: "Reporter",
      username: "reporter",
      name: "Reporter",
    },
  };
}

function callerFor(
  userId: string,
  rateLimits: ReturnType<typeof fakeRateLimits>,
) {
  let nextId = 1;
  const db = {
    report: {
      create: vi
        .fn()
        .mockImplementation(async ({ data }: { data: unknown }) => ({
          id: `report-${nextId++}`,
          ...(data as Record<string, unknown>),
        })),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ id: "reported-user" }) },
    rateLimitAttempt: rateLimits,
  };

  return appRouter.createCaller({
    db: db as never,
    headers: new Headers(),
    session: session(userId),
  });
}

describe("moderation.report rate limiting", () => {
  it("allows reports under the per-user threshold", async () => {
    const rateLimits = fakeRateLimits();
    const caller = callerFor("user-1", rateLimits);

    for (let i = 0; i < 9; i += 1) {
      await expect(
        caller.moderation.report({ projectId: `project-${i}` }),
      ).resolves.toMatchObject({ projectId: `project-${i}` });
    }
  });

  it("rejects further reports from the same user once the threshold is reached", async () => {
    const rateLimits = fakeRateLimits();
    const caller = callerFor("user-1", rateLimits);

    for (let i = 0; i < 9; i += 1) {
      await caller.moderation.report({ projectId: `project-${i}` });
    }

    await expect(
      caller.moderation.report({ projectId: "project-over" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("does not throttle a different user", async () => {
    const rateLimits = fakeRateLimits();
    const throttled = callerFor("user-1", rateLimits);
    for (let i = 0; i < 10; i += 1) {
      await throttled.moderation
        .report({ projectId: `project-${i}` })
        .catch(() => undefined);
    }

    const other = callerFor("user-2", rateLimits);
    await expect(
      other.moderation.report({ projectId: "project-other" }),
    ).resolves.toMatchObject({ projectId: "project-other" });
  });

  it("resets after the window/lockout expires", async () => {
    const rateLimits = fakeRateLimits();
    const caller = callerFor("user-1", rateLimits);

    // Seed an already-expired lockout (window + lockout period fully
    // elapsed) instead of driving 10 real calls through the caller, so this
    // test doesn't depend on advancing the system clock.
    await rateLimits.upsert({
      where: { scope_key: { scope: "report", key: "user-1" } },
      create: {
        scope: "report",
        key: "user-1",
        count: 10,
        windowStart: new Date(Date.now() - 3 * 60 * 60 * 1000),
        lockedUntil: new Date(Date.now() - 60 * 60 * 1000),
      },
      update: {},
    });

    await expect(
      caller.moderation.report({ projectId: "project-after-reset" }),
    ).resolves.toMatchObject({ projectId: "project-after-reset" });
  });
});

describe("moderation.listReports pagination input", () => {
  function adminCaller(findMany: ReturnType<typeof vi.fn>) {
    return appRouter.createCaller({
      db: { report: { findMany } } as never,
      headers: new Headers(),
      session: {
        ...session("admin-1"),
        user: { ...session("admin-1").user, role: Role.ADMIN },
      },
    });
  }

  it("uses the admin default and clamps oversized requests to 100", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const caller = adminCaller(findMany);

    await caller.moderation.listReports();
    await caller.moderation.listReports({ limit: 1_000 });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ take: 51 });
    expect(findMany.mock.calls[1]?.[0]).toMatchObject({ take: 101 });
  });

  it("rejects malformed cursors before querying reports", async () => {
    const findMany = vi.fn();
    const caller = adminCaller(findMany);

    await expect(
      caller.moderation.listReports({ cursor: "malformed" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(findMany).not.toHaveBeenCalled();
  });
});
