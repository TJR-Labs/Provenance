import { describe, expect, it } from "vitest";

import {
  hashPassword,
  PASSWORD_HASH_COST,
  verifyPassword,
} from "~/server/auth/password";

describe("password hashing", () => {
  it("hashes and verifies a password with the required bcrypt cost", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");

    expect(passwordHash).not.toContain("correct horse battery staple");
    expect(Number(passwordHash.split("$")[2])).toBe(PASSWORD_HASH_COST);
    await expect(
      verifyPassword("correct horse battery staple", passwordHash),
    ).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const passwordHash = await hashPassword("right-password");

    await expect(verifyPassword("wrong-password", passwordHash)).resolves.toBe(
      false,
    );
  });
});
