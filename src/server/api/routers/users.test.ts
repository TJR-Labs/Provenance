import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/auth/password", () => ({
  hashPassword: vi.fn(async (password: string) => `hashed:${password}`),
  verifyPassword: vi.fn(
    async (password: string, hash: string | null) => hash === `hashed:${password}`,
  ),
}));

import { appRouter } from "~/server/api/root";

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
    findUnique: vi.fn(
      async ({
        where,
      }: {
        where: { scope_key: { scope: string; key: string } };
      }) => rows.get(rowKey(where.scope_key.scope, where.scope_key.key)) ?? null,
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

function callerFromIp(ip: string, rateLimits: ReturnType<typeof fakeRateLimits>) {
  let nextId = 1;
  const db = {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => ({
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
      await throttled.users.signup(signupInput(`user-c${i}`)).catch(() => undefined);
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
