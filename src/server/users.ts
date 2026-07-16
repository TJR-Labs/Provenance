import { Role, type PrismaClient } from "../../generated/prisma";
import { z } from "zod";

import { hashPassword, verifyPassword } from "~/server/auth/password";
import { db } from "~/server/db";

type UserDelegate = Pick<
  PrismaClient["user"],
  "create" | "findUnique" | "update"
>;

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
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const profileLinkSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: z.string().trim().url(),
});

export const profileThemes = ["default", "paper", "studio"] as const;
export const profileSections = ["about", "projects", "links"] as const;

export const updateProfileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(2000).optional(),
  school: z.string().trim().max(160).optional(),
  avatarUrl: z.string().trim().url().optional().or(z.literal("")),
  links: z.array(profileLinkSchema).max(12),
  theme: z.enum(profileThemes),
  layoutSections: z.array(z.enum(profileSections)).max(profileSections.length),
  customCss: z.string().max(20_000).optional(),
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

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function createUser(
  rawInput: CreateUserInput,
  users: UserDelegate = db.user,
) {
  const input = createUserInputSchema.parse(rawInput);
  const username = input.username.toLowerCase();

  const existingUser = await users.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existingUser) throw new DuplicateUsernameError();

  const passwordHash = await hashPassword(input.password);
  try {
    return await users.create({
      data: {
        username,
        displayName: input.displayName,
        role: Role.USER,
        passwordHash,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        createdAt: true,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new DuplicateUsernameError();
    throw error;
  }
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  users: UserDelegate = db.user,
) {
  const user = await users.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new InvalidCurrentPasswordError();
  }

  await users.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
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
