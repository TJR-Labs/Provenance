import { Category, MediaKind, type PrismaClient } from "../../generated/prisma";
import { z } from "zod";

import { db } from "~/server/db";

type ProjectDelegate = Pick<
  PrismaClient["project"],
  "create" | "delete" | "findFirst" | "findMany" | "findUnique" | "update"
>;

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
  media: z.array(projectMediaInputSchema).max(30),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

function normalizeInput(rawInput: ProjectInput) {
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
  const input = normalizeInput(rawInput);
  return projects.create({
    data: {
      userId,
      title: input.title,
      description: input.description,
      category: input.category,
      hashtags: input.hashtags,
      links: input.links,
      layout: input.layout,
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

  const input = normalizeInput(rawInput);
  return projects.update({
    where: { id: projectId },
    data: {
      title: input.title,
      description: input.description,
      category: input.category,
      hashtags: input.hashtags,
      links: input.links,
      layout: input.layout,
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

export function getPublicProject(
  projectId: string,
  projects: ProjectDelegate = db.project,
) {
  return projects.findFirst({
    where: { id: projectId, user: { banned: false } },
    include: {
      media: { orderBy: { order: "asc" } },
      user: { select: { id: true, username: true, displayName: true } },
    },
  });
}

export function listProjectsByUsername(
  username: string,
  projects: ProjectDelegate = db.project,
) {
  return projects.findMany({
    where: { user: { username: username.toLowerCase(), banned: false } },
    include: {
      media: { orderBy: { order: "asc" } },
      user: { select: { id: true, username: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function discoverProjects(
  filters: { category?: Category; hashtag?: string },
  projects: ProjectDelegate = db.project,
) {
  return projects.findMany({
    where: {
      user: { banned: false },
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

export class ProjectNotFoundError extends Error {}
export class ProjectOwnershipError extends Error {}
