import { Role, type PrismaClient } from "../../generated/prisma";
import { z } from "zod";

import { db } from "~/server/db";
import { hashPassword, verifyPassword } from "~/server/auth/password";

type UserDelegate = Pick<
  PrismaClient["user"],
  "create" | "findUnique" | "update"
>;

export const createUserInputSchema = z
  .object({
    username: z.string().trim().min(1, "Username is required."),
    displayName: z.string().trim().min(1, "Display name is required."),
    role: z.nativeEnum(Role),
    companyName: z.string().trim().optional(),
    password: z.string().min(1, "Initial password is required."),
  })
  .superRefine((input, context) => {
    if (input.role === Role.COMPANY && !input.companyName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Company name is required for company users.",
        path: ["companyName"],
      });
    }
  });

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

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
  const companyName =
    input.companyName === "" ? null : (input.companyName ?? null);

  const existingUser = await users.findUnique({
    where: { username },
    select: { id: true },
  });

  if (existingUser) {
    throw new DuplicateUsernameError();
  }

  const passwordHash = await hashPassword(input.password);

  try {
    return await users.create({
      data: {
        username,
        displayName: input.displayName,
        role: input.role,
        companyName,
        passwordHash,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        companyName: true,
        createdAt: true,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
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
) {
  const user = await users.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new InvalidCurrentPasswordError();
  }

  const passwordHash = await hashPassword(newPassword);
  await users.update({
    where: { id: userId },
    data: { passwordHash },
  });
}
