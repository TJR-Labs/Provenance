import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real bcrypt hashing is slow enough (by design) that looping through many
// consecutive attempts under `vi.useFakeTimers()` in the rate-limit tests
// below would blow past the test timeout. Fake it out with a fast,
// deterministic stand-in, mirroring the mocking approach already used in
// src/server/auth/config.test.ts for the credentials-login lockout tests.
vi.mock("~/server/auth/password", () => ({
  hashPassword: vi.fn(async (password: string) => `hashed:${password}`),
  verifyPassword: vi.fn(
    async (password: string, hash: string | null) =>
      hash === `hashed:${password}`,
  ),
}));
vi.mock("~/server/db", () => ({ db: {} }));

import { hashPassword } from "~/server/auth/password";
import {
  RATE_LIMIT_ATOMIC_UPDATE,
  type RateLimitConfig,
} from "~/server/rate-limit";
import {
  changePassword,
  createUser,
  createUserInputSchema,
  DuplicateUsernameError,
  InvalidCurrentPasswordError,
} from "~/server/users";

interface RateLimitRow {
  scope: string;
  key: string;
  count: number;
  windowStart: Date;
  lockedUntil: Date | null;
}

function fakeRateLimits(rows = new Map<string, RateLimitRow>()) {
  const rowKey = (scope: string, key: string) => `${scope}:${key}`;
  return {
    [RATE_LIMIT_ATOMIC_UPDATE]: vi.fn(
      async (
        config: Omit<RateLimitConfig, "message">,
        mode: "consume" | "failure",
      ) => {
        const now = new Date();
        const k = rowKey(config.scope, config.key);
        const existing = rows.get(k);
        const activelyLocked =
          (existing?.lockedUntil?.getTime() ?? 0) > now.getTime();
        const startsNewWindow =
          !existing ||
          (mode === "failure" && existing.lockedUntil !== null) ||
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

describe("user accounts", () => {
  it("rejects a duplicate username regardless of input case", async () => {
    const users = {
      findUnique: vi.fn().mockResolvedValue({ id: "existing-user" }),
      create: vi.fn(),
      update: vi.fn(),
    };

    await expect(
      createUser(
        {
          username: "ALICE",
          displayName: "Another Alice",
          email: "alice@example.test",
          password: "initial-password",
        },
        users as never,
      ),
    ).rejects.toBeInstanceOf(DuplicateUsernameError);

    expect(users.findUnique).toHaveBeenCalledWith({
      where: { username: "alice" },
      select: { id: true },
    });
    expect(users.create).not.toHaveBeenCalled();
  });

  it("requires a safe, public-URL-compatible username", () => {
    const result = createUserInputSchema.safeParse({
      username: "not a route",
      displayName: "New User",
      email: "new@example.test",
      password: "initial-password",
    });

    expect(result.success).toBe(false);
  });

  it("rejects usernames that collide with application routes", () => {
    expect(
      createUserInputSchema.safeParse({
        username: "projects",
        displayName: "Projects User",
        email: "projects@example.test",
        password: "initial-password",
      }).success,
    ).toBe(false);
  });

  it("leaves the password unchanged when the current password is wrong", async () => {
    const users = {
      findUnique: vi.fn().mockResolvedValue({
        passwordHash: await hashPassword("current-password"),
      }),
      create: vi.fn(),
      update: vi.fn(),
    };

    await expect(
      changePassword(
        "user-1",
        "wrong-password",
        "new-password",
        users as never,
        fakeRateLimits() as never,
      ),
    ).rejects.toBeInstanceOf(InvalidCurrentPasswordError);
    expect(users.update).not.toHaveBeenCalled();
  });

  describe("changePassword rate limiting", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function fakeUsers(currentPassword: string) {
      return {
        findUnique: vi.fn().mockImplementation(async () => ({
          passwordHash: await hashPassword(currentPassword),
        })),
        create: vi.fn(),
        update: vi.fn(),
      };
    }

    it("allows a correct password after a single wrong attempt (typo tolerance)", async () => {
      const users = fakeUsers("correct-password");
      const rateLimits = fakeRateLimits();

      await expect(
        changePassword(
          "user-1",
          "wrong-password",
          "new-password",
          users as never,
          rateLimits as never,
        ),
      ).rejects.toBeInstanceOf(InvalidCurrentPasswordError);

      await expect(
        changePassword(
          "user-1",
          "correct-password",
          "new-password",
          users as never,
          rateLimits as never,
        ),
      ).resolves.toBeUndefined();
      expect(users.update).toHaveBeenCalledTimes(1);
    });

    it("locks out further attempts after 10 consecutive failures within the window", async () => {
      const users = fakeUsers("correct-password");
      const rateLimits = fakeRateLimits();

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await expect(
          changePassword(
            "user-1",
            "wrong-password",
            "new-password",
            users as never,
            rateLimits as never,
          ),
        ).rejects.toBeInstanceOf(InvalidCurrentPasswordError);
      }

      users.findUnique.mockClear();
      await expect(
        changePassword(
          "user-1",
          "correct-password",
          "new-password",
          users as never,
          rateLimits as never,
        ),
      ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
      expect(users.findUnique).not.toHaveBeenCalled();
    });

    it("resets the failure counter after a successful change", async () => {
      const users = fakeUsers("correct-password");
      const rateLimits = fakeRateLimits();

      await changePassword(
        "user-1",
        "wrong-password",
        "new-password",
        users as never,
        rateLimits as never,
      ).catch(() => undefined);
      await changePassword(
        "user-1",
        "correct-password",
        "new-password",
        users,
        rateLimits as never,
      );

      for (let attempt = 0; attempt < 9; attempt += 1) {
        await changePassword(
          "user-1",
          "wrong-password",
          "new-password",
          users as never,
          rateLimits as never,
        ).catch(() => undefined);
      }

      // Still under the threshold post-reset, so a correct password succeeds.
      await expect(
        changePassword(
          "user-1",
          "correct-password",
          "new-password",
          users as never,
          rateLimits as never,
        ),
      ).resolves.toBeUndefined();
    });
  });
});
