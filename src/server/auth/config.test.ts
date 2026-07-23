import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface LoginAttemptRow {
  username: string;
  failedCount: number;
  firstFailedAt: Date;
  lockedUntil: Date | null;
}

interface RateLimitRow {
  scope: string;
  key: string;
  count: number;
  windowStart: Date;
  lockedUntil: Date | null;
}

const mocks = vi.hoisted(() => ({
  attempts: new Map<string, LoginAttemptRow>(),
  ipAttempts: new Map<string, RateLimitRow>(),
  deleteLoginAttempts: vi.fn(),
  findLoginAttempt: vi.fn(),
  findUser: vi.fn(),
  rateLimits: {
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  recordLoginFailure: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    loginAttempt: {
      deleteMany: mocks.deleteLoginAttempts,
      findUnique: mocks.findLoginAttempt,
    },
    rateLimitAttempt: mocks.rateLimits,
    user: { findUnique: mocks.findUser },
  },
}));

vi.mock("~/server/login-attempts", () => ({
  recordLoginFailure: mocks.recordLoginFailure,
}));

vi.mock("~/server/auth/password", () => ({
  verifyPassword: mocks.verifyPassword,
}));

import { Role } from "../../../generated/prisma";
import { authConfig } from "~/server/auth/config";
import {
  RATE_LIMIT_ATOMIC_UPDATE,
  type RateLimitConfig,
} from "~/server/rate-limit";

const user = {
  id: "user-1",
  username: "alice",
  passwordHash: "stored-hash",
  role: Role.USER,
  displayName: "Alice",
  banned: false,
};

async function authorize(
  username: string,
  password: string,
  ip = "203.0.113.10",
) {
  const provider = authConfig.providers[0];
  if (
    !provider ||
    typeof provider === "function" ||
    provider.type !== "credentials"
  ) {
    throw new Error("Credentials provider is not configured");
  }

  const options = (
    provider as unknown as {
      options?: { authorize?: typeof provider.authorize };
    }
  ).options;
  if (!options?.authorize) {
    throw new Error("Credentials authorize callback is not configured");
  }

  return options.authorize(
    { username, password },
    new Request("http://localhost/login", {
      headers: { "x-forwarded-for": `client-supplied, ${ip}` },
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));
  vi.clearAllMocks();
  mocks.attempts.clear();
  mocks.ipAttempts.clear();

  mocks.findLoginAttempt.mockImplementation(
    async ({ where }: { where: { username: string } }) =>
      mocks.attempts.get(where.username) ?? null,
  );
  mocks.deleteLoginAttempts.mockImplementation(
    async ({ where }: { where: { username: string } }) => {
      const deleted = mocks.attempts.delete(where.username);
      return { count: deleted ? 1 : 0 };
    },
  );
  mocks.recordLoginFailure.mockImplementation(
    async (
      username: string,
      config: { threshold: number; windowMs: number; lockoutMs: number },
    ) => {
      const now = new Date();
      const existing = mocks.attempts.get(username);
      const activelyLocked =
        (existing?.lockedUntil?.getTime() ?? 0) > now.getTime();
      const startsNewWindow =
        existing?.lockedUntil !== null ||
        now.getTime() - (existing?.firstFailedAt.getTime() ?? 0) >=
          config.windowMs;
      const failedCount = activelyLocked
        ? existing!.failedCount
        : startsNewWindow
          ? 1
          : existing.failedCount + 1;
      mocks.attempts.set(username, {
        username,
        failedCount,
        firstFailedAt:
          activelyLocked || !startsNewWindow
            ? (existing?.firstFailedAt ?? now)
            : now,
        lockedUntil: activelyLocked
          ? existing!.lockedUntil
          : failedCount >= config.threshold
            ? new Date(now.getTime() + config.lockoutMs)
            : null,
      });
    },
  );
  mocks.rateLimits.findUnique.mockImplementation(
    async ({
      where,
    }: {
      where: { scope_key: { scope: string; key: string } };
    }) =>
      mocks.ipAttempts.get(`${where.scope_key.scope}:${where.scope_key.key}`) ??
      null,
  );
  Object.assign(mocks.rateLimits, {
    [RATE_LIMIT_ATOMIC_UPDATE]: vi.fn(
      async (config: Omit<RateLimitConfig, "message">) => {
        const now = new Date();
        const key = `${config.scope}:${config.key}`;
        const existing = mocks.ipAttempts.get(key);
        const activelyLocked =
          (existing?.lockedUntil?.getTime() ?? 0) > now.getTime();
        const startsNewWindow =
          existing?.lockedUntil !== null ||
          now.getTime() - (existing?.windowStart.getTime() ?? 0) >=
            config.windowMs;
        const count = activelyLocked
          ? existing!.count
          : startsNewWindow
            ? 1
            : existing.count + 1;
        const lockedUntil = activelyLocked
          ? existing!.lockedUntil
          : count >= config.limit
            ? new Date(now.getTime() + config.lockoutMs)
            : null;
        mocks.ipAttempts.set(key, {
          scope: config.scope,
          key: config.key,
          count,
          windowStart:
            activelyLocked || !startsNewWindow
              ? (existing?.windowStart ?? now)
              : now,
          lockedUntil,
        });
        return {
          allowed: lockedUntil === null && count < config.limit,
          count,
          lockedUntil,
        };
      },
    ),
  });
  mocks.findUser.mockImplementation(
    async ({ where }: { where: { username: string } }) =>
      where.username === user.username ? user : null,
  );
  mocks.verifyPassword.mockImplementation(
    async (password: string) => password === "correct-password",
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("credentials login rate limiting", () => {
  it("rejects a banned user even with the correct password", async () => {
    mocks.findUser.mockResolvedValueOnce({ ...user, banned: true });
    await expect(authorize("alice", "correct-password")).resolves.toBeNull();
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });

  it("allows a correct password after nine failed attempts and clears the counter", async () => {
    for (let attempt = 0; attempt < 9; attempt += 1) {
      await expect(authorize("Alice", "wrong-password")).resolves.toBeNull();
    }

    expect(mocks.attempts.get("alice")).toMatchObject({
      failedCount: 9,
      lockedUntil: null,
    });
    await expect(
      authorize(" ALICE ", "correct-password"),
    ).resolves.toMatchObject({ id: user.id, username: user.username });
    expect(mocks.attempts.has("alice")).toBe(false);
  });

  it("locks on the tenth failure and rejects a subsequent correct password", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(authorize("alice", "wrong-password")).resolves.toBeNull();
    }

    expect(mocks.attempts.get("alice")).toMatchObject({ failedCount: 10 });
    expect(mocks.attempts.get("alice")?.lockedUntil).toEqual(
      new Date("2026-07-15T12:15:00.000Z"),
    );

    mocks.findUser.mockClear();
    mocks.verifyPassword.mockClear();
    await expect(authorize("alice", "correct-password")).resolves.toBeNull();
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });

  it("resets the failed counter after a successful login", async () => {
    await authorize("alice", "wrong-password");
    await expect(authorize("alice", "correct-password")).resolves.toMatchObject(
      { id: user.id },
    );

    for (let attempt = 0; attempt < 9; attempt += 1) {
      await authorize("alice", "wrong-password");
    }

    await expect(authorize("alice", "correct-password")).resolves.toMatchObject(
      { id: user.id },
    );
    expect(mocks.deleteLoginAttempts).toHaveBeenCalledTimes(2);
  });

  it("throttles a nonexistent username the same way as a real username", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        authorize("Missing-User", "wrong-password"),
      ).resolves.toBeNull();
    }

    expect(mocks.attempts.get("missing-user")).toMatchObject({
      failedCount: 10,
      lockedUntil: new Date("2026-07-15T12:15:00.000Z"),
    });

    mocks.findUser.mockClear();
    await expect(
      authorize("missing-user", "wrong-password"),
    ).resolves.toBeNull();
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("starts a fresh failure window after a lock expires", async () => {
    mocks.attempts.set("alice", {
      username: "alice",
      failedCount: 10,
      firstFailedAt: new Date("2026-07-15T11:45:00.000Z"),
      lockedUntil: new Date("2026-07-15T12:00:00.000Z"),
    });

    await expect(authorize("alice", "wrong-password")).resolves.toBeNull();
    expect(mocks.attempts.get("alice")).toEqual({
      username: "alice",
      failedCount: 1,
      firstFailedAt: new Date("2026-07-15T12:00:00.000Z"),
      lockedUntil: null,
    });
  });

  it("blocks one source after failures across many usernames", async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await expect(
        authorize(`missing-${attempt}`, "wrong-password", "198.51.100.20"),
      ).resolves.toBeNull();
    }

    mocks.findUser.mockClear();
    await expect(
      authorize("alice", "correct-password", "198.51.100.20"),
    ).resolves.toBeNull();
    expect(mocks.findUser).not.toHaveBeenCalled();

    await expect(
      authorize("alice", "correct-password", "198.51.100.21"),
    ).resolves.toMatchObject({ id: user.id });
  });

  it("keeps source failures independent from an unrelated username", async () => {
    for (let attempt = 0; attempt < 29; attempt += 1) {
      await authorize(`other-${attempt}`, "wrong-password", "192.0.2.44");
    }

    expect(mocks.attempts.has("alice")).toBe(false);
    await expect(
      authorize("alice", "correct-password", "192.0.2.45"),
    ).resolves.toMatchObject({ id: user.id });
  });
});
