import { describe, expect, it, vi } from "vitest";

import { Role } from "../../generated/prisma";
import { hashPassword } from "~/server/auth/password";
import {
  changePassword,
  createUser,
  createUserInputSchema,
  DuplicateUsernameError,
  InvalidCurrentPasswordError,
} from "~/server/users";

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
          username: "ADMIN",
          displayName: "Another Admin",
          role: Role.ADMIN,
          companyName: "",
          password: "initial-password",
        },
        users as never,
      ),
    ).rejects.toBeInstanceOf(DuplicateUsernameError);

    expect(users.findUnique).toHaveBeenCalledWith({
      where: { username: "admin" },
      select: { id: true },
    });
    expect(users.create).not.toHaveBeenCalled();
  });

  it("requires a company name for company users", () => {
    const result = createUserInputSchema.safeParse({
      username: "company-user",
      displayName: "Company User",
      role: Role.COMPANY,
      companyName: "",
      password: "initial-password",
    });

    expect(result.success).toBe(false);
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
      ),
    ).rejects.toBeInstanceOf(InvalidCurrentPasswordError);
    expect(users.update).not.toHaveBeenCalled();
  });
});
