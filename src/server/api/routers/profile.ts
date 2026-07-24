import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { dismissOnboarding, getOnboardingChecklist } from "~/server/onboarding";
import { getPublicProfile } from "~/server/profiles";
import { updateProfile, updateProfileInputSchema } from "~/server/users";

export const profileRouter = createTRPCRouter({
  getByUsername: publicProcedure
    .input(z.object({ username: z.string().trim().min(1) }))
    .query(({ ctx, input }) =>
      getPublicProfile(
        input.username,
        ctx.session?.user?.id ?? null,
        ctx.db.user,
        ctx.db.project,
        ctx.db.canvasElement,
        ctx.db.gridLayout,
      ),
    ),

  me: protectedProcedure.query(({ ctx }) =>
    ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: {
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
        private: true,
      },
    }),
  ),

  onboardingChecklist: protectedProcedure.query(({ ctx }) =>
    getOnboardingChecklist(ctx.session.user.id, ctx.db),
  ),

  dismissOnboarding: protectedProcedure.mutation(({ ctx }) =>
    dismissOnboarding(ctx.session.user.id, ctx.db),
  ),

  update: protectedProcedure
    .input(updateProfileInputSchema)
    .mutation(({ ctx, input }) =>
      updateProfile(ctx.session.user.id, input, ctx.db.user),
    ),
});
