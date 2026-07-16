import type { PrismaClient } from "../../generated/prisma";

import { db } from "~/server/db";

type UserReader = Pick<PrismaClient["user"], "findFirst">;
type ProjectReader = Pick<PrismaClient["project"], "findMany">;

export async function getPublicProfile(
  username: string,
  users: UserReader = db.user,
  projects: ProjectReader = db.project,
) {
  const profile = await users.findFirst({
    where: { username: username.toLowerCase(), banned: false },
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
      projects: {
        include: { media: { orderBy: { order: "asc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!profile) return null;

  const categories = await projects.findMany({
    where: { userId: profile.id },
    distinct: ["category"],
    select: { category: true },
  });

  return { ...profile, categories: categories.map(({ category }) => category) };
}
