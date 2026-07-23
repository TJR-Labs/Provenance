import { createHash, randomBytes } from "node:crypto";

import type { PrismaClient } from "../../generated/prisma";
import { z } from "zod";

import {
  accountEmailRateLimitKey,
  DuplicateEmailError,
  normalizeAccountEmail,
} from "~/server/account-email";
import { hashPassword } from "~/server/auth/password";
import { db } from "~/server/db";
import {
  applicationEmailSender,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  type EmailSender,
} from "~/server/email";
import {
  assertNotLockedOut,
  recordRateLimitFailure,
  resetRateLimit,
  type RateLimitDelegate,
} from "~/server/rate-limit";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_REQUEST_RESPONSE =
  "If a verified credentials account uses that email, a reset link has been sent.";

const REQUEST_LIMIT = 5;
const CONSUME_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000;
const REQUEST_EMAIL_SCOPE = "password-reset-request-email";
const REQUEST_IP_SCOPE = "password-reset-request-ip";
const CONSUME_EMAIL_SCOPE = "password-reset-consume-email";
const CONSUME_IP_SCOPE = "password-reset-consume-ip";

export class InvalidPasswordResetTokenError extends Error {
  constructor() {
    super("This password reset link is invalid or has expired.");
    this.name = "InvalidPasswordResetTokenError";
  }
}

export class InvalidEmailVerificationTokenError extends Error {
  constructor() {
    super("This email verification link is invalid or has expired.");
    this.name = "InvalidEmailVerificationTokenError";
  }
}

export class EmailDeliveryError extends Error {
  constructor() {
    super("Email delivery failed.");
    this.name = "EmailDeliveryError";
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createToken() {
  return randomBytes(32).toString("base64url");
}

async function recordBoundedAttempt(
  scopes: [accountScope: string, ipScope: string],
  email: string,
  sourceIp: string,
  limit: number,
  rateLimits: RateLimitDelegate,
) {
  const keys = [
    { scope: scopes[0], key: accountEmailRateLimitKey(email) },
    { scope: scopes[1], key: sourceIp },
  ] as const;

  await Promise.all(
    keys.map(({ scope, key }) => assertNotLockedOut(scope, key, rateLimits)),
  );
  await Promise.all(
    keys.map(({ scope, key }) =>
      recordRateLimitFailure(
        {
          scope,
          key,
          limit,
          windowMs: RATE_LIMIT_WINDOW_MS,
          lockoutMs: RATE_LIMIT_LOCKOUT_MS,
        },
        rateLimits,
      ),
    ),
  );
  return keys;
}

async function deliverOrThrow(deliver: () => Promise<void>) {
  try {
    await deliver();
  } catch {
    // This message intentionally contains no address, token, user id, or
    // provider response. The token is still valid and delivery is retryable.
    console.error("Transactional account email delivery failed.");
    throw new EmailDeliveryError();
  }
}

export async function requestPasswordReset(
  rawEmail: string,
  sourceIp: string,
  dependencies: {
    prisma?: PrismaClient;
    rateLimits?: RateLimitDelegate;
    sender?: EmailSender;
    now?: () => Date;
  } = {},
) {
  const email = normalizeAccountEmail(rawEmail);
  const prisma = dependencies.prisma ?? db;
  const rateLimits = dependencies.rateLimits ?? prisma.rateLimitAttempt;
  await recordBoundedAttempt(
    [REQUEST_EMAIL_SCOPE, REQUEST_IP_SCOPE],
    email,
    sourceIp,
    REQUEST_LIMIT,
    rateLimits,
  );

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      passwordHash: true,
    },
  });
  if (!user?.email || !user.emailVerified || !user.passwordHash) {
    return { message: PASSWORD_RESET_REQUEST_RESPONSE };
  }

  const now = dependencies.now?.() ?? new Date();
  const token = createToken();
  await prisma.$transaction(async (transaction) => {
    await transaction.passwordResetToken.deleteMany({
      where: { userId: user.id, consumedAt: null },
    });
    await transaction.passwordResetToken.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
      },
    });
  });

  await deliverOrThrow(() =>
    sendPasswordResetEmail(
      user.email!,
      token,
      dependencies.sender ?? applicationEmailSender,
    ),
  );
  return { message: PASSWORD_RESET_REQUEST_RESPONSE };
}

export async function consumePasswordReset(
  input: { email: string; token: string; newPassword: string },
  sourceIp: string,
  dependencies: {
    prisma?: PrismaClient;
    rateLimits?: RateLimitDelegate;
    now?: () => Date;
  } = {},
) {
  const email = normalizeAccountEmail(input.email);
  const password = z
    .string()
    .min(8, "New password must be at least 8 characters.")
    .parse(input.newPassword);
  const prisma = dependencies.prisma ?? db;
  const rateLimits = dependencies.rateLimits ?? prisma.rateLimitAttempt;
  const limiterKeys = await recordBoundedAttempt(
    [CONSUME_EMAIL_SCOPE, CONSUME_IP_SCOPE],
    email,
    sourceIp,
    CONSUME_LIMIT,
    rateLimits,
  );
  const now = dependencies.now?.() ?? new Date();
  const passwordHash = await hashPassword(password);

  const changed = await prisma.$transaction(async (transaction) => {
    const resetToken = await transaction.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        consumedAt: true,
        user: {
          select: {
            email: true,
            emailVerified: true,
            passwordHash: true,
          },
        },
      },
    });
    if (
      !resetToken ||
      resetToken.consumedAt ||
      resetToken.expiresAt <= now ||
      resetToken.user.email !== email ||
      !resetToken.user.emailVerified ||
      !resetToken.user.passwordHash
    ) {
      return false;
    }

    const claimed = await transaction.passwordResetToken.updateMany({
      where: {
        id: resetToken.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1) return false;

    await transaction.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    });
    await transaction.passwordResetToken.updateMany({
      where: { userId: resetToken.userId, consumedAt: null },
      data: { consumedAt: now },
    });
    return true;
  });

  if (!changed) throw new InvalidPasswordResetTokenError();
  await Promise.all(
    limiterKeys.map(({ scope, key }) => resetRateLimit(scope, key, rateLimits)),
  );
}

export async function requestEmailVerification(
  userId: string,
  rawEmail: string,
  dependencies: {
    prisma?: PrismaClient;
    sender?: EmailSender;
    now?: () => Date;
  } = {},
) {
  const email = normalizeAccountEmail(rawEmail);
  const prisma = dependencies.prisma ?? db;
  const now = dependencies.now?.() ?? new Date();
  const token = createToken();

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: { email: true, emailVerified: true },
      });
      if (!user) throw new InvalidEmailVerificationTokenError();
      if (user.email === email && user.emailVerified) {
        return { alreadyVerified: true as const };
      }

      const duplicate = await transaction.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (duplicate && duplicate.id !== userId) throw new DuplicateEmailError();

      await transaction.user.update({
        where: { id: userId },
        data: {
          email,
          emailVerified: user.email === email ? user.emailVerified : null,
        },
      });
      await transaction.emailVerificationToken.deleteMany({
        where: { userId, consumedAt: null },
      });
      await transaction.emailVerificationToken.create({
        data: {
          tokenHash: hashToken(token),
          userId,
          email,
          expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS),
        },
      });
      return { alreadyVerified: false as const };
    });

    if (!result.alreadyVerified) {
      await deliverOrThrow(() =>
        sendEmailVerificationEmail(
          email,
          token,
          dependencies.sender ?? applicationEmailSender,
        ),
      );
    }
    return result;
  } catch (error) {
    if (
      error instanceof DuplicateEmailError ||
      error instanceof InvalidEmailVerificationTokenError ||
      error instanceof EmailDeliveryError
    ) {
      throw error;
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new DuplicateEmailError();
    }
    throw error;
  }
}

export async function adminForcePasswordReset(
  userId: string,
  dependencies: {
    prisma?: PrismaClient;
    sender?: EmailSender;
    now?: () => Date;
  } = {},
) {
  const prisma = dependencies.prisma ?? db;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) return null;

  const now = dependencies.now?.() ?? new Date();
  const token = createToken();
  await prisma.$transaction(async (transaction) => {
    await transaction.passwordResetToken.deleteMany({
      where: { userId: user.id, consumedAt: null },
    });
    await transaction.passwordResetToken.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
      },
    });
  });

  let emailSent = false;
  if (user.email) {
    try {
      await sendPasswordResetEmail(
        user.email,
        token,
        dependencies.sender ?? applicationEmailSender,
      );
      emailSent = true;
    } catch {
      // Support can still relay the token out-of-band via the logged line
      // below when the provider is down.
    }
  }
  if (!emailSent) {
    console.info("Admin-issued password reset token for out-of-band relay.", {
      userId: user.id,
      token,
    });
  }
  return { emailSent };
}

export async function confirmEmailVerification(
  token: string,
  database: PrismaClient = db,
  now = new Date(),
) {
  const verified = await database.$transaction(async (transaction) => {
    const verification = await transaction.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        userId: true,
        email: true,
        expiresAt: true,
        consumedAt: true,
      },
    });
    if (
      !verification ||
      verification.consumedAt ||
      verification.expiresAt <= now
    ) {
      return false;
    }

    const claimed = await transaction.emailVerificationToken.updateMany({
      where: {
        id: verification.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1) return false;

    const user = await transaction.user.updateMany({
      where: { id: verification.userId, email: verification.email },
      data: { emailVerified: now },
    });
    return user.count === 1;
  });

  if (!verified) throw new InvalidEmailVerificationTokenError();
}
