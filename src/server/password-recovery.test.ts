import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({ env: {} }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/auth/password", () => ({
  hashPassword: vi.fn(async (password: string) => `hashed:${password}`),
}));

import type { EmailSender, TransactionalEmail } from "~/server/email";
import {
  EMAIL_VERIFICATION_TTL_MS,
  EmailDeliveryError,
  InvalidEmailVerificationTokenError,
  InvalidPasswordResetTokenError,
  PASSWORD_RESET_REQUEST_RESPONSE,
  PASSWORD_RESET_TTL_MS,
  confirmEmailVerification,
  consumePasswordReset,
  requestEmailVerification,
  requestPasswordReset,
} from "~/server/password-recovery";
import {
  RATE_LIMIT_ATOMIC_UPDATE,
  type RateLimitConfig,
} from "~/server/rate-limit";

type UserRow = {
  id: string;
  email: string;
  emailVerified: Date | null;
  passwordHash: string | null;
  sessionVersion: number;
};

type TokenRow = {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  email?: string;
};

function fakeRateLimits() {
  const rows = new Map<
    string,
    {
      count: number;
      windowStart: Date;
      lockedUntil: Date | null;
    }
  >();
  const keyOf = (scope: string, key: string) => `${scope}:${key}`;
  return {
    [RATE_LIMIT_ATOMIC_UPDATE]: vi.fn(
      async (
        config: Omit<RateLimitConfig, "message">,
        mode: "consume" | "failure",
      ) => {
        const now = new Date();
        const key = keyOf(config.scope, config.key);
        const existing = rows.get(key);
        const locked = (existing?.lockedUntil?.getTime() ?? 0) > now.getTime();
        const fresh =
          !existing ||
          (mode === "failure" && existing.lockedUntil !== null) ||
          now.getTime() - existing.windowStart.getTime() >= config.windowMs;
        const count = locked ? existing!.count : fresh ? 1 : existing.count + 1;
        const windowStart =
          locked || !fresh ? (existing?.windowStart ?? now) : now;
        const lockedUntil = locked
          ? existing!.lockedUntil
          : count >= config.limit
            ? new Date(now.getTime() + config.lockoutMs)
            : null;
        rows.set(key, { count, windowStart, lockedUntil });
        return { allowed: lockedUntil === null, count, lockedUntil };
      },
    ),
    findUnique: vi.fn(
      async ({
        where,
      }: {
        where: { scope_key: { scope: string; key: string } };
      }) => rows.get(keyOf(where.scope_key.scope, where.scope_key.key)) ?? null,
    ),
    upsert: vi.fn(),
    deleteMany: vi.fn(
      async ({ where }: { where: { scope: string; key: string } }) => ({
        count: rows.delete(keyOf(where.scope, where.key)) ? 1 : 0,
      }),
    ),
  };
}

function fakeDatabase(initialUser: UserRow | null) {
  let user = initialUser ? { ...initialUser } : null;
  const passwordTokens: TokenRow[] = [];
  const verificationTokens: TokenRow[] = [];
  let nextId = 1;

  const userDelegate = {
    findUnique: vi.fn(
      async ({ where }: { where: { email?: string; id?: string } }) => {
        if (!user) return null;
        if (where.email && where.email !== user.email) return null;
        if (where.id && where.id !== user.id) return null;
        return { ...user };
      },
    ),
    update: vi.fn(
      async ({
        data,
      }: {
        data: {
          email?: string;
          emailVerified?: Date | null;
          passwordHash?: string;
          sessionVersion?: { increment: number };
        };
      }) => {
        if (!user) throw new Error("missing user");
        user = {
          ...user,
          ...data,
          sessionVersion:
            user.sessionVersion + (data.sessionVersion?.increment ?? 0),
        };
        return { ...user };
      },
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; email: string };
        data: { emailVerified: Date };
      }) => {
        if (user?.id !== where.id || user.email !== where.email) {
          return { count: 0 };
        }
        user = { ...user, ...data };
        return { count: 1 };
      },
    ),
  };

  const passwordResetToken = {
    deleteMany: vi.fn(
      async ({ where }: { where: { userId: string; consumedAt: null } }) => {
        const before = passwordTokens.length;
        for (let index = passwordTokens.length - 1; index >= 0; index -= 1) {
          const token = passwordTokens[index]!;
          if (token.userId === where.userId && token.consumedAt === null) {
            passwordTokens.splice(index, 1);
          }
        }
        return { count: before - passwordTokens.length };
      },
    ),
    create: vi.fn(
      async ({ data }: { data: Omit<TokenRow, "id" | "consumedAt"> }) => {
        const row = {
          ...data,
          id: `reset-${nextId++}`,
          consumedAt: null,
        };
        passwordTokens.push(row);
        return row;
      },
    ),
    findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
      const token = passwordTokens.find(
        (candidate) => candidate.tokenHash === where.tokenHash,
      );
      return token && user ? { ...token, user: { ...user } } : null;
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: {
          id?: string;
          userId?: string;
          consumedAt: null;
          expiresAt?: { gt: Date };
        };
        data: { consumedAt: Date };
      }) => {
        let count = 0;
        for (const token of passwordTokens) {
          const matchesId = !where.id || token.id === where.id;
          const matchesUser = !where.userId || token.userId === where.userId;
          const unconsumed = token.consumedAt === null;
          const unexpired =
            !where.expiresAt || token.expiresAt > where.expiresAt.gt;
          if (matchesId && matchesUser && unconsumed && unexpired) {
            token.consumedAt = data.consumedAt;
            count += 1;
          }
        }
        return { count };
      },
    ),
  };

  const emailVerificationToken = {
    deleteMany: vi.fn(async () => {
      const count = verificationTokens.length;
      verificationTokens.splice(0);
      return { count };
    }),
    create: vi.fn(
      async ({
        data,
      }: {
        data: Omit<TokenRow, "id" | "consumedAt"> & { email: string };
      }) => {
        const row = {
          ...data,
          id: `verify-${nextId++}`,
          consumedAt: null,
        };
        verificationTokens.push(row);
        return row;
      },
    ),
    findUnique: vi.fn(
      async ({ where }: { where: { tokenHash: string } }) =>
        verificationTokens.find(
          (candidate) => candidate.tokenHash === where.tokenHash,
        ) ?? null,
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; consumedAt: null; expiresAt: { gt: Date } };
        data: { consumedAt: Date };
      }) => {
        const token = verificationTokens.find(
          (candidate) =>
            candidate.id === where.id &&
            candidate.consumedAt === null &&
            candidate.expiresAt > where.expiresAt.gt,
        );
        if (!token) return { count: 0 };
        token.consumedAt = data.consumedAt;
        return { count: 1 };
      },
    ),
  };

  const transaction = {
    user: userDelegate,
    passwordResetToken,
    emailVerificationToken,
  };
  return {
    prisma: {
      user: userDelegate,
      passwordResetToken,
      emailVerificationToken,
      rateLimitAttempt: fakeRateLimits(),
      $transaction: vi.fn(
        async (operation: (tx: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    },
    passwordTokens,
    verificationTokens,
    currentUser: () => user,
  };
}

function failingSender(): EmailSender {
  return { send: vi.fn(async () => Promise.reject(new Error("provider down"))) };
}

function capturingSender() {
  const messages: TransactionalEmail[] = [];
  const sender: EmailSender = {
    send: vi.fn(async (message: TransactionalEmail) => {
      messages.push(message);
    }),
  };
  return { sender, messages };
}

function tokenFromMessage(message: TransactionalEmail) {
  const match = /https?:\/\/\S+/.exec(message.text);
  if (!match) throw new Error("email did not contain a link");
  return new URL(match[0]).searchParams.get("token")!;
}

const verifiedUser = {
  id: "user-1",
  email: "alice@example.test",
  emailVerified: new Date("2026-07-20T00:00:00.000Z"),
  passwordHash: "hashed:old-password",
  sessionVersion: 0,
};

describe("password recovery", () => {
  it("stores only a SHA-256 token hash and expires the token within one hour", async () => {
    const database = fakeDatabase(verifiedUser);
    const mail = capturingSender();
    const now = new Date("2026-07-22T12:00:00.000Z");

    await requestPasswordReset(verifiedUser.email, "203.0.113.1", {
      prisma: database.prisma as never,
      rateLimits: database.prisma.rateLimitAttempt as never,
      sender: mail.sender,
      now: () => now,
    });

    const rawToken = tokenFromMessage(mail.messages[0]!);
    expect(database.passwordTokens).toHaveLength(1);
    expect(database.passwordTokens[0]?.tokenHash).not.toBe(rawToken);
    expect(database.passwordTokens[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(database.passwordTokens[0]?.expiresAt).toEqual(
      new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
    );
  });

  it("returns the same response for missing and unverified accounts", async () => {
    const missing = fakeDatabase(null);
    const unverified = fakeDatabase({
      ...verifiedUser,
      emailVerified: null,
    });
    const missingMail = capturingSender();
    const unverifiedMail = capturingSender();

    const missingResult = await requestPasswordReset(
      verifiedUser.email,
      "203.0.113.2",
      {
        prisma: missing.prisma as never,
        rateLimits: missing.prisma.rateLimitAttempt as never,
        sender: missingMail.sender,
      },
    );
    const unverifiedResult = await requestPasswordReset(
      verifiedUser.email,
      "203.0.113.3",
      {
        prisma: unverified.prisma as never,
        rateLimits: unverified.prisma.rateLimitAttempt as never,
        sender: unverifiedMail.sender,
      },
    );

    expect(missingResult).toEqual({ message: PASSWORD_RESET_REQUEST_RESPONSE });
    expect(unverifiedResult).toEqual(missingResult);
    expect(missingMail.messages).toHaveLength(0);
    expect(unverifiedMail.messages).toHaveLength(0);
  });

  it("is single-use, rejects expiration, and increments the session version", async () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const database = fakeDatabase(verifiedUser);
    const mail = capturingSender();
    await requestPasswordReset(verifiedUser.email, "203.0.113.4", {
      prisma: database.prisma as never,
      rateLimits: database.prisma.rateLimitAttempt as never,
      sender: mail.sender,
      now: () => now,
    });
    const token = tokenFromMessage(mail.messages[0]!);

    await consumePasswordReset(
      {
        email: verifiedUser.email,
        token,
        newPassword: "new-password",
      },
      "203.0.113.4",
      {
        prisma: database.prisma as never,
        rateLimits: database.prisma.rateLimitAttempt as never,
        now: () => new Date(now.getTime() + 1_000),
      },
    );
    expect(database.currentUser()).toMatchObject({
      passwordHash: "hashed:new-password",
      sessionVersion: 1,
    });
    await expect(
      consumePasswordReset(
        {
          email: verifiedUser.email,
          token,
          newPassword: "another-password",
        },
        "203.0.113.4",
        {
          prisma: database.prisma as never,
          rateLimits: database.prisma.rateLimitAttempt as never,
          now: () => new Date(now.getTime() + 2_000),
        },
      ),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);

    const expired = fakeDatabase(verifiedUser);
    const expiredMail = capturingSender();
    await requestPasswordReset(verifiedUser.email, "203.0.113.5", {
      prisma: expired.prisma as never,
      rateLimits: expired.prisma.rateLimitAttempt as never,
      sender: expiredMail.sender,
      now: () => now,
    });
    await expect(
      consumePasswordReset(
        {
          email: verifiedUser.email,
          token: tokenFromMessage(expiredMail.messages[0]!),
          newPassword: "new-password",
        },
        "203.0.113.5",
        {
          prisma: expired.prisma as never,
          rateLimits: expired.prisma.rateLimitAttempt as never,
          now: () => new Date(now.getTime() + PASSWORD_RESET_TTL_MS + 1),
        },
      ),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
  });

  it("throws EmailDeliveryError instead of resolving when the send fails", async () => {
    const database = fakeDatabase(verifiedUser);

    await expect(
      requestPasswordReset(verifiedUser.email, "203.0.113.6", {
        prisma: database.prisma as never,
        rateLimits: database.prisma.rateLimitAttempt as never,
        sender: failingSender(),
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryError);
  });

  it("throws EmailDeliveryError when RESEND_API_KEY/EMAIL_FROM are unconfigured, without a sender override", async () => {
    // `~/env` is mocked to `{}` at the top of this file, so the default
    // applicationEmailSender sees both keys as unset.
    const database = fakeDatabase(verifiedUser);

    await expect(
      requestPasswordReset(verifiedUser.email, "203.0.113.7", {
        prisma: database.prisma as never,
        rateLimits: database.prisma.rateLimitAttempt as never,
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryError);
  });

  it("atomically rate-limits reset requests by email and source IP", async () => {
    const database = fakeDatabase(null);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await requestPasswordReset(verifiedUser.email, "198.51.100.7", {
        prisma: database.prisma as never,
        rateLimits: database.prisma.rateLimitAttempt as never,
      });
    }
    await expect(
      requestPasswordReset(verifiedUser.email, "198.51.100.7", {
        prisma: database.prisma as never,
        rateLimits: database.prisma.rateLimitAttempt as never,
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    const atomicUpdate =
      database.prisma.rateLimitAttempt[RATE_LIMIT_ATOMIC_UPDATE];
    expect(
      atomicUpdate.mock.calls
        .slice(0, 2)
        .map(([config]) => config.scope)
        .sort(),
    ).toEqual(["password-reset-request-email", "password-reset-request-ip"]);
  });

  it("atomically rate-limits reset consumption by email and source IP", async () => {
    const database = fakeDatabase(null);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await consumePasswordReset(
        {
          email: verifiedUser.email,
          token: `invalid-${attempt}`,
          newPassword: "new-password",
        },
        "198.51.100.8",
        {
          prisma: database.prisma as never,
          rateLimits: database.prisma.rateLimitAttempt as never,
        },
      ).catch(() => undefined);
    }
    await expect(
      consumePasswordReset(
        {
          email: verifiedUser.email,
          token: "invalid-over-limit",
          newPassword: "new-password",
        },
        "198.51.100.8",
        {
          prisma: database.prisma as never,
          rateLimits: database.prisma.rateLimitAttempt as never,
        },
      ),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    const atomicUpdate =
      database.prisma.rateLimitAttempt[RATE_LIMIT_ATOMIC_UPDATE];
    expect(
      atomicUpdate.mock.calls
        .slice(0, 2)
        .map(([config]) => config.scope)
        .sort(),
    ).toEqual(["password-reset-consume-email", "password-reset-consume-ip"]);
  });
});

describe("email verification", () => {
  it("stores a hashed 24-hour token and confirms it only once", async () => {
    const database = fakeDatabase({ ...verifiedUser, emailVerified: null });
    const mail = capturingSender();
    const now = new Date("2026-07-22T12:00:00.000Z");
    await requestEmailVerification(verifiedUser.id, verifiedUser.email, {
      prisma: database.prisma as never,
      sender: mail.sender,
      now: () => now,
    });
    const rawToken = tokenFromMessage(mail.messages[0]!);
    expect(database.verificationTokens[0]?.tokenHash).not.toBe(rawToken);
    expect(database.verificationTokens[0]?.expiresAt).toEqual(
      new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS),
    );

    await confirmEmailVerification(
      rawToken,
      database.prisma as never,
      new Date(now.getTime() + 1_000),
    );
    expect(database.currentUser()?.emailVerified).toEqual(
      new Date(now.getTime() + 1_000),
    );
    await expect(
      confirmEmailVerification(
        rawToken,
        database.prisma as never,
        new Date(now.getTime() + 2_000),
      ),
    ).rejects.toBeInstanceOf(InvalidEmailVerificationTokenError);
  });

  it("throws EmailDeliveryError instead of resolving when the send fails", async () => {
    const database = fakeDatabase({ ...verifiedUser, emailVerified: null });

    await expect(
      requestEmailVerification(verifiedUser.id, verifiedUser.email, {
        prisma: database.prisma as never,
        sender: failingSender(),
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryError);
  });
});
