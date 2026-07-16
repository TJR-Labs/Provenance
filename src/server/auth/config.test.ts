import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface LoginAttemptRow {
  username: string;
  failedCount: number;
  firstFailedAt: Date;
  lockedUntil: Date | null;
}

interface LoginAttemptUpsertArgs {
  where: { username: string };
  create: LoginAttemptRow;
  update: Partial<Omit<LoginAttemptRow, "username">>;
}

const mocks = vi.hoisted(() => ({
  attempts: new Map<string, LoginAttemptRow>(),
  deleteLoginAttempts: vi.fn(),
  findLoginAttempt: vi.fn(),
  findUser: vi.fn(),
  upsertLoginAttempt: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    loginAttempt: {
      deleteMany: mocks.deleteLoginAttempts,
      findUnique: mocks.findLoginAttempt,
      upsert: mocks.upsertLoginAttempt,
    },
    user: { findUnique: mocks.findUser },
  },
}));

vi.mock("~/server/auth/password", () => ({
  verifyPassword: mocks.verifyPassword,
}));

import { Role } from "../../../generated/prisma";
import { authConfig } from "~/server/auth/config";

const user = {
  id: "user-1",
  username: "alice",
  passwordHash: "stored-hash",
  role: Role.ENGINEER,
  displayName: "Alice",
};

async function authorize(username: string, password: string) {
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
    new Request("http://localhost/login"),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));
  vi.clearAllMocks();
  mocks.attempts.clear();

  mocks.findLoginAttempt.mockImplementation(
    async ({ where }: { where: { username: string } }) =>
      mocks.attempts.get(where.username) ?? null,
  );
  mocks.upsertLoginAttempt.mockImplementation(
    async ({ where, create, update }: LoginAttemptUpsertArgs) => {
      const existing = mocks.attempts.get(where.username);
      const loginAttempt = existing ? { ...existing, ...update } : create;
      mocks.attempts.set(where.username, loginAttempt);
      return loginAttempt;
    },
  );
  mocks.deleteLoginAttempts.mockImplementation(
    async ({ where }: { where: { username: string } }) => {
      const deleted = mocks.attempts.delete(where.username);
      return { count: deleted ? 1 : 0 };
    },
  );
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
});
