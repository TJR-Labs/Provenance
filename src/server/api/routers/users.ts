import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { consumeRateLimit, resolveClientIp } from "~/server/rate-limit";
import {
  banUser,
  beginOAuthLink,
  changePassword,
  completeOAuthSignup,
  createUser,
  createUserInputSchema,
  DuplicateUsernameError,
  getAccountSecurity,
  getPendingOAuthSignup,
  InvalidCurrentPasswordError,
  InvalidOAuthFlowError,
  LastSignInMethodError,
  OAuthAccountAlreadyLinkedError,
  OAuthProviderAlreadyLinkedError,
  oauthProviderSchema,
  PasswordAlreadySetError,
  setPassword,
  unlinkOAuthAccount,
} from "~/server/users";

const SIGNUP_RATE_LIMIT_SCOPE = "signup";
const SIGNUP_RATE_LIMIT_THRESHOLD = 5;
const SIGNUP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

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
      await consumeRateLimit(
        {
          scope: SIGNUP_RATE_LIMIT_SCOPE,
          key: resolveClientIp(ctx.headers),
          limit: SIGNUP_RATE_LIMIT_THRESHOLD,
          windowMs: SIGNUP_RATE_LIMIT_WINDOW_MS,
          lockoutMs: SIGNUP_RATE_LIMIT_WINDOW_MS,
          message:
            "Too many signup attempts from this network. Please try again later.",
        },
        ctx.db.rateLimitAttempt,
      );

      try {
        return await createUser(input, ctx.db.user);
      } catch (error) {
        if (error instanceof DuplicateUsernameError) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        throw error;
      }
    }),

  pendingOAuthSignup: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(({ ctx, input }) => getPendingOAuthSignup(input.token, ctx.db)),

  completeOAuthSignup: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
        username: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await completeOAuthSignup(input.token, input.username, ctx.db);
        return { success: true as const };
      } catch (error) {
        if (error instanceof DuplicateUsernameError) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (
          error instanceof InvalidOAuthFlowError ||
          error instanceof OAuthAccountAlreadyLinkedError ||
          error instanceof OAuthProviderAlreadyLinkedError
        ) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
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
          ctx.db.rateLimitAttempt,
        );
        return { success: true as const };
      } catch (error) {
        if (error instanceof InvalidCurrentPasswordError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),

  accountSecurity: protectedProcedure.query(({ ctx }) =>
    getAccountSecurity(ctx.session.user.id, ctx.db),
  ),

  beginOAuthLink: protectedProcedure
    .input(z.object({ provider: oauthProviderSchema }))
    .mutation(async ({ ctx, input }) => ({
      token: await beginOAuthLink(ctx.session.user.id, input.provider, ctx.db),
    })),

  unlinkOAuthAccount: protectedProcedure
    .input(z.object({ provider: oauthProviderSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        await unlinkOAuthAccount(ctx.session.user.id, input.provider, ctx.db);
        return { success: true as const };
      } catch (error) {
        if (
          error instanceof LastSignInMethodError ||
          error instanceof InvalidOAuthFlowError
        ) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),

  setPassword: protectedProcedure
    .input(
      z.object({
        newPassword: z
          .string()
          .min(8, "New password must be at least 8 characters."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await setPassword(ctx.session.user.id, input.newPassword, ctx.db);
        return { success: true as const };
      } catch (error) {
        if (error instanceof PasswordAlreadySetError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),
});
