import type { PrismaClient } from "../../generated/prisma";

import { DEFAULT_SITE_STYLE } from "~/lib/site-style";
import { db } from "~/server/db";

export type SiteContentMigrationCounts = {
  seededProfiles: number;
  alreadyReady: number;
};

type SiteContentMigrationResult = "seeded" | "already";

const SECTION_DEFAULTS = [
  { kind: "HERO", order: 0 },
  { kind: "PROJECT_GRID", order: 1 },
  { kind: "ABOUT", order: 2 },
  { kind: "BUILD_LOG", order: 3 },
  { kind: "LINKS", order: 4 },
] as const;

function hasLinks(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

async function seedSiteContent(
  userId: string,
  database: PrismaClient,
): Promise<SiteContentMigrationResult> {
  const existing = await database.section.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (existing) return "already";

  const profile = await database.user.findUnique({
    where: { id: userId },
    select: {
      links: true,
      _count: { select: { devlogEntries: true } },
    },
  });
  if (!profile) return "already";

  const buildLogVisible = profile._count.devlogEntries > 0;
  const linksVisible = hasLinks(profile.links);

  return database.$transaction(async (transaction) => {
    const concurrentSeed = await transaction.section.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (concurrentSeed) return "already";

    await transaction.user.update({
      where: { id: userId },
      data: {
        siteStyleDraft: DEFAULT_SITE_STYLE,
        siteStylePublished: DEFAULT_SITE_STYLE,
      },
    });

    await transaction.section.createMany({
      data: (["DRAFT", "PUBLISHED"] as const).flatMap((state) =>
        SECTION_DEFAULTS.map(({ kind, order }) => ({
          userId,
          state,
          kind,
          order,
          visible:
            kind === "BUILD_LOG"
              ? buildLogVisible
              : kind === "LINKS"
                ? linksVisible
                : true,
        })),
      ),
    });

    return "seeded";
  });
}

export async function ensureSiteContent(
  userId: string,
  database: PrismaClient = db,
): Promise<"ready"> {
  await seedSiteContent(userId, database);
  return "ready";
}

export async function migrateSiteContent(
  database: PrismaClient = db,
): Promise<SiteContentMigrationCounts> {
  const counts: SiteContentMigrationCounts = {
    seededProfiles: 0,
    alreadyReady: 0,
  };
  const profiles = await database.user.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  for (const profile of profiles) {
    const result = await seedSiteContent(profile.id, database);
    if (result === "seeded") counts.seededProfiles += 1;
    if (result === "already") counts.alreadyReady += 1;
  }

  return counts;
}
