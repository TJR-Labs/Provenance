import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

import { PrismaClient, Role, type User } from "../generated/prisma";
import { hashPassword } from "../src/server/auth/password";

type SeedUsers = {
  count: () => Promise<number>;
  create: (args: {
    data: Pick<User, "username" | "passwordHash" | "role" | "displayName">;
  }) => Promise<unknown>;
};

type SeedAdminOptions = {
  users: SeedUsers;
  adminPassword?: string;
  generatePassword?: () => string;
  log?: (message: string) => void;
};

export async function seedAdmin({
  users,
  adminPassword,
  generatePassword = () => randomBytes(18).toString("base64url"),
  log = console.log,
}: SeedAdminOptions) {
  if ((await users.count()) > 0) {
    return { created: false as const };
  }

  const generated = !adminPassword;
  const password = adminPassword || generatePassword();
  const passwordHash = await hashPassword(password);

  await users.create({
    data: {
      username: "admin",
      passwordHash,
      role: Role.ADMIN,
      displayName: "Admin",
    },
  });

  if (generated) {
    log(`Seeded admin password (shown once): ${password}`);
  }

  return { created: true as const, generatedPassword: generated };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedAdmin({
      users: prisma.user,
      adminPassword: process.env.ADMIN_PASSWORD,
    });
  } finally {
    await prisma.$disconnect();
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  await main();
}
