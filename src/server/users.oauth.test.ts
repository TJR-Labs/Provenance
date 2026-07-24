import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const database = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    account: {
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    pendingOAuthSignup: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { database };
});

vi.mock("~/server/db", () => ({ db: mocks.database }));

import {
  LastSignInMethodError,
  linkOAuthAccount,
  OAuthAccountAlreadyLinkedError,
  oauthUsernamePickerPath,
  resolveOAuthSignIn,
  unlinkOAuthAccount,
} from "~/server/users";

const user = {
  id: "user-1",
  username: "alice",
  email: "alice@example.com",
  emailVerified: null,
  sessionVersion: 0,
  role: "USER",
  displayName: "Alice",
  banned: false,
  passwordHash: "stored-hash",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.database.$transaction.mockImplementation(
    async (callback: (database: typeof mocks.database) => unknown) =>
      callback(mocks.database),
  );
  mocks.database.account.findUnique.mockResolvedValue(null);
  mocks.database.account.findFirst.mockResolvedValue(null);
  mocks.database.account.create.mockResolvedValue({ id: "account-1" });
  mocks.database.pendingOAuthSignup.deleteMany.mockResolvedValue({ count: 0 });
  mocks.database.pendingOAuthSignup.create.mockResolvedValue({
    id: "pending-1",
  });
  mocks.database.user.update.mockResolvedValue({
    ...user,
    emailVerified: new Date(),
  });
});

describe("OAuth account resolution", () => {
  it("auto-links an unmatched provider account when the email is verified", async () => {
    mocks.database.user.findUnique.mockResolvedValue(user);

    await expect(
      resolveOAuthSignIn({
        provider: "google",
        providerAccountId: "google-1",
        email: "ALICE@example.com",
        emailVerified: true,
        name: "Alice",
      }),
    ).resolves.toMatchObject({ kind: "user", user: { id: user.id } });

    expect(mocks.database.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "alice@example.com" } }),
    );
    expect(mocks.database.account.create).toHaveBeenCalledWith({
      data: {
        userId: user.id,
        provider: "google",
        providerAccountId: "google-1",
      },
    });
    expect(mocks.database.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: user.id } }),
    );
    const verificationUpdate = mocks.database.user.update.mock.calls[0]?.[0] as
      { data: { emailVerified: unknown } } | undefined;
    expect(verificationUpdate?.data.emailVerified).toBeInstanceOf(Date);
    expect(mocks.database.pendingOAuthSignup.create).not.toHaveBeenCalled();
  });

  it("does not auto-link an unverified matching email and creates a pending signup", async () => {
    let pendingCreateInput: unknown;
    mocks.database.pendingOAuthSignup.create.mockImplementation(
      async (input: unknown) => {
        pendingCreateInput = input;
        return { id: "pending-1" };
      },
    );
    const result = await resolveOAuthSignIn({
      provider: "github",
      providerAccountId: "github-1",
      email: user.email,
      emailVerified: false,
      name: "Alice",
    });

    expect(result.kind).toBe("pending");
    if (result.kind !== "pending") throw new Error("Expected pending signup");
    expect(oauthUsernamePickerPath(result.token)).toMatch(
      /^\/signup\/username\?token=/,
    );

    expect(mocks.database.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.database.account.create).not.toHaveBeenCalled();
    expect(pendingCreateInput).toMatchObject({
      data: {
        provider: "github",
        providerAccountId: "github-1",
        emailVerified: false,
      },
    });
  });

  it("rejects a provider account already linked to a different user", async () => {
    mocks.database.user.findUnique.mockResolvedValue({ banned: false });
    mocks.database.account.findUnique.mockResolvedValue({ userId: "user-1" });

    await expect(
      linkOAuthAccount("user-2", "google", "google-1"),
    ).rejects.toBeInstanceOf(OAuthAccountAlreadyLinkedError);
    expect(mocks.database.account.create).not.toHaveBeenCalled();
  });
});

describe("OAuth account unlinking", () => {
  it("blocks unlinking the last provider when no password exists", async () => {
    mocks.database.user.findUnique.mockResolvedValue({ passwordHash: null });
    mocks.database.account.findFirst.mockResolvedValue({ id: "account-1" });
    mocks.database.account.count.mockResolvedValue(1);

    await expect(unlinkOAuthAccount("user-1", "google")).rejects.toBeInstanceOf(
      LastSignInMethodError,
    );
    expect(mocks.database.account.delete).not.toHaveBeenCalled();
  });

  it("allows unlinking the last provider when a password exists", async () => {
    mocks.database.user.findUnique.mockResolvedValue({
      passwordHash: "stored-hash",
    });
    mocks.database.account.findFirst.mockResolvedValue({ id: "account-1" });
    mocks.database.account.count.mockResolvedValue(1);

    await expect(
      unlinkOAuthAccount("user-1", "google"),
    ).resolves.toBeUndefined();
    expect(mocks.database.account.delete).toHaveBeenCalledWith({
      where: { id: "account-1" },
    });
  });
});
