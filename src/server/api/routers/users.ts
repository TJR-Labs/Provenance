import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { DuplicateEmailError, emailSchema } from "~/server/account-email";
import {
  InvalidAccountDeletionReauthenticationError,
  requestAccountDeletion,
} from "~/server/account-deletion";
import {
  ADMIN_PAGE_SIZE,
  createdAtIdCursorWhere,
  pageFromRows,
  paginationCursorSchema,
  pageSizeSchema,
} from "~/server/pagination";
import { consumeRateLimit, resolveClientIp } from "~/server/rate-limit";
import {
  adminForcePasswordReset,
  confirmEmailVerification,
  consumePasswordReset,
  EmailDeliveryError,
  InvalidEmailVerificationTokenError,
  InvalidPasswordResetTokenError,
  requestEmailVerification,
  requestPasswordReset,
} from "~/server/password-recovery";
import {
  adminVerifyEmail,
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
  logAdminAction,
  OAuthAccountAlreadyLinkedError,
  OAuthProviderAlreadyLinkedError,
  oauthProviderSchema,
  PasswordAlreadySetError,
  setPassword,
  unlinkOAuthAccount,
} from "~/server/users";

const EMAIL_DELIVERY_ERROR_MESSAGE =
  "We couldn't send that email right now — try again shortly or contact support.";

const SIGNUP_RATE_LIMIT_SCOPE = "signup";
const SIGNUP_RATE_LIMIT_THRESHOLD = 5;
const SIGNUP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_VERIFICATION_RATE_LIMIT_SCOPE = "email-verification";

export const usersRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z
        .object({
          cursor: paginationCursorSchema.optional(),
          limit: pageSizeSchema(ADMIN_PAGE_SIZE),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const pageSize = input?.limit ?? ADMIN_PAGE_SIZE;
      const rows = await ctx.db.user.findMany({
        where: createdAtIdCursorWhere(input?.cursor),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pageSize + 1,
        select: {
          id: true,
          username: true,
          role: true,
          displayName: true,
          banned: true,
          createdAt: true,
        },
      });
      return pageFromRows(rows, pageSize);
    }),

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

      let user;
      try {
        user = await createUser(input, ctx.db.user);
      } catch (error) {
        if (
          error instanceof DuplicateUsernameError ||
          error instanceof DuplicateEmailError
        ) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        throw error;
      }

      let emailSent = true;
      try {
        await requestEmailVerification(user.id, input.email, {
          prisma: ctx.db,
        });
      } catch (error) {
        if (!(error instanceof EmailDeliveryError)) throw error;
        emailSent = false;
      }
      return { ...user, emailSent };
    }),

  requestPasswordReset: publicProcedure
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await requestPasswordReset(
          input.email,
          resolveClientIp(ctx.headers),
          { prisma: ctx.db, rateLimits: ctx.db.rateLimitAttempt },
        );
      } catch (error) {
        if (error instanceof EmailDeliveryError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: EMAIL_DELIVERY_ERROR_MESSAGE,
          });
        }
        throw error;
      }
    }),

  consumePasswordReset: publicProcedure
    .input(
      z.object({
        email: emailSchema,
        token: z.string().min(1),
        newPassword: z
          .string()
          .min(8, "New password must be at least 8 characters."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await consumePasswordReset(input, resolveClientIp(ctx.headers), {
          prisma: ctx.db,
          rateLimits: ctx.db.rateLimitAttempt,
        });
        return { success: true as const };
      } catch (error) {
        if (error instanceof InvalidPasswordResetTokenError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),

  requestEmailVerification: protectedProcedure
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ ctx, input }) => {
      await consumeRateLimit(
        {
          scope: EMAIL_VERIFICATION_RATE_LIMIT_SCOPE,
          key: ctx.session.user.id,
          limit: 5,
          windowMs: SIGNUP_RATE_LIMIT_WINDOW_MS,
          lockoutMs: SIGNUP_RATE_LIMIT_WINDOW_MS,
          message:
            "Too many verification emails requested. Please try again later.",
        },
        ctx.db.rateLimitAttempt,
      );
      try {
        return await requestEmailVerification(
          ctx.session.user.id,
          input.email,
          { prisma: ctx.db },
        );
      } catch (error) {
        if (error instanceof DuplicateEmailError) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (error instanceof EmailDeliveryError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: EMAIL_DELIVERY_ERROR_MESSAGE,
          });
        }
        throw error;
      }
    }),

  confirmEmailVerification: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await confirmEmailVerification(input.token, ctx.db);
        return { success: true as const };
      } catch (error) {
        if (error instanceof InvalidEmailVerificationTokenError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
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
      await logAdminAction(
        ctx.session.user.id,
        input.userId,
        "ban",
        ctx.db.adminActionAudit,
      );
      return { success: true as const };
    }),

  verifyEmail: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await adminVerifyEmail(input.userId, ctx.db.user);
      if (!result) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }
      await logAdminAction(
        ctx.session.user.id,
        input.userId,
        "verifyEmail",
        ctx.db.adminActionAudit,
      );
      return { success: true as const };
    }),

  forcePasswordReset: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await adminForcePasswordReset(input.userId, {
        prisma: ctx.db,
      });
      if (!result) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }
      await logAdminAction(
        ctx.session.user.id,
        input.userId,
        "forcePasswordReset",
        ctx.db.adminActionAudit,
      );
      return result;
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

  requestAccountDeletion: protectedProcedure
    .input(
      z.object({
        confirmation: z.literal("DELETE"),
        currentPassword: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await requestAccountDeletion(
          {
            userId: ctx.session.user.id,
            currentPassword: input.currentPassword,
            authenticatedAt: ctx.session.authenticatedAt,
          },
          ctx.db,
        );
      } catch (error) {
        if (error instanceof InvalidAccountDeletionReauthenticationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),
});
