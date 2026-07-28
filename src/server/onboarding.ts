import type { PrismaClient } from "../../generated/prisma";

import { db } from "~/server/db";

export async function getOnboardingChecklist(
  userId: string,
  database: PrismaClient = db,
) {
  const user = await database.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      bio: true,
      siteDraftSavedAt: true,
      sitePublishedAt: true,
      onboardingDismissedAt: true,
      _count: { select: { projects: true } },
    },
  });
  const bio = Boolean(user.bio && user.bio.trim().length > 0);
  const project = user._count.projects > 0;
  const layout =
    user.siteDraftSavedAt !== null || user.sitePublishedAt !== null;
  const allComplete = bio && project && layout;
  const shouldShow = user.onboardingDismissedAt === null && !allComplete;
  return { shouldShow, items: { bio, project, layout } };
}

export async function dismissOnboarding(
  userId: string,
  database: PrismaClient = db,
) {
  return database.user.update({
    where: { id: userId },
    data: { onboardingDismissedAt: new Date() },
    select: { onboardingDismissedAt: true },
  });
}
