import { Category, MediaKind, type PrismaClient } from "../../generated/prisma";
import { z } from "zod";

import { db } from "~/server/db";

type ProjectDelegate = Pick<
  PrismaClient["project"],
  "create" | "delete" | "findFirst" | "findMany" | "findUnique" | "update"
>;
type UserReader = Pick<PrismaClient["user"], "findUniqueOrThrow">;
type CanvasElementReader = Pick<PrismaClient["canvasElement"], "findMany">;

export const projectLayouts = ["default", "gallery", "writeup"] as const;

export const projectMediaInputSchema = z.object({
  kind: z.nativeEnum(MediaKind),
  url: z.string().trim().min(1, "Media URL is required.").max(2000),
  mimeType: z.string().trim().max(120).optional().nullable(),
});

export const projectInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(160),
  description: z.string().trim().min(1, "Description is required.").max(20_000),
  category: z.nativeEnum(Category),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(30),
  links: z.array(z.string().trim().url()).max(20),
  layout: z.enum(projectLayouts),
  private: z.boolean().optional().default(false),
  excludeFromFeed: z.boolean().optional().default(false),
  media: z.array(projectMediaInputSchema).max(30),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

export function normalizeProjectInput(rawInput: ProjectInput) {
  const input = projectInputSchema.parse(rawInput);
  return {
    ...input,
    hashtags: [
      ...new Set(
        input.hashtags.map((tag) => tag.replace(/^#/, "").toLowerCase()),
      ),
    ],
    links: [...new Set(input.links)],
    media: input.media.map((item, order) => ({ ...item, order })),
  };
}

export async function createProject(
  userId: string,
  rawInput: ProjectInput,
  projects: ProjectDelegate = db.project,
) {
  const input = normalizeProjectInput(rawInput);
  return projects.create({
    data: {
      userId,
      title: input.title,
      description: input.description,
      category: input.category,
      hashtags: input.hashtags,
      links: input.links,
      layout: input.layout,
      private: input.private,
      excludeFromFeed: input.excludeFromFeed,
      media: { create: input.media },
    },
    include: {
      media: { orderBy: { order: "asc" } },
      user: { select: { id: true, username: true, displayName: true } },
    },
  });
}

export async function updateProject(
  projectId: string,
  userId: string,
  rawInput: ProjectInput,
  projects: ProjectDelegate = db.project,
) {
  const existing = await projects.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!existing) throw new ProjectNotFoundError();
  if (existing.userId !== userId) throw new ProjectOwnershipError();

  const input = normalizeProjectInput(rawInput);
  return projects.update({
    where: { id: projectId },
    data: {
      title: input.title,
      description: input.description,
      category: input.category,
      hashtags: input.hashtags,
      links: input.links,
      layout: input.layout,
      private: input.private,
      excludeFromFeed: input.excludeFromFeed,
      media: { deleteMany: {}, create: input.media },
    },
    include: {
      media: { orderBy: { order: "asc" } },
      user: { select: { id: true, username: true, displayName: true } },
    },
  });
}

export async function deleteProject(
  projectId: string,
  userId: string,
  projects: ProjectDelegate = db.project,
) {
  const existing = await projects.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!existing) throw new ProjectNotFoundError();
  if (existing.userId !== userId) throw new ProjectOwnershipError();
  return projects.delete({ where: { id: projectId } });
}

export async function getPublicProject(
  projectId: string,
  viewerId: string | null,
  projects: ProjectDelegate = db.project,
) {
  const project = await projects.findFirst({
    where: { id: projectId, user: { banned: false } },
    include: {
      media: { orderBy: { order: "asc" } },
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          private: true,
        },
      },
    },
  });
  if (!project) return null;
  if (
    (project.private || project.user.private) &&
    project.userId !== viewerId
  ) {
    return null;
  }
  return project;
}

export function listProjectsByUsername(
  username: string,
  viewerId: string | null,
  projects: ProjectDelegate = db.project,
) {
  return projects.findMany({
    where: viewerId
      ? {
          user: { username: username.toLowerCase(), banned: false },
          OR: [
            { userId: viewerId },
            { private: false, user: { private: false } },
          ],
        }
      : {
          private: false,
          user: {
            username: username.toLowerCase(),
            banned: false,
            private: false,
          },
        },
    include: {
      media: { orderBy: { order: "asc" } },
      user: { select: { id: true, username: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function discoverProjects(
  filters: { category?: Category; hashtag?: string },
  viewerId: string | null,
  projects: ProjectDelegate = db.project,
) {
  void viewerId;
  const unfiltered = !filters.category && !filters.hashtag;
  return projects.findMany({
    where: {
      user: { banned: false, private: false },
      private: false,
      ...(unfiltered && { excludeFromFeed: false }),
      ...(filters.category && { category: filters.category }),
      ...(filters.hashtag && {
        hashtags: {
          has: filters.hashtag.replace(/^#/, "").trim().toLowerCase(),
        },
      }),
    },
    include: {
      media: { orderBy: { order: "asc" } },
      user: { select: { id: true, username: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

// Surfaces the hashtags actually in use across public (non-banned) profiles,
// ordered by usage frequency (most-used first) so the Discover page can offer
// them as filter chips. Reuses Project.hashtags as-is — no separate tag table.
// The frequency count runs in memory over the selected arrays, which is
// sufficient at this scale; ties fall back to alphabetical for stable output.
export async function listPopularHashtags(
  limit = 20,
  projects: ProjectDelegate = db.project,
) {
  const rows = await projects.findMany({
    where: { user: { banned: false, private: false }, private: false },
    select: { hashtags: true },
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.hashtags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

// Lists the signed-in user's own projects for the "My Work" hub, with
// placed/unplaced-on-canvas status mirroring the canvas editor's Library
// sidebar (src/server/canvas.ts's getCanvasEditorState resolves the same
// draft-vs-published state before checking PROJECT placements).
export async function listMyProjects(
  userId: string,
  projects: ProjectDelegate = db.project,
  users: UserReader = db.user,
  canvasElements: CanvasElementReader = db.canvasElement,
) {
  const [myProjects, user] = await Promise.all([
    projects.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        media: { select: { url: true }, orderBy: { order: "asc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    }),
    users.findUniqueOrThrow({
      where: { id: userId },
      select: { canvasDraftSavedAt: true, canvasPublishedAt: true },
    }),
  ]);

  const hasNewerDraft =
    user.canvasDraftSavedAt !== null &&
    (user.canvasPublishedAt === null ||
      user.canvasDraftSavedAt > user.canvasPublishedAt);
  const state = hasNewerDraft ? "DRAFT" : "PUBLISHED";

  const placedElements =
    user.canvasDraftSavedAt === null && user.canvasPublishedAt === null
      ? []
      : await canvasElements.findMany({
          where: { userId, state, type: "PROJECT" },
          select: { projectId: true },
        });
  const placedProjectIds = new Set(
    placedElements.flatMap((element) =>
      element.projectId ? [element.projectId] : [],
    ),
  );

  return myProjects.map((project) => ({
    id: project.id,
    title: project.title,
    thumbnailUrl: project.media[0]?.url ?? null,
    placed: placedProjectIds.has(project.id),
  }));
}

export class ProjectNotFoundError extends Error {}
export class ProjectOwnershipError extends Error {}
