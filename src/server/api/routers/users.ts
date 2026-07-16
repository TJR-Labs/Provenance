import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import {
  banUser,
  changePassword,
  createUser,
  createUserInputSchema,
  DuplicateUsernameError,
  InvalidCurrentPasswordError,
} from "~/server/users";

export const usersRouter = createTRPCRouter({
  list: adminProcedure.query(({ ctx }) =>
    ctx.db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        role: true,
        displayName: true,
        banned: true,
        createdAt: true,
      },
    }),
  ),

  signup: publicProcedure
    .input(createUserInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await createUser(input, ctx.db.user);
      } catch (error) {
        if (error instanceof DuplicateUsernameError) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        throw error;
      }
    }),

  ban: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot ban your own account.",
        });
      }
      await banUser(input.userId, ctx.db.user);
      return { success: true as const };
    }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1, "Current password is required."),
        newPassword: z
          .string()
          .min(8, "New password must be at least 8 characters."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await changePassword(
          ctx.session.user.id,
          input.currentPassword,
          input.newPassword,
          ctx.db.user,
        );
        return { success: true as const };
      } catch (error) {
        if (error instanceof InvalidCurrentPasswordError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),
});
