import type { PrismaClient } from "../../generated/prisma";

import {
  findNextGridPosition,
  GRID_MAX_BLOCKS,
  type GridBlock,
} from "~/lib/grid-layout";
import { classifyProjectMedia } from "~/lib/project-media";
import { db } from "~/server/db";

export type GridMigrationCounts = {
  migratedProfiles: number;
  migratedProjects: number;
  alreadyMigrated: number;
  skippedVideo: number;
  skippedOversized: number;
};

type Candidate = Pick<
  GridBlock,
  | "key"
  | "type"
  | "projectId"
  | "textContent"
  | "imageUrl"
  | "imageMimeType"
  | "imageAlt"
  | "linkLabel"
  | "linkUrl"
>;

type ProfileMigrationResult = "migrated" | "already" | "oversized";
type ProjectMigrationResult = "migrated" | "already" | "video" | "oversized";

const PROFILE_SECTIONS = ["about", "projects", "links"] as const;
const MINIMUM_SIZE: Record<
  GridBlock["type"],
  { width: number; height: number }
> = {
  PROJECT: { width: 3, height: 2 },
  IMAGE: { width: 2, height: 2 },
  TEXT: { width: 2, height: 1 },
  LINK: { width: 2, height: 1 },
};

function emptyContent(): Omit<Candidate, "key" | "type"> {
  return {
    projectId: null,
    textContent: null,
    imageUrl: null,
    imageMimeType: null,
    imageAlt: null,
    linkLabel: null,
    linkUrl: null,
  };
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function readProfileLinks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("label" in item) ||
      !("url" in item) ||
      typeof item.label !== "string" ||
      typeof item.url !== "string" ||
      !item.label.trim() ||
      !isHttpUrl(item.url)
    ) {
      return [];
    }
    return [{ index, label: item.label, url: item.url }];
  });
}

function readProfileSections(value: unknown) {
  if (!Array.isArray(value)) return [...PROFILE_SECTIONS];
  const seen = new Set<string>();
  return value.filter(
    (item): item is (typeof PROFILE_SECTIONS)[number] =>
      typeof item === "string" &&
      PROFILE_SECTIONS.includes(item as (typeof PROFILE_SECTIONS)[number]) &&
      !seen.has(item) &&
      Boolean(seen.add(item)),
  );
}

function placeCandidates(candidates: Candidate[]): GridBlock[] {
  const blocks: GridBlock[] = [];
  for (const [order, candidate] of candidates.entries()) {
    const position = findNextGridPosition(blocks, candidate.type);
    if (!position) throw new Error("Legacy Grid placement exceeded its limit.");
    blocks.push({
      ...candidate,
      order,
      ...position,
      ...MINIMUM_SIZE[candidate.type],
    });
  }
  return blocks;
}

async function hasProfileLayout(userId: string, database: PrismaClient) {
  return Boolean(
    await database.gridLayout.findFirst({
      where: { ownerId: userId, scope: "PROFILE" },
      select: { id: true },
    }),
  );
}

async function hasProjectLayout(projectId: string, database: PrismaClient) {
  return Boolean(
    await database.gridLayout.findFirst({
      where: { projectId, scope: "PROJECT" },
      select: { id: true },
    }),
  );
}

async function migrateProfile(
  userId: string,
  database: PrismaClient,
): Promise<ProfileMigrationResult> {
  if (await hasProfileLayout(userId, database)) return "already";

  const profile = await database.user.findUnique({
    where: { id: userId },
    select: {
      layoutMode: true,
      bio: true,
      links: true,
      layoutSections: true,
    },
  });
  if (!profile || profile.layoutMode !== "GRID") return "already";

  const projects = await database.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const links = readProfileLinks(profile.links);
  const candidates: Candidate[] = [];

  for (const section of readProfileSections(profile.layoutSections)) {
    if (section === "about" && profile.bio?.trim()) {
      candidates.push({
        key: "legacy-profile-about",
        type: "TEXT",
        ...emptyContent(),
        textContent: profile.bio,
      });
    }
    if (section === "projects") {
      for (const project of projects) {
        candidates.push({
          key: `legacy-profile-project-${project.id}`,
          type: "PROJECT",
          ...emptyContent(),
          projectId: project.id,
        });
      }
    }
    if (section === "links") {
      for (const link of links) {
        candidates.push({
          key: `legacy-profile-link-${link.index}`,
          type: "LINK",
          ...emptyContent(),
          linkLabel: link.label,
          linkUrl: link.url,
        });
      }
    }
  }

  if (candidates.length > GRID_MAX_BLOCKS) return "oversized";
  const blocks = placeCandidates(candidates);

  return database.$transaction(async (transaction) => {
    const existing = await transaction.gridLayout.findFirst({
      where: { ownerId: userId, scope: "PROFILE" },
      select: { id: true },
    });
    if (existing) return "already";

    await transaction.gridLayout.create({
      data: {
        ownerId: userId,
        projectId: null,
        scope: "PROFILE",
        state: "DRAFT",
        blocks: { create: blocks },
      },
    });
    await transaction.gridLayout.create({
      data: {
        ownerId: userId,
        projectId: null,
        scope: "PROFILE",
        state: "PUBLISHED",
        blocks: { create: blocks },
      },
    });
    return "migrated";
  });
}

async function migrateProject(
  projectId: string,
  database: PrismaClient,
): Promise<ProjectMigrationResult> {
  if (await hasProjectLayout(projectId, database)) return "already";

  const project = await database.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      userId: true,
      title: true,
      description: true,
      links: true,
      media: {
        orderBy: { order: "asc" },
        select: { url: true, mimeType: true },
      },
    },
  });
  if (!project) return "already";

  const classifiedMedia = project.media.map((media) => ({
    ...media,
    classification: classifyProjectMedia(media),
  }));
  if (classifiedMedia.some((media) => media.classification === "video")) {
    return "video";
  }

  const candidates: Candidate[] = [
    {
      key: "legacy-project-description",
      type: "TEXT",
      ...emptyContent(),
      textContent: project.description,
    },
    ...classifiedMedia.map((media, index): Candidate =>
      media.classification === "image"
        ? {
            key: `legacy-project-media-${index}`,
            type: "IMAGE",
            ...emptyContent(),
            imageUrl: media.url,
            imageMimeType: media.mimeType,
            imageAlt: project.title,
          }
        : {
            key: `legacy-project-media-${index}`,
            type: "LINK",
            ...emptyContent(),
            linkLabel: "Open media",
            linkUrl: media.url,
          },
    ),
    ...project.links.map((url, index): Candidate => ({
      key: `legacy-project-link-${index}`,
      type: "LINK",
      ...emptyContent(),
      linkLabel: "Open project link",
      linkUrl: url,
    })),
  ];

  if (candidates.length > GRID_MAX_BLOCKS) return "oversized";
  const blocks = placeCandidates(candidates);

  return database.$transaction(async (transaction) => {
    const existing = await transaction.gridLayout.findFirst({
      where: { projectId, scope: "PROJECT" },
      select: { id: true },
    });
    if (existing) return "already";

    await transaction.gridLayout.create({
      data: {
        ownerId: project.userId,
        projectId,
        scope: "PROJECT",
        state: "PUBLISHED",
        blocks: { create: blocks },
      },
    });
    return "migrated";
  });
}

export async function ensureProfileGridLayouts(
  userId: string,
  database: PrismaClient = db,
): Promise<"ready" | "oversized"> {
  return (await migrateProfile(userId, database)) === "oversized"
    ? "oversized"
    : "ready";
}

export async function ensureProjectGridLayout(
  projectId: string,
  database: PrismaClient = db,
): Promise<"ready" | "video" | "oversized"> {
  const result = await migrateProject(projectId, database);
  return result === "video" || result === "oversized" ? result : "ready";
}

export async function migrateGridLayouts(
  database: PrismaClient = db,
): Promise<GridMigrationCounts> {
  const counts: GridMigrationCounts = {
    migratedProfiles: 0,
    migratedProjects: 0,
    alreadyMigrated: 0,
    skippedVideo: 0,
    skippedOversized: 0,
  };
  const profiles = await database.user.findMany({
    where: { layoutMode: "GRID" },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const projects = await database.project.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  for (const profile of profiles) {
    const result = await migrateProfile(profile.id, database);
    if (result === "migrated") counts.migratedProfiles += 1;
    if (result === "already") counts.alreadyMigrated += 1;
    if (result === "oversized") counts.skippedOversized += 1;
  }
  for (const project of projects) {
    const result = await migrateProject(project.id, database);
    if (result === "migrated") counts.migratedProjects += 1;
    if (result === "already") counts.alreadyMigrated += 1;
    if (result === "video") counts.skippedVideo += 1;
    if (result === "oversized") counts.skippedOversized += 1;
  }

  return counts;
}
