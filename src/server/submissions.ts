import { BriefStatus, Role, type PrismaClient } from "../../generated/prisma";
import { z } from "zod";

import { db } from "~/server/db";

type BriefDelegate = Pick<PrismaClient["brief"], "findUnique">;
type SubmissionDelegate = Pick<
  PrismaClient["submission"],
  "findMany" | "findUnique" | "upsert"
>;
type UserDelegate = Pick<PrismaClient["user"], "findUnique">;

const httpUrlSchema = z
  .string()
  .trim()
  .url("Enter a valid URL.")
  .refine(
    (value) => {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    },
    { message: "URL must start with http:// or https://." },
  );

export const submissionFieldsSchema = z.object({
  repoUrl: httpUrlSchema,
  demoUrl: httpUrlSchema.nullable(),
  writeup: z.string().trim().min(1, "Writeup is required."),
});

export const upsertSubmissionInputSchema = submissionFieldsSchema.extend({
  briefId: z.string().min(1),
});

export type SubmissionFields = z.infer<typeof submissionFieldsSchema>;

export class SubmissionBriefNotFoundError extends Error {
  constructor() {
    super("Brief not found.");
    this.name = "SubmissionBriefNotFoundError";
  }
}

export class SubmissionBriefClosedError extends Error {
  constructor() {
    super(
      "This brief is closed. Submissions can no longer be created or edited.",
    );
    this.name = "SubmissionBriefClosedError";
  }
}

export class SubmissionBriefOwnershipError extends Error {
  constructor() {
    super("You do not own this brief.");
    this.name = "SubmissionBriefOwnershipError";
  }
}

export class EngineerNotFoundError extends Error {
  constructor() {
    super("Engineer not found.");
    this.name = "EngineerNotFoundError";
  }
}

const submissionSelect = {
  id: true,
  briefId: true,
  engineerId: true,
  repoUrl: true,
  demoUrl: true,
  writeup: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function upsertSubmission(
  engineerId: string,
  rawInput: z.input<typeof upsertSubmissionInputSchema>,
  briefs: BriefDelegate = db.brief,
  submissions: SubmissionDelegate = db.submission,
) {
  const input = upsertSubmissionInputSchema.parse(rawInput);
  const brief = await briefs.findUnique({
    where: { id: input.briefId },
    select: { id: true, status: true },
  });

  if (!brief) {
    throw new SubmissionBriefNotFoundError();
  }
  if (brief.status === BriefStatus.CLOSED) {
    throw new SubmissionBriefClosedError();
  }

  const fields = {
    repoUrl: input.repoUrl,
    demoUrl: input.demoUrl,
    writeup: input.writeup,
  };

  return submissions.upsert({
    where: {
      briefId_engineerId: { briefId: input.briefId, engineerId },
    },
    create: {
      briefId: input.briefId,
      engineerId,
      ...fields,
    },
    update: fields,
    select: submissionSelect,
  });
}

export async function listSubmissionsForBrief(
  companyId: string,
  briefId: string,
  briefs: BriefDelegate = db.brief,
  submissions: SubmissionDelegate = db.submission,
) {
  const brief = await briefs.findUnique({
    where: { id: briefId },
    select: { id: true, companyId: true },
  });

  if (!brief) {
    throw new SubmissionBriefNotFoundError();
  }
  if (brief.companyId !== companyId) {
    throw new SubmissionBriefOwnershipError();
  }

  return submissions.findMany({
    where: { briefId },
    orderBy: { updatedAt: "desc" },
    select: {
      ...submissionSelect,
      engineer: { select: { displayName: true } },
    },
  });
}

export function getSubmissionForBrief(
  engineerId: string,
  briefId: string,
  submissions: SubmissionDelegate = db.submission,
) {
  return submissions.findUnique({
    where: { briefId_engineerId: { briefId, engineerId } },
    select: submissionSelect,
  });
}

export async function listSubmissionsForEngineer(
  engineerId: string,
  users: UserDelegate = db.user,
  submissions: SubmissionDelegate = db.submission,
) {
  const engineer = await users.findUnique({
    where: { id: engineerId },
    select: { id: true, displayName: true, role: true },
  });

  if (engineer?.role !== Role.ENGINEER) {
    throw new EngineerNotFoundError();
  }

  const engineerSubmissions = await submissions.findMany({
    where: { engineerId },
    orderBy: { updatedAt: "desc" },
    select: {
      ...submissionSelect,
      brief: {
        select: { id: true, title: true, domain: true },
      },
    },
  });

  return {
    engineer: { id: engineer.id, displayName: engineer.displayName },
    submissions: engineerSubmissions,
  };
}
