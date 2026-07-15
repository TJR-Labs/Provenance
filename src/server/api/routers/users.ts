import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import {
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
        createdAt: true,
      },
    }),
  ),

  create: adminProcedure
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

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1, "Current password is required."),
        newPassword: z.string().min(1, "New password is required."),
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
