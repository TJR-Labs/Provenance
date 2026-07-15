import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  addCriterion,
  addCriterionInputSchema,
  EvaluationEngineerOwnershipError,
  EvaluationNotFoundError,
  EvaluationOwnershipError,
  getCompanyEvaluation,
  getEngineerResult,
  InvalidScoreSetError,
  removeCriterion,
  removeCriterionInputSchema,
  scoreSubmission,
  scoreSubmissionInputSchema,
  submissionResultInputSchema,
  updateCriterion,
  updateCriterionInputSchema,
} from "~/server/evaluations";
import {
  companyProcedure,
  createTRPCRouter,
  engineerProcedure,
} from "~/server/api/trpc";

const briefIdSchema = z.object({ briefId: z.string().min(1) });

function throwEvaluationError(error: unknown): never {
  if (
    error instanceof EvaluationOwnershipError ||
    error instanceof EvaluationEngineerOwnershipError
  ) {
    throw new TRPCError({ code: "FORBIDDEN", message: error.message });
  }
  if (error instanceof EvaluationNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: error.message });
  }
  if (error instanceof InvalidScoreSetError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

export const evaluationRouter = createTRPCRouter({
  companyView: companyProcedure
    .input(briefIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getCompanyEvaluation(
          ctx.session.user.id,
          input.briefId,
          ctx.db,
        );
      } catch (error) {
        throwEvaluationError(error);
      }
    }),

  addCriterion: companyProcedure
    .input(addCriterionInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await addCriterion(ctx.session.user.id, input, ctx.db);
      } catch (error) {
        throwEvaluationError(error);
      }
    }),

  updateCriterion: companyProcedure
    .input(updateCriterionInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateCriterion(ctx.session.user.id, input, ctx.db);
      } catch (error) {
        throwEvaluationError(error);
      }
    }),

  removeCriterion: companyProcedure
    .input(removeCriterionInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await removeCriterion(ctx.session.user.id, input, ctx.db);
      } catch (error) {
        throwEvaluationError(error);
      }
    }),

  scoreSubmission: companyProcedure
    .input(scoreSubmissionInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await scoreSubmission(ctx.session.user.id, input, ctx.db);
      } catch (error) {
        throwEvaluationError(error);
      }
    }),

  myResult: engineerProcedure
    .input(submissionResultInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getEngineerResult(
          ctx.session.user.id,
          input.submissionId,
          ctx.db,
        );
      } catch (error) {
        throwEvaluationError(error);
      }
    }),
});
