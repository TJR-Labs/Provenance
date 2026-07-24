import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({ env: {} }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/auth/password", () => ({
  verifyPassword: vi.fn(
    async (password: string, hash: string | null) =>
      hash === `hashed:${password}`,
  ),
}));

import {
  InvalidAccountDeletionReauthenticationError,
  RECENT_OAUTH_REAUTH_MS,
  requestAccountDeletion,
} from "~/server/account-deletion";

function fakeDatabase(options: {
  passwordHash: string | null;
  accounts?: { id: string }[];
}) {
  let deleted = false;
  let audit: { storageObjectsQueued: number } | null = null;
  const pendingObjects: { bucket: string; path: string; reason: string }[] = [];
  const reportDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const reportUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
  const pendingOAuthDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const loginAttemptDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const rateLimitDeleteMany = vi.fn().mockResolvedValue({ count: 3 });
  const userDelete = vi.fn(async () => {
    deleted = true;
    return { id: "user-1" };
  });

  const transaction = {
    accountDeletionAudit: {
      findUnique: vi.fn(async () => audit),
      create: vi.fn(
        async ({ data }: { data: { storageObjectsQueued: number } }) => {
          audit = { storageObjectsQueued: data.storageObjectsQueued };
          return data;
        },
      ),
    },
    user: {
      findUnique: vi.fn(async () =>
        deleted
          ? null
          : {
              id: "user-1",
              username: "alice",
              email: "alice@example.test",
              passwordHash: options.passwordHash,
              accounts: options.accounts ?? [],
            },
      ),
      delete: userDelete,
    },
    imageResource: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { storageBucket: "public", storagePath: "user-1/image.png" },
        ]),
    },
    projectMedia: {
      findMany: vi.fn().mockResolvedValue([
        { storageBucket: "public", storagePath: "user-1/project.png" },
        { storageBucket: "public", storagePath: "user-1/image.png" },
      ]),
    },
    uploadIntent: {
      findMany: vi.fn().mockResolvedValue([
        {
          stagingBucket: "staging",
          stagingPath: "user-1/staged",
          resultStorageBucket: "public",
          resultStoragePath: "user-1/project.png",
        },
      ]),
    },
    pendingStorageDeletion: {
      createMany: vi.fn(
        async ({
          data,
        }: {
          data: { bucket: string; path: string; reason: string }[];
        }) => {
          pendingObjects.push(...data);
          return { count: data.length };
        },
      ),
    },
    report: {
      deleteMany: reportDeleteMany,
      updateMany: reportUpdateMany,
    },
    pendingOAuthSignup: {
      deleteMany: pendingOAuthDeleteMany,
    },
    loginAttempt: {
      deleteMany: loginAttemptDeleteMany,
    },
    rateLimitAttempt: {
      deleteMany: rateLimitDeleteMany,
    },
  };
  return {
    prisma: {
      $transaction: vi.fn(
        async (operation: (tx: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    },
    pendingObjects,
    reportDeleteMany,
    reportUpdateMany,
    pendingOAuthDeleteMany,
    loginAttemptDeleteMany,
    rateLimitDeleteMany,
    userDelete,
  };
}

describe("requestAccountDeletion", () => {
  it("requires the current password for credentials users", async () => {
    const database = fakeDatabase({ passwordHash: "hashed:correct-password" });
    await expect(
      requestAccountDeletion(
        { userId: "user-1", currentPassword: "wrong-password" },
        database.prisma as never,
      ),
    ).rejects.toBeInstanceOf(InvalidAccountDeletionReauthenticationError);
    expect(database.userDelete).not.toHaveBeenCalled();
  });

  it("requires a provider-backed session authenticated within 10 minutes", async () => {
    const database = fakeDatabase({
      passwordHash: null,
      accounts: [{ id: "account-1" }],
    });
    const now = new Date("2026-07-22T12:00:00.000Z");
    await expect(
      requestAccountDeletion(
        {
          userId: "user-1",
          authenticatedAt: now.getTime() - RECENT_OAUTH_REAUTH_MS - 1,
        },
        database.prisma as never,
        now,
      ),
    ).rejects.toBeInstanceOf(InvalidAccountDeletionReauthenticationError);
    expect(database.userDelete).not.toHaveBeenCalled();
  });

  it("accepts a fresh provider confirmation for an OAuth-only account", async () => {
    const database = fakeDatabase({
      passwordHash: null,
      accounts: [{ id: "account-1" }],
    });
    const now = new Date("2026-07-22T12:00:00.000Z");
    await expect(
      requestAccountDeletion(
        {
          userId: "user-1",
          authenticatedAt: now.getTime() - 1_000,
        },
        database.prisma as never,
        now,
      ),
    ).resolves.toMatchObject({ deleted: true, alreadyDeleted: false });
  });

  it("queues every unique owned Storage object and applies report retention policy", async () => {
    const database = fakeDatabase({ passwordHash: "hashed:correct-password" });
    const result = await requestAccountDeletion(
      { userId: "user-1", currentPassword: "correct-password" },
      database.prisma as never,
      new Date("2026-07-22T12:00:00.000Z"),
    );

    expect(result).toEqual({
      deleted: true,
      alreadyDeleted: false,
      storageObjectsQueued: 3,
    });
    expect(database.pendingObjects).toEqual([
      {
        bucket: "public",
        path: "user-1/image.png",
        reason: "account deletion",
      },
      {
        bucket: "public",
        path: "user-1/project.png",
        reason: "account deletion",
      },
      {
        bucket: "staging",
        path: "user-1/staged",
        reason: "account deletion",
      },
    ]);
    expect(database.reportDeleteMany).toHaveBeenCalledWith({
      where: { reportedUserId: "user-1" },
    });
    expect(database.reportUpdateMany).toHaveBeenCalledWith({
      where: { reporterId: "user-1" },
      data: { reporterId: null },
    });
    expect(database.pendingOAuthDeleteMany).toHaveBeenCalledOnce();
    expect(database.loginAttemptDeleteMany).toHaveBeenCalledWith({
      where: { username: "alice" },
    });
    const deletedRateLimits = database.rateLimitDeleteMany.mock
      .calls[0]?.[0] as
      { where: { OR: { scope: string; key: string }[] } } | undefined;
    expect(deletedRateLimits?.where.OR).toEqual(
      expect.arrayContaining([
        { scope: "change-password", key: "user-1" },
        { scope: "report", key: "user-1" },
      ]),
    );
    expect(database.userDelete).toHaveBeenCalledOnce();
  });

  it("is idempotent after the audit marker has been written", async () => {
    const database = fakeDatabase({ passwordHash: "hashed:correct-password" });
    await requestAccountDeletion(
      { userId: "user-1", currentPassword: "correct-password" },
      database.prisma as never,
    );
    const second = await requestAccountDeletion(
      { userId: "user-1", currentPassword: "correct-password" },
      database.prisma as never,
    );

    expect(second).toEqual({
      deleted: true,
      alreadyDeleted: true,
      storageObjectsQueued: 3,
    });
    expect(database.userDelete).toHaveBeenCalledOnce();
    expect(database.pendingObjects).toHaveLength(3);
  });
});
