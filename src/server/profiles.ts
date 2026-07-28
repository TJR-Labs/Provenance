import type { PrismaClient } from "../../generated/prisma";

import { db } from "~/server/db";
import { canViewProject } from "~/server/projects";
import { ensureSiteContent } from "~/server/site-content-migration";
import { resolveSiteStyle } from "~/server/site-editor";

type UserReader = Pick<PrismaClient["user"], "findFirst">;
type ProjectReader = Pick<PrismaClient["project"], "findMany">;
type SectionReader = Pick<PrismaClient["section"], "findMany">;
type DevlogReader = Pick<PrismaClient["devlogEntry"], "findMany">;

// The published Build log always shows the newest entries, never a curated set.
const BUILD_LOG_ENTRY_LIMIT = 5;

export async function getPublicProfile(
  username: string,
  viewerId: string | null,
  users: UserReader = db.user,
  projects: ProjectReader = db.project,
  sections: SectionReader = db.section,
  devlogEntries: DevlogReader = db.devlogEntry,
  database: PrismaClient = db,
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
      siteStylePublished: true,
      sitePublishedAt: true,
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

  // Profiles that predate the site editor have no Section rows until the lazy
  // backfill runs, so a visitor would otherwise see an empty page. This is
  // idempotent (one existence check, no-op once seeded), so any viewer — not
  // just the owner opening the editor — can trigger it.
  await ensureSiteContent(profile.id, database);

  const [categories, publishedSections, buildLogEntries] = await Promise.all([
    projects.findMany({
      where: {
        userId: profile.id,
        ...(isOwner ? {} : { private: false }),
      },
      distinct: ["category"],
      select: { category: true },
    }),
    sections.findMany({
      where: { userId: profile.id, state: "PUBLISHED" },
      orderBy: { order: "asc" },
      include: {
        blocks: {
          orderBy: { order: "asc" },
          include: {
            project: {
              include: { media: { orderBy: { order: "asc" } } },
            },
          },
        },
      },
    }),
    devlogEntries.findMany({
      where: { userId: profile.id },
      orderBy: { createdAt: "desc" },
      take: BUILD_LOG_ENTRY_LIMIT,
      select: { id: true, label: true, body: true, createdAt: true },
    }),
  ]);

  // A PROJECT block whose project is private or gone is dropped outright for a
  // visitor; the owner keeps the block so the renderer can flag it as
  // unavailable. The resolved projects are hoisted out of the block rows so the
  // renderer resolves them by id (same shape as the grid renderer).
  type SiteProject = NonNullable<
    (typeof publishedSections)[number]["blocks"][number]["project"]
  >;
  const siteProjects = new Map<string, SiteProject>();
  const visibleSections = publishedSections.map((section) => ({
    ...section,
    blocks: section.blocks.flatMap(({ project, ...block }) => {
      if (block.type !== "PROJECT") return [block];
      if (project === null) return isOwner ? [block] : [];
      if (!canViewProject(project, isOwner)) return [];
      siteProjects.set(project.id, project);
      return [block];
    }),
  }));

  return {
    ...profile,
    categories: categories.map(({ category }) => category),
    sections: visibleSections,
    siteProjects: [...siteProjects.values()],
    siteStyle: resolveSiteStyle(profile.siteStylePublished),
    devlogEntries: buildLogEntries,
  };
}
