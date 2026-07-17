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
      layoutMode: true,
      onboardingDismissedAt: true,
      _count: { select: { projects: true } },
    },
  });
  const bio = Boolean(user.bio && user.bio.trim().length > 0);
  const project = user._count.projects > 0;
  // Layout item is derived (no new "did they visit" state): complete once the
  // user has moved off the default GRID layout to CANVAS. Build-phase decision
  // per spec requirement 4 / the layout-mode edge case.
  const layout = user.layoutMode !== "GRID";
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
