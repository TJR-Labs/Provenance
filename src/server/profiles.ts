import type { PrismaClient } from "../../generated/prisma";

import { db } from "~/server/db";
import {
  publicGridBlockSelect,
  serializePublicGridLayout,
} from "~/server/grid-layouts";
import { canViewProject } from "~/server/projects";

type UserReader = Pick<PrismaClient["user"], "findFirst">;
type ProjectReader = Pick<PrismaClient["project"], "findMany">;
type CanvasElementReader = Pick<PrismaClient["canvasElement"], "findMany">;
type GridLayoutReader = Pick<PrismaClient["gridLayout"], "findFirst">;

export async function getPublicProfile(
  username: string,
  viewerId: string | null,
  users: UserReader = db.user,
  projects: ProjectReader = db.project,
  canvasElements: CanvasElementReader = db.canvasElement,
  gridLayouts: GridLayoutReader | undefined = db.gridLayout,
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
  if (
    !canViewProject({ userId: profile.id, private: profile.private }, viewerId)
  ) {
    return { isPrivate: true as const };
  }

  const [categories, publishedCanvasElements, publishedGridLayout] =
    await Promise.all([
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
      profile.layoutMode === "GRID" && gridLayouts
        ? gridLayouts.findFirst({
            where: {
              ownerId: profile.id,
              scope: "PROFILE",
              state: "PUBLISHED",
            },
            select: {
              blocks: {
                orderBy: [{ order: "asc" }, { key: "asc" }],
                select: publicGridBlockSelect,
              },
            },
          })
        : Promise.resolve(null),
    ]);
  const visibleCanvasElements = publishedCanvasElements.filter(
    (element) =>
      element.type !== "PROJECT" ||
      element.project === null ||
      canViewProject(element.project, isOwner),
  );

  return {
    ...profile,
    categories: categories.map(({ category }) => category),
    canvasElements: visibleCanvasElements,
    ...(publishedGridLayout
      ? { gridLayout: serializePublicGridLayout(publishedGridLayout, isOwner) }
      : {}),
  };
}
