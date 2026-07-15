import { Role, type PrismaClient } from "../../generated/prisma";
import { z } from "zod";

import { db } from "~/server/db";
import {
  compareRankedSubmissions,
  rankSubmissions,
} from "~/server/evaluations";

type MessageDelegates = Pick<
  PrismaClient,
  "brief" | "message" | "submission" | "user"
>;

export const sendOutreachInputSchema = z.object({
  toEngineerId: z.string().min(1),
  briefId: z.string().min(1).nullable(),
  body: z.string().trim().min(1, "Message body is required."),
});

export class InvalidOutreachRecipientError extends Error {
  constructor() {
    super("Outreach can only be sent to an engineer.");
    this.name = "InvalidOutreachRecipientError";
  }
}

export class InvalidOutreachBriefError extends Error {
  constructor() {
    super("The related brief must belong to your company.");
    this.name = "InvalidOutreachBriefError";
  }
}

export async function sendOutreach(
  companyId: string,
  rawInput: z.input<typeof sendOutreachInputSchema>,
  delegates: MessageDelegates = db,
) {
  const input = sendOutreachInputSchema.parse(rawInput);
  const recipient = await delegates.user.findUnique({
    where: { id: input.toEngineerId },
    select: { id: true, role: true },
  });

  if (recipient?.role !== Role.ENGINEER) {
    throw new InvalidOutreachRecipientError();
  }

  if (input.briefId) {
    const brief = await delegates.brief.findUnique({
      where: { id: input.briefId },
      select: { id: true, companyId: true },
    });
    if (brief?.companyId !== companyId) {
      throw new InvalidOutreachBriefError();
    }
  }

  return delegates.message.create({
    data: {
      fromCompanyId: companyId,
      toEngineerId: recipient.id,
      briefId: input.briefId,
      body: input.body,
    },
    select: {
      id: true,
      fromCompanyId: true,
      toEngineerId: true,
      briefId: true,
      body: true,
      createdAt: true,
      readAt: true,
    },
  });
}

export async function listScoutSubmissions(
  companyId: string,
  delegates: MessageDelegates = db,
) {
  const submissions = await delegates.submission.findMany({
    where: { brief: { companyId } },
    select: {
      id: true,
      engineerId: true,
      repoUrl: true,
      createdAt: true,
      engineer: { select: { displayName: true } },
      brief: {
        select: {
          id: true,
          title: true,
          criteria: { select: { id: true, name: true, weight: true } },
        },
      },
      scores: { select: { criterionId: true, value: true } },
    },
  });

  return submissions
    .map(
      (submission) =>
        rankSubmissions(submission.brief.criteria, [submission])[0]!,
    )
    .sort(compareRankedSubmissions);
}

export function listSentMessages(
  companyId: string,
  delegates: MessageDelegates = db,
) {
  return delegates.message.findMany({
    where: { fromCompanyId: companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      body: true,
      createdAt: true,
      toEngineer: { select: { id: true, displayName: true } },
      brief: { select: { id: true, title: true } },
    },
  });
}

export function listInboxMessages(
  engineerId: string,
  delegates: MessageDelegates = db,
) {
  return delegates.message.findMany({
    where: { toEngineerId: engineerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      body: true,
      createdAt: true,
      readAt: true,
      fromCompany: { select: { id: true, displayName: true } },
      brief: { select: { id: true, title: true } },
    },
  });
}

export function getUnreadMessageCount(
  engineerId: string,
  delegates: MessageDelegates = db,
) {
  return delegates.message.count({
    where: { toEngineerId: engineerId, readAt: null },
  });
}

export function markInboxRead(
  engineerId: string,
  delegates: MessageDelegates = db,
) {
  return delegates.message.updateMany({
    where: { toEngineerId: engineerId, readAt: null },
    data: { readAt: new Date() },
  });
}
