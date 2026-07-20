import type { PrismaClient } from "../../generated/prisma";

import { db } from "~/server/db";

type UserReader = Pick<PrismaClient["user"], "findFirst">;
type ProjectReader = Pick<PrismaClient["project"], "findMany">;
type CanvasElementReader = Pick<PrismaClient["canvasElement"], "findMany">;

export async function getPublicProfile(
  username: string,
  viewerId: string | null,
  users: UserReader = db.user,
  projects: ProjectReader = db.project,
  canvasElements: CanvasElementReader = db.canvasElement,
) {
  const projectWhere = viewerId
    ? { OR: [{ userId: viewerId }, { private: false }] }
    : { private: false };
  const profile = await users.findFirst({
    where: { username: username.toLowerCase(), banned: false },
    select: {
      id: true,
      private: true,
      username: true,
      displayName: true,
      bio: true,
      school: true,
      avatarUrl: true,
      links: true,
      theme: true,
      canvasBackgroundColor: true,
      canvasBackgroundImageUrl: true,
      layoutSections: true,
      layoutMode: true,
      customCss: true,
      projects: {
        where: projectWhere,
        include: { media: { orderBy: { order: "asc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!profile) return null;
  const isOwner = viewerId != null && profile.id === viewerId;
  if (profile.private && !isOwner) return { isPrivate: true as const };

  const [categories, publishedCanvasElements] = await Promise.all([
    projects.findMany({
      where: {
        userId: profile.id,
        ...(isOwner ? {} : { private: false }),
      },
      distinct: ["category"],
      select: { category: true },
    }),
    profile.layoutMode === "CANVAS"
      ? canvasElements.findMany({
          where: { userId: profile.id, state: "PUBLISHED" },
          include: {
            project: {
              include: { media: { orderBy: { order: "asc" } } },
            },
          },
          orderBy: { zIndex: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const visibleCanvasElements = isOwner
    ? publishedCanvasElements
    : publishedCanvasElements.filter(
        (element) =>
          element.type !== "PROJECT" || element.project?.private !== true,
      );

  return {
    ...profile,
    categories: categories.map(({ category }) => category),
    canvasElements: visibleCanvasElements,
  };
}
