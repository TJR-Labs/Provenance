import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  EngineerNotFoundError,
  getSubmissionForBrief,
  listSubmissionsForBrief,
  listSubmissionsForEngineer,
  SubmissionBriefClosedError,
  SubmissionBriefNotFoundError,
  SubmissionBriefOwnershipError,
  upsertSubmission,
  upsertSubmissionInputSchema,
} from "~/server/submissions";
import {
  companyProcedure,
  createTRPCRouter,
  engineerProcedure,
  protectedProcedure,
} from "~/server/api/trpc";

const briefIdSchema = z.object({ briefId: z.string().min(1) });
const engineerIdSchema = z.object({ engineerId: z.string().min(1) });

function throwSubmissionError(error: unknown): never {
  if (error instanceof SubmissionBriefOwnershipError) {
    throw new TRPCError({ code: "FORBIDDEN", message: error.message });
  }
  if (
    error instanceof SubmissionBriefNotFoundError ||
    error instanceof EngineerNotFoundError
  ) {
    throw new TRPCError({ code: "NOT_FOUND", message: error.message });
  }
  if (error instanceof SubmissionBriefClosedError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

export const submissionRouter = createTRPCRouter({
  upsert: engineerProcedure
    .input(upsertSubmissionInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await upsertSubmission(
          ctx.session.user.id,
          input,
          ctx.db.brief,
          ctx.db.submission,
        );
      } catch (error) {
        throwSubmissionError(error);
      }
    }),

  listForBrief: companyProcedure
    .input(briefIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await listSubmissionsForBrief(
          ctx.session.user.id,
          input.briefId,
          ctx.db.brief,
          ctx.db.submission,
        );
      } catch (error) {
        throwSubmissionError(error);
      }
    }),

  mineForBrief: engineerProcedure
    .input(briefIdSchema)
    .query(({ ctx, input }) =>
      getSubmissionForBrief(
        ctx.session.user.id,
        input.briefId,
        ctx.db.submission,
      ),
    ),

  listForEngineer: protectedProcedure
    .input(engineerIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await listSubmissionsForEngineer(
          input.engineerId,
          ctx.db.user,
          ctx.db.submission,
        );
      } catch (error) {
        throwSubmissionError(error);
      }
    }),
});
