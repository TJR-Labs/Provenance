import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/auth/password", () => ({
  hashPassword: vi.fn(async (password: string) => `hashed:${password}`),
  verifyPassword: vi.fn(
    async (password: string, hash: string | null) =>
      hash === `hashed:${password}`,
  ),
}));
vi.mock("~/server/password-recovery", async (importOriginal) => ({
  ...(await importOriginal()),
  requestEmailVerification: vi.fn().mockResolvedValue({
    alreadyVerified: false,
  }),
}));

import { appRouter } from "~/server/api/root";
import { Role } from "../../../../generated/prisma";
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

function callerFromIp(
  ip: string,
  rateLimits: ReturnType<typeof fakeRateLimits>,
) {
  let nextId = 1;
  const db = {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(async ({ data }: { data: unknown }) => ({
          id: `user-${nextId++}`,
          ...(data as Record<string, unknown>),
        })),
    },
    rateLimitAttempt: rateLimits,
  };

  return appRouter.createCaller({
    db: db as never,
    headers: new Headers({ "x-forwarded-for": ip }),
    session: null,
  });
}

function signupInput(username: string) {
  return {
    username,
    displayName: "New User",
    email: `${username}@example.test`,
    password: "initial-password",
  };
}

describe("users.signup rate limiting", () => {
  it("allows signups under the per-IP threshold", async () => {
    const rateLimits = fakeRateLimits();
    const caller = callerFromIp("203.0.113.10", rateLimits);

    for (let i = 0; i < 4; i += 1) {
      await expect(
        caller.users.signup(signupInput(`user-a${i}`)),
      ).resolves.toMatchObject({ username: `user-a${i}` });
    }
  });

  it("rejects further signups from the same IP once the threshold is reached", async () => {
    const rateLimits = fakeRateLimits();
    const caller = callerFromIp("203.0.113.10", rateLimits);

    for (let i = 0; i < 4; i += 1) {
      await caller.users.signup(signupInput(`user-b${i}`));
    }

    await expect(
      caller.users.signup(signupInput("user-b-over")),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("does not throttle a different IP sharing no state with a throttled one", async () => {
    const rateLimits = fakeRateLimits();
    const throttled = callerFromIp("203.0.113.10", rateLimits);
    for (let i = 0; i < 5; i += 1) {
      await throttled.users
        .signup(signupInput(`user-c${i}`))
        .catch(() => undefined);
    }

    const otherIp = callerFromIp("198.51.100.20", rateLimits);
    await expect(
      otherIp.users.signup(signupInput("user-other")),
    ).resolves.toMatchObject({ username: "user-other" });
  });

  it("does not throw when the IP header is missing, degrading to a shared bucket", async () => {
    const rateLimits = fakeRateLimits();
    let nextId = 1;
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi
          .fn()
          .mockImplementation(async ({ data }: { data: unknown }) => ({
            id: `user-${nextId++}`,
            ...(data as Record<string, unknown>),
          })),
      },
      rateLimitAttempt: rateLimits,
    };
    const caller = appRouter.createCaller({
      db: db as never,
      headers: new Headers(),
      session: null,
    });

    await expect(
      caller.users.signup(signupInput("no-ip-user")),
    ).resolves.toMatchObject({ username: "no-ip-user" });
  });
});

function adminSession() {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: {
      id: "admin-1",
      role: Role.ADMIN,
      displayName: "Admin",
      username: "admin",
      name: "Admin",
    },
  };
}

function adminUserRow(id: string, createdAt: string) {
  return {
    id,
    username: id,
    role: Role.USER,
    displayName: id,
    banned: false,
    createdAt: new Date(createdAt),
  };
}

describe("users.list pagination", () => {
  it("uses the admin default and clamps oversized page requests to 100", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const caller = appRouter.createCaller({
      db: { user: { findMany } } as never,
      headers: new Headers(),
      session: adminSession(),
    });

    await caller.users.list();
    await caller.users.list({ limit: 1_000 });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ take: 51 });
    expect(findMany.mock.calls[1]?.[0]).toMatchObject({ take: 101 });
  });

  it("paginates equal timestamps by id and returns null at the end", async () => {
    const tiedAt = "2026-07-20T12:00:00.000Z";
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        adminUserRow("user-c", tiedAt),
        adminUserRow("user-b", tiedAt),
        adminUserRow("user-a", tiedAt),
      ])
      .mockResolvedValueOnce([adminUserRow("user-a", tiedAt)]);
    const caller = appRouter.createCaller({
      db: { user: { findMany } } as never,
      headers: new Headers(),
      session: adminSession(),
    });

    const firstPage = await caller.users.list({ limit: 2 });
    const secondPage = await caller.users.list({
      limit: 2,
      cursor: firstPage.nextCursor!,
    });

    expect(firstPage.items.map((user) => user.id)).toEqual([
      "user-c",
      "user-b",
    ]);
    expect(secondPage.items.map((user) => user.id)).toEqual(["user-a"]);
    expect(secondPage.nextCursor).toBeNull();
    expect(findMany.mock.calls[1]?.[0]).toMatchObject({
      where: {
        OR: [
          { createdAt: { lt: new Date(tiedAt) } },
          { createdAt: new Date(tiedAt), id: { lt: "user-b" } },
        ],
      },
    });
  });

  it("rejects a malformed cursor in the tRPC input schema", async () => {
    const findMany = vi.fn();
    const caller = appRouter.createCaller({
      db: { user: { findMany } } as never,
      headers: new Headers(),
      session: adminSession(),
    });

    await expect(
      caller.users.list({ cursor: "malformed" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(findMany).not.toHaveBeenCalled();
  });
});
