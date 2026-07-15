import type { PrismaClient } from "../../generated/prisma";
import { z } from "zod";

import { db } from "~/server/db";

type EvaluationDelegates = Pick<
  PrismaClient,
  "brief" | "rubricCriterion" | "submission"
>;

export const criterionFieldsSchema = z.object({
  name: z.string().trim().min(1, "Criterion name is required."),
  weight: z.number().int().min(1).max(5),
});

export const addCriterionInputSchema = criterionFieldsSchema.extend({
  briefId: z.string().min(1),
});

export const updateCriterionInputSchema = criterionFieldsSchema.extend({
  criterionId: z.string().min(1),
});

export const removeCriterionInputSchema = z.object({
  criterionId: z.string().min(1),
});

const scoreValueSchema = z.object({
  criterionId: z.string().min(1),
  value: z.number().int().min(0).max(5),
});

export const scoreSubmissionInputSchema = z.object({
  submissionId: z.string().min(1),
  scores: z.array(scoreValueSchema).superRefine((scores, context) => {
    const criterionIds = new Set<string>();
    for (const [index, score] of scores.entries()) {
      if (criterionIds.has(score.criterionId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each criterion may be scored only once.",
          path: [index, "criterionId"],
        });
      }
      criterionIds.add(score.criterionId);
    }
  }),
  feedbackNote: z.string().trim().nullable(),
});

export const submissionResultInputSchema = z.object({
  submissionId: z.string().min(1),
});

export class EvaluationNotFoundError extends Error {
  constructor(message = "Evaluation target not found.") {
    super(message);
    this.name = "EvaluationNotFoundError";
  }
}

export class EvaluationOwnershipError extends Error {
  constructor() {
    super("You do not own this brief.");
    this.name = "EvaluationOwnershipError";
  }
}

export class EvaluationEngineerOwnershipError extends Error {
  constructor() {
    super("You cannot view another engineer's evaluation.");
    this.name = "EvaluationEngineerOwnershipError";
  }
}

export class InvalidScoreSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidScoreSetError";
  }
}

export type EvaluationCriterion = {
  id: string;
  name: string;
  weight: number;
};

export type EvaluationScore = {
  criterionId: string;
  value: number;
};

export type ScoringStatus = "FULLY_SCORED" | "PARTIALLY_SCORED" | "UNSCORED";

export type SubmissionEvaluation = {
  scoringStatus: ScoringStatus;
  percentage: number | null;
};

type RankedSubmission = SubmissionEvaluation & { createdAt: Date };

export function compareRankedSubmissions(
  left: RankedSubmission,
  right: RankedSubmission,
) {
  const rank = {
    FULLY_SCORED: 0,
    PARTIALLY_SCORED: 1,
    UNSCORED: 2,
  } satisfies Record<ScoringStatus, number>;

  const statusDifference = rank[left.scoringStatus] - rank[right.scoringStatus];
  if (statusDifference) return statusDifference;

  if (
    left.scoringStatus === "FULLY_SCORED" &&
    right.scoringStatus === "FULLY_SCORED" &&
    left.percentage !== right.percentage
  ) {
    return right.percentage! - left.percentage!;
  }

  return left.createdAt.getTime() - right.createdAt.getTime();
}

export function calculateWeightedPercentage(
  criteria: readonly EvaluationCriterion[],
  scores: readonly EvaluationScore[],
) {
  if (!criteria.length) return null;

  const values = new Map(
    scores.map((score) => [score.criterionId, score.value]),
  );
  if (criteria.some((criterion) => !values.has(criterion.id))) return null;

  const weightedScore = criteria.reduce(
    (sum, criterion) => sum + criterion.weight * values.get(criterion.id)!,
    0,
  );
  const maximumScore = criteria.reduce(
    (sum, criterion) => sum + criterion.weight * 5,
    0,
  );

  return Math.round((weightedScore / maximumScore) * 1000) / 10;
}

export function classifySubmission(
  criteria: readonly EvaluationCriterion[],
  scores: readonly EvaluationScore[],
): SubmissionEvaluation {
  if (!criteria.length) {
    return { scoringStatus: "UNSCORED", percentage: null };
  }

  const currentCriterionIds = new Set(
    criteria.map((criterion) => criterion.id),
  );
  const currentScores = scores.filter((score) =>
    currentCriterionIds.has(score.criterionId),
  );

  if (!currentScores.length) {
    return { scoringStatus: "UNSCORED", percentage: null };
  }

  const percentage = calculateWeightedPercentage(criteria, currentScores);
  if (percentage === null) {
    return { scoringStatus: "PARTIALLY_SCORED", percentage: null };
  }

  return { scoringStatus: "FULLY_SCORED", percentage };
}

export function rankSubmissions<
  T extends { createdAt: Date; scores: readonly EvaluationScore[] },
>(criteria: readonly EvaluationCriterion[], submissions: readonly T[]) {
  return submissions
    .map((submission) => ({
      ...submission,
      ...classifySubmission(criteria, submission.scores),
    }))
    .sort(compareRankedSubmissions);
}

async function requireBriefOwnership(
  briefId: string,
  companyId: string,
  delegates: EvaluationDelegates,
) {
  const brief = await delegates.brief.findUnique({
    where: { id: briefId },
    select: { id: true, companyId: true },
  });

  if (!brief) throw new EvaluationNotFoundError("Brief not found.");
  if (brief.companyId !== companyId) throw new EvaluationOwnershipError();

  return brief;
}

export async function addCriterion(
  companyId: string,
  rawInput: z.input<typeof addCriterionInputSchema>,
  delegates: EvaluationDelegates = db,
) {
  const input = addCriterionInputSchema.parse(rawInput);
  await requireBriefOwnership(input.briefId, companyId, delegates);

  return delegates.rubricCriterion.create({
    data: {
      briefId: input.briefId,
      name: input.name,
      weight: input.weight,
    },
    select: {
      id: true,
      briefId: true,
      name: true,
      weight: true,
      createdAt: true,
    },
  });
}

async function requireCriterionOwnership(
  criterionId: string,
  companyId: string,
  delegates: EvaluationDelegates,
) {
  const criterion = await delegates.rubricCriterion.findUnique({
    where: { id: criterionId },
    select: {
      id: true,
      briefId: true,
      brief: { select: { companyId: true } },
    },
  });

  if (!criterion) throw new EvaluationNotFoundError("Criterion not found.");
  if (criterion.brief.companyId !== companyId) {
    throw new EvaluationOwnershipError();
  }

  return criterion;
}

export async function updateCriterion(
  companyId: string,
  rawInput: z.input<typeof updateCriterionInputSchema>,
  delegates: EvaluationDelegates = db,
) {
  const input = updateCriterionInputSchema.parse(rawInput);
  await requireCriterionOwnership(input.criterionId, companyId, delegates);

  return delegates.rubricCriterion.update({
    where: { id: input.criterionId },
    data: { name: input.name, weight: input.weight },
    select: {
      id: true,
      briefId: true,
      name: true,
      weight: true,
      createdAt: true,
    },
  });
}

export async function removeCriterion(
  companyId: string,
  rawInput: z.input<typeof removeCriterionInputSchema>,
  delegates: EvaluationDelegates = db,
) {
  const input = removeCriterionInputSchema.parse(rawInput);
  await requireCriterionOwnership(input.criterionId, companyId, delegates);

  return delegates.rubricCriterion.delete({
    where: { id: input.criterionId },
    select: { id: true, briefId: true },
  });
}

export async function getCompanyEvaluation(
  companyId: string,
  briefId: string,
  delegates: EvaluationDelegates = db,
) {
  const brief = await delegates.brief.findUnique({
    where: { id: briefId },
    select: {
      id: true,
      companyId: true,
      criteria: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, weight: true, createdAt: true },
      },
      submissions: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          briefId: true,
          engineerId: true,
          repoUrl: true,
          demoUrl: true,
          writeup: true,
          feedbackNote: true,
          createdAt: true,
          updatedAt: true,
          engineer: { select: { displayName: true } },
          scores: { select: { criterionId: true, value: true } },
        },
      },
    },
  });

  if (!brief) throw new EvaluationNotFoundError("Brief not found.");
  if (brief.companyId !== companyId) throw new EvaluationOwnershipError();

  return {
    criteria: brief.criteria,
    submissions: rankSubmissions(brief.criteria, brief.submissions),
  };
}

export async function scoreSubmission(
  companyId: string,
  rawInput: z.input<typeof scoreSubmissionInputSchema>,
  delegates: EvaluationDelegates = db,
) {
  const input = scoreSubmissionInputSchema.parse(rawInput);
  const submission = await delegates.submission.findUnique({
    where: { id: input.submissionId },
    select: {
      id: true,
      brief: {
        select: {
          companyId: true,
          criteria: { select: { id: true } },
        },
      },
    },
  });

  if (!submission) throw new EvaluationNotFoundError("Submission not found.");
  if (submission.brief.companyId !== companyId) {
    throw new EvaluationOwnershipError();
  }

  const currentCriterionIds = new Set(
    submission.brief.criteria.map((criterion) => criterion.id),
  );
  if (!currentCriterionIds.size) {
    throw new InvalidScoreSetError(
      "Add at least one rubric criterion before scoring.",
    );
  }
  if (
    input.scores.length !== currentCriterionIds.size ||
    input.scores.some((score) => !currentCriterionIds.has(score.criterionId))
  ) {
    throw new InvalidScoreSetError("Score every current rubric criterion.");
  }

  return delegates.submission.update({
    where: { id: submission.id },
    data: {
      feedbackNote: input.feedbackNote === "" ? null : input.feedbackNote,
      scores: {
        upsert: input.scores.map((score) => ({
          where: {
            submissionId_criterionId: {
              submissionId: submission.id,
              criterionId: score.criterionId,
            },
          },
          create: {
            criterionId: score.criterionId,
            value: score.value,
          },
          update: { value: score.value },
        })),
      },
    },
    select: { id: true },
  });
}

export async function getEngineerResult(
  engineerId: string,
  submissionId: string,
  delegates: EvaluationDelegates = db,
) {
  const submission = await delegates.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      engineerId: true,
      feedbackNote: true,
      brief: {
        select: {
          criteria: {
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, weight: true },
          },
        },
      },
      scores: { select: { criterionId: true, value: true } },
    },
  });

  if (!submission) throw new EvaluationNotFoundError("Submission not found.");
  if (submission.engineerId !== engineerId) {
    throw new EvaluationEngineerOwnershipError();
  }

  const evaluation = classifySubmission(
    submission.brief.criteria,
    submission.scores,
  );
  if (evaluation.scoringStatus !== "FULLY_SCORED") return null;

  const values = new Map(
    submission.scores.map((score) => [score.criterionId, score.value]),
  );

  return {
    submissionId: submission.id,
    percentage: evaluation.percentage!,
    feedbackNote: submission.feedbackNote,
    scores: submission.brief.criteria.map((criterion) => ({
      criterionId: criterion.id,
      name: criterion.name,
      weight: criterion.weight,
      value: values.get(criterion.id)!,
    })),
  };
}
