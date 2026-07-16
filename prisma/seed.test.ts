import { describe, expect, it, vi } from "vitest";

import { Role } from "../generated/prisma";
import { verifyPassword } from "../src/server/auth/password";
import { seedAdmin } from "./seed";

describe("admin seed", () => {
  it("creates the first admin and prints a generated password once", async () => {
    const users = {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: "admin-1" }),
    };
    const log = vi.fn();

    await seedAdmin({
      users,
      generatePassword: () => "generated-password",
      log,
    });

    expect(users.create).toHaveBeenCalledOnce();
    const createArgs = users.create.mock.calls[0]?.[0];
    expect(createArgs?.data).toMatchObject({
      username: "admin",
      role: Role.ADMIN,
      displayName: "Admin",
    });
    await expect(
      verifyPassword("generated-password", createArgs!.data.passwordHash),
    ).resolves.toBe(true);
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      "Seeded admin password (shown once): generated-password",
    );
  });

  it("does nothing when any user already exists", async () => {
    const users = {
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn(),
    };
    const log = vi.fn();

    await seedAdmin({ users, log });

    expect(users.create).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
