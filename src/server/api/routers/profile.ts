import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { getPublicProfile } from "~/server/profiles";
import { updateProfile, updateProfileInputSchema } from "~/server/users";

export const profileRouter = createTRPCRouter({
  getByUsername: publicProcedure
    .input(z.object({ username: z.string().trim().min(1) }))
    .query(({ ctx, input }) =>
      getPublicProfile(
        input.username,
        ctx.db.user,
        ctx.db.project,
        ctx.db.canvasElement,
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
        layoutSections: true,
        layoutMode: true,
        customCss: true,
      },
    }),
  ),

  update: protectedProcedure
    .input(updateProfileInputSchema)
    .mutation(({ ctx, input }) =>
      updateProfile(ctx.session.user.id, input, ctx.db.user),
    ),
});
