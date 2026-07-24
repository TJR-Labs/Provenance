import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  ADMIN_PAGE_SIZE,
  paginationCursorSchema,
  pageSizeSchema,
} from "~/server/pagination";
import { consumeRateLimit } from "~/server/rate-limit";
import {
  createReport,
  listReports,
  removeReportedProject,
  reportInputSchema,
  ReportTargetNotFoundError,
} from "~/server/reports";
import { logAdminAction } from "~/server/users";

const REPORT_RATE_LIMIT_SCOPE = "report";
const REPORT_RATE_LIMIT_THRESHOLD = 10;
const REPORT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export const moderationRouter = createTRPCRouter({
  report: protectedProcedure
    .input(reportInputSchema)
    .mutation(async ({ ctx, input }) => {
      await consumeRateLimit(
        {
          scope: REPORT_RATE_LIMIT_SCOPE,
          key: ctx.session.user.id,
          limit: REPORT_RATE_LIMIT_THRESHOLD,
          windowMs: REPORT_RATE_LIMIT_WINDOW_MS,
          lockoutMs: REPORT_RATE_LIMIT_WINDOW_MS,
          message: "Too many reports submitted. Please try again later.",
        },
        ctx.db.rateLimitAttempt,
      );

      try {
        return await createReport(
          ctx.session.user.id,
          input,
          ctx.db.report,
          ctx.db.user,
        );
      } catch (error) {
        if (error instanceof ReportTargetNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        throw error;
      }
    }),

  listReports: adminProcedure
    .input(
      z
        .object({
          cursor: paginationCursorSchema.optional(),
          limit: pageSizeSchema(ADMIN_PAGE_SIZE),
        })
        .optional(),
    )
    .query(({ ctx, input }) => listReports(ctx.db.report, input)),

  removeProject: adminProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const project = await removeReportedProject(
          input.projectId,
          ctx.db.project,
        );
        await logAdminAction(
          ctx.session.user.id,
          project.userId,
          "removeProject",
          ctx.db.adminActionAudit,
        );
        return { success: true as const };
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2025"
        ) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        throw error;
      }
    }),
});
