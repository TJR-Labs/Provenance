import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  createReport,
  listReports,
  removeReportedProject,
  reportInputSchema,
  ReportTargetNotFoundError,
} from "~/server/reports";

export const moderationRouter = createTRPCRouter({
  report: protectedProcedure
    .input(reportInputSchema)
    .mutation(async ({ ctx, input }) => {
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

  listReports: adminProcedure.query(({ ctx }) => listReports(ctx.db.report)),

  removeProject: adminProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await removeReportedProject(input.projectId, ctx.db.project);
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
