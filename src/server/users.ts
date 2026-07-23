import { createHash, randomBytes } from "node:crypto";

import { Role, type Prisma, type PrismaClient } from "../../generated/prisma";
import { z } from "zod";

import { safeExternalUrl } from "~/app/safe-external-url";
import { PROFILE_THEMES } from "~/lib/profile-theme";
import {
  DuplicateEmailError,
  emailSchema,
  normalizeAccountEmail,
} from "~/server/account-email";
import { hashPassword, verifyPassword } from "~/server/auth/password";
import { db } from "~/server/db";
import {
  assertNotLockedOut,
  recordRateLimitFailure,
  resetRateLimit,
  type RateLimitDelegate,
} from "~/server/rate-limit";

type UserDelegate = Pick<
  PrismaClient["user"],
  "create" | "findUnique" | "update"
>;

const CHANGE_PASSWORD_RATE_LIMIT_SCOPE = "change-password";
const CHANGE_PASSWORD_FAILURE_THRESHOLD = 10;
const CHANGE_PASSWORD_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const CHANGE_PASSWORD_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const oauthUserSelect = {
  id: true,
  username: true,
  email: true,
  emailVerified: true,
  sessionVersion: true,
  role: true,
  displayName: true,
  banned: true,
  passwordHash: true,
} satisfies Prisma.UserSelect;

export const oauthProviderSchema = z.enum(["google", "github"]);
export type OAuthProvider = z.infer<typeof oauthProviderSchema>;

export const OAUTH_LINK_COOKIE = "provenance.oauth-link";
const OAUTH_FLOW_TTL_MS = 10 * 60 * 1000;

const reservedUsernames = new Set([
  "account",
  "admin",
  "api",
  "login",
  "privacy",
  "profile",
  "projects",
  "signup",
  "terms",
]);

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(30, "Username must be 30 characters or fewer.")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Username can only contain letters, numbers, underscores, and hyphens.",
  )
  .refine(
    (username) => !reservedUsernames.has(username.toLowerCase()),
    "That username is reserved.",
  );

export const createUserInputSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1, "Display name is required.").max(80),
  email: emailSchema,
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const profileLinkSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: z
    .string()
    .trim()
    .url()
    .refine(
      (value) => Boolean(safeExternalUrl(value)),
      "Enter a valid http(s) URL.",
    ),
});

export const profileThemes = PROFILE_THEMES;
export const profileSections = ["about", "projects", "links"] as const;

export const profileContentInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(2000).optional(),
  school: z.string().trim().max(160).optional(),
  avatarUrl: z.string().trim().url().optional().or(z.literal("")),
  links: z.array(profileLinkSchema).max(12),
});

export const updateProfileInputSchema = profileContentInputSchema.extend({
  theme: z.enum(profileThemes),
  layoutSections: z.array(z.enum(profileSections)).max(profileSections.length),
  customCss: z.string().max(20_000).optional(),
  private: z.boolean().optional().default(false),
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

export class DuplicateUsernameError extends Error {
  constructor() {
    super("That username is already in use.");
    this.name = "DuplicateUsernameError";
  }
}

export class InvalidCurrentPasswordError extends Error {
  constructor() {
    super("Current password is incorrect.");
    this.name = "InvalidCurrentPasswordError";
  }
}

export class InvalidOAuthFlowError extends Error {
  constructor() {
    super("This OAuth request is invalid or has expired. Please try again.");
    this.name = "InvalidOAuthFlowError";
  }
}

export class OAuthAccountAlreadyLinkedError extends Error {
  constructor() {
    super("That provider account is already linked to a different user.");
    this.name = "OAuthAccountAlreadyLinkedError";
  }
}

export class OAuthProviderAlreadyLinkedError extends Error {
  constructor(provider: OAuthProvider) {
    super(
      `A ${provider === "google" ? "Google" : "GitHub"} account is already linked.`,
    );
    this.name = "OAuthProviderAlreadyLinkedError";
  }
}

export class LastSignInMethodError extends Error {
  constructor() {
    super("Set a password before unlinking your only connected account.");
    this.name = "LastSignInMethodError";
  }
}

export class PasswordAlreadySetError extends Error {
  constructor() {
    super("A password is already set for this account.");
    this.name = "PasswordAlreadySetError";
  }
}

export class OAuthUserBannedError extends Error {
  constructor() {
    super("This account is not permitted to sign in.");
    this.name = "OAuthUserBannedError";
  }
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function normalizeEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  return normalized;
}

function oauthDisplayName(name: string | null, username: string) {
  const normalized = name?.trim();
  if (!normalized) return username;
  return normalized;
}

function createOAuthToken() {
  return randomBytes(32).toString("base64url");
}

function hashOAuthToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function oauthUsernamePickerPath(token: string) {
  return `/signup/username?token=${encodeURIComponent(token)}`;
}

function assertActiveUser(user: { banned: boolean }) {
  if (user.banned) throw new OAuthUserBannedError();
}

type OAuthAccountDelegate = Pick<
  Prisma.TransactionClient["account"],
  "create" | "findFirst" | "findUnique"
>;

async function createAccountLink(
  userId: string,
  provider: OAuthProvider,
  providerAccountId: string,
  accounts: OAuthAccountDelegate,
) {
  const linkedAccount = await accounts.findUnique({
    where: {
      provider_providerAccountId: { provider, providerAccountId },
    },
    select: { userId: true },
  });
  if (linkedAccount) {
    if (linkedAccount.userId !== userId) {
      throw new OAuthAccountAlreadyLinkedError();
    }
    return;
  }

  const existingProvider = await accounts.findFirst({
    where: { userId, provider },
    select: { id: true },
  });
  if (existingProvider) throw new OAuthProviderAlreadyLinkedError(provider);

  try {
    await accounts.create({
      data: { userId, provider, providerAccountId },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const racedAccount = await accounts.findUnique({
        where: {
          provider_providerAccountId: { provider, providerAccountId },
        },
        select: { userId: true },
      });
      if (racedAccount?.userId === userId) return;
      throw new OAuthAccountAlreadyLinkedError();
    }
    throw error;
  }
}

export type OAuthSignInProfile = {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
};

export async function linkOAuthAccount(
  userId: string,
  provider: OAuthProvider,
  providerAccountId: string,
  database: PrismaClient = db,
) {
  const parsedProvider = oauthProviderSchema.parse(provider);
  const user = await database.user.findUnique({
    where: { id: userId },
    select: { banned: true },
  });
  if (!user) throw new InvalidOAuthFlowError();
  assertActiveUser(user);
  await createAccountLink(
    userId,
    parsedProvider,
    providerAccountId,
    database.account,
  );
}

export async function resolveOAuthSignIn(
  rawProfile: OAuthSignInProfile,
  database: PrismaClient = db,
) {
  const profile = {
    ...rawProfile,
    provider: oauthProviderSchema.parse(rawProfile.provider),
    email: normalizeEmail(rawProfile.email),
  };
  const linkedAccount = await database.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    },
    select: { user: { select: oauthUserSelect } },
  });
  if (linkedAccount) {
    assertActiveUser(linkedAccount.user);
    if (
      profile.emailVerified &&
      profile.email &&
      linkedAccount.user.email === profile.email &&
      !linkedAccount.user.emailVerified
    ) {
      const verifiedUser = await database.user.update({
        where: { id: linkedAccount.user.id },
        data: { emailVerified: new Date() },
        select: oauthUserSelect,
      });
      return { kind: "user" as const, user: verifiedUser };
    }
    return { kind: "user" as const, user: linkedAccount.user };
  }

  if (profile.emailVerified && profile.email) {
    const emailUser = await database.user.findUnique({
      where: { email: profile.email },
      select: oauthUserSelect,
    });
    if (emailUser) {
      assertActiveUser(emailUser);
      const verifiedUser = emailUser.emailVerified
        ? emailUser
        : await database.user.update({
            where: { id: emailUser.id },
            data: { emailVerified: new Date() },
            select: oauthUserSelect,
          });
      await createAccountLink(
        verifiedUser.id,
        profile.provider,
        profile.providerAccountId,
        database.account,
      );
      return { kind: "user" as const, user: verifiedUser };
    }
  }

  const now = new Date();
  await database.pendingOAuthSignup.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: now } },
        {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
          completedUserId: null,
        },
      ],
    },
  });
  const token = createOAuthToken();
  await database.pendingOAuthSignup.create({
    data: {
      tokenHash: hashOAuthToken(token),
      provider: profile.provider,
      providerAccountId: profile.providerAccountId,
      email: profile.email,
      emailVerified: profile.emailVerified,
      name: profile.name,
      expiresAt: new Date(now.getTime() + OAUTH_FLOW_TTL_MS),
    },
  });
  return { kind: "pending" as const, token };
}

export async function getPendingOAuthSignup(
  token: string,
  database: PrismaClient = db,
) {
  const pending = await database.pendingOAuthSignup.findUnique({
    where: { tokenHash: hashOAuthToken(token) },
    select: {
      provider: true,
      name: true,
      expiresAt: true,
      completedUserId: true,
    },
  });
  if (!pending || pending.expiresAt <= new Date() || pending.completedUserId) {
    return null;
  }
  return {
    provider: oauthProviderSchema.parse(pending.provider),
    name: pending.name,
  };
}

export async function completeOAuthSignup(
  token: string,
  rawUsername: string,
  database: PrismaClient = db,
) {
  const username = usernameSchema.parse(rawUsername).toLowerCase();
  const tokenHash = hashOAuthToken(token);

  try {
    return await database.$transaction(async (transaction) => {
      const pending = await transaction.pendingOAuthSignup.findUnique({
        where: { tokenHash },
      });
      if (!pending || pending.expiresAt <= new Date()) {
        throw new InvalidOAuthFlowError();
      }
      if (pending.completedUserId) {
        const completedUser = await transaction.user.findUnique({
          where: { id: pending.completedUserId },
          select: oauthUserSelect,
        });
        if (!completedUser) throw new InvalidOAuthFlowError();
        assertActiveUser(completedUser);
        return completedUser;
      }

      const provider = oauthProviderSchema.parse(pending.provider);
      const verifiedEmail = pending.emailVerified
        ? normalizeEmail(pending.email)
        : null;
      if (verifiedEmail) {
        const emailUser = await transaction.user.findUnique({
          where: { email: verifiedEmail },
          select: oauthUserSelect,
        });
        if (emailUser) {
          assertActiveUser(emailUser);
          const verifiedUser = emailUser.emailVerified
            ? emailUser
            : await transaction.user.update({
                where: { id: emailUser.id },
                data: { emailVerified: new Date() },
                select: oauthUserSelect,
              });
          await createAccountLink(
            verifiedUser.id,
            provider,
            pending.providerAccountId,
            transaction.account,
          );
          await transaction.pendingOAuthSignup.update({
            where: { id: pending.id },
            data: { completedUserId: verifiedUser.id },
          });
          return verifiedUser;
        }
      }

      const duplicateUsername = await transaction.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (duplicateUsername) throw new DuplicateUsernameError();

      const user = await transaction.user.create({
        data: {
          username,
          displayName: oauthDisplayName(pending.name, username),
          email: verifiedEmail,
          emailVerified: verifiedEmail ? new Date() : null,
          passwordHash: null,
          role: Role.USER,
        },
        select: oauthUserSelect,
      });
      await transaction.account.create({
        data: {
          userId: user.id,
          provider,
          providerAccountId: pending.providerAccountId,
        },
      });
      await transaction.pendingOAuthSignup.update({
        where: { id: pending.id },
        data: { completedUserId: user.id },
      });
      return user;
    });
  } catch (error) {
    if (error instanceof DuplicateUsernameError) throw error;
    if (isUniqueConstraintError(error)) {
      const duplicateUsername = await database.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (duplicateUsername) throw new DuplicateUsernameError();
    }
    throw error;
  }
}

export async function consumeCompletedOAuthSignup(
  token: string,
  database: PrismaClient = db,
) {
  const tokenHash = hashOAuthToken(token);
  return database.$transaction(async (transaction) => {
    const pending = await transaction.pendingOAuthSignup.findUnique({
      where: { tokenHash },
      select: { id: true, expiresAt: true, completedUserId: true },
    });
    if (
      !pending ||
      pending.expiresAt <= new Date() ||
      !pending.completedUserId
    ) {
      return null;
    }
    const user = await transaction.user.findUnique({
      where: { id: pending.completedUserId },
      select: oauthUserSelect,
    });
    await transaction.pendingOAuthSignup.delete({ where: { id: pending.id } });
    if (!user || user.banned) return null;
    return user;
  });
}

export async function beginOAuthLink(
  userId: string,
  provider: OAuthProvider,
  database: PrismaClient = db,
) {
  const parsedProvider = oauthProviderSchema.parse(provider);
  const user = await database.user.findUnique({
    where: { id: userId },
    select: { banned: true },
  });
  if (!user) throw new InvalidOAuthFlowError();
  assertActiveUser(user);

  const now = new Date();
  await database.oAuthLinkIntent.deleteMany({
    where: {
      OR: [{ expiresAt: { lte: now } }, { userId, provider: parsedProvider }],
    },
  });
  const token = createOAuthToken();
  await database.oAuthLinkIntent.create({
    data: {
      tokenHash: hashOAuthToken(token),
      userId,
      provider: parsedProvider,
      expiresAt: new Date(now.getTime() + OAUTH_FLOW_TTL_MS),
    },
  });
  return token;
}

export async function completeOAuthLink(
  token: string,
  profile: Pick<OAuthSignInProfile, "provider" | "providerAccountId">,
  database: PrismaClient = db,
) {
  const tokenHash = hashOAuthToken(token);
  const provider = oauthProviderSchema.parse(profile.provider);
  return database.$transaction(async (transaction) => {
    const intent = await transaction.oAuthLinkIntent.findUnique({
      where: { tokenHash },
    });
    if (
      !intent ||
      intent.expiresAt <= new Date() ||
      intent.provider !== provider
    ) {
      throw new InvalidOAuthFlowError();
    }
    const user = await transaction.user.findUnique({
      where: { id: intent.userId },
      select: oauthUserSelect,
    });
    if (!user) throw new InvalidOAuthFlowError();
    assertActiveUser(user);
    await createAccountLink(
      user.id,
      provider,
      profile.providerAccountId,
      transaction.account,
    );
    await transaction.oAuthLinkIntent.delete({ where: { id: intent.id } });
    return user;
  });
}

export async function getAccountSecurity(
  userId: string,
  database: PrismaClient = db,
) {
  const user = await database.user.findUnique({
    where: { id: userId },
    select: {
      passwordHash: true,
      email: true,
      emailVerified: true,
      accounts: { select: { provider: true } },
    },
  });
  if (!user) throw new InvalidOAuthFlowError();
  return {
    hasPassword: Boolean(user.passwordHash),
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    linkedProviders: user.accounts.map((account) =>
      oauthProviderSchema.parse(account.provider),
    ),
  };
}

export async function unlinkOAuthAccount(
  userId: string,
  provider: OAuthProvider,
  database: PrismaClient = db,
) {
  const parsedProvider = oauthProviderSchema.parse(provider);
  await database.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw new InvalidOAuthFlowError();

    const account = await transaction.account.findFirst({
      where: { userId, provider: parsedProvider },
      select: { id: true },
    });
    if (!account) throw new InvalidOAuthFlowError();

    const linkedAccountCount = await transaction.account.count({
      where: { userId },
    });
    if (!user.passwordHash && linkedAccountCount <= 1) {
      throw new LastSignInMethodError();
    }
    await transaction.account.delete({ where: { id: account.id } });
  });
}

export async function setPassword(
  userId: string,
  newPassword: string,
  database: PrismaClient = db,
) {
  const password = z
    .string()
    .min(8, "New password must be at least 8 characters.")
    .parse(newPassword);
  const user = await database.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) throw new InvalidOAuthFlowError();
  if (user.passwordHash) throw new PasswordAlreadySetError();

  const result = await database.user.updateMany({
    where: { id: userId, passwordHash: null },
    data: {
      passwordHash: await hashPassword(password),
      sessionVersion: { increment: 1 },
    },
  });
  if (result.count !== 1) throw new PasswordAlreadySetError();
}

export async function createUser(
  rawInput: CreateUserInput,
  users: UserDelegate = db.user,
) {
  const input = createUserInputSchema.parse(rawInput);
  const username = input.username.toLowerCase();
  const email = normalizeAccountEmail(input.email);

  const existingUser = await users.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existingUser) throw new DuplicateUsernameError();
  const existingEmail = await users.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingEmail) throw new DuplicateEmailError();

  const passwordHash = await hashPassword(input.password);
  try {
    return await users.create({
      data: {
        username,
        email,
        emailVerified: null,
        displayName: input.displayName,
        role: Role.USER,
        passwordHash,
      },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const duplicateEmail = await users.findUnique({
        where: { email },
        select: { id: true },
      });
      if (duplicateEmail) throw new DuplicateEmailError();
      throw new DuplicateUsernameError();
    }
    throw error;
  }
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  users: UserDelegate = db.user,
  rateLimits: RateLimitDelegate = db.rateLimitAttempt,
) {
  await assertNotLockedOut(
    CHANGE_PASSWORD_RATE_LIMIT_SCOPE,
    userId,
    rateLimits,
    "Too many incorrect current-password attempts. Please try again later.",
  );

  const user = await users.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    await recordRateLimitFailure(
      {
        scope: CHANGE_PASSWORD_RATE_LIMIT_SCOPE,
        key: userId,
        limit: CHANGE_PASSWORD_FAILURE_THRESHOLD,
        windowMs: CHANGE_PASSWORD_ATTEMPT_WINDOW_MS,
        lockoutMs: CHANGE_PASSWORD_LOCKOUT_DURATION_MS,
      },
      rateLimits,
    );
    throw new InvalidCurrentPasswordError();
  }

  await users.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(newPassword),
      sessionVersion: { increment: 1 },
    },
  });

  await resetRateLimit(CHANGE_PASSWORD_RATE_LIMIT_SCOPE, userId, rateLimits);
}

export async function updateProfile(
  userId: string,
  rawInput: UpdateProfileInput,
  users: UserDelegate = db.user,
) {
  const input = updateProfileInputSchema.parse(rawInput);
  const nullable = (value: string | undefined) =>
    value && value.length > 0 ? value : null;
  return users.update({
    where: { id: userId },
    data: {
      displayName: input.displayName,
      bio: nullable(input.bio),
      school: nullable(input.school),
      avatarUrl: nullable(input.avatarUrl),
      links: input.links,
      theme: input.theme,
      layoutSections: [...new Set(input.layoutSections)],
      customCss: nullable(input.customCss),
      private: input.private,
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      school: true,
      avatarUrl: true,
      links: true,
      theme: true,
      layoutSections: true,
      customCss: true,
      private: true,
    },
  });
}

export async function banUser(userId: string, users: UserDelegate = db.user) {
  return users.update({
    where: { id: userId },
    data: { banned: true },
    select: { id: true, username: true, banned: true },
  });
}
