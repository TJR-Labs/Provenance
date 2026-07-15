import {
  BriefDomain,
  BriefStatus,
  type PrismaClient,
} from "../../generated/prisma";
import { z } from "zod";

import { db } from "~/server/db";

type BriefDelegate = Pick<
  PrismaClient["brief"],
  "create" | "findMany" | "findUnique" | "update"
>;

export const briefFieldsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(120, "Title must be 120 characters or fewer."),
  summary: z
    .string()
    .trim()
    .min(1, "Summary is required.")
    .max(200, "Summary must be 200 characters or fewer."),
  description: z.string().trim().min(1, "Description is required."),
  domain: z.nativeEnum(BriefDomain, {
    errorMap: () => ({ message: "Choose a valid domain." }),
  }),
  deliverables: z.string().trim().min(1, "Deliverables are required."),
});

export const createBriefInputSchema = briefFieldsSchema;
export const updateBriefInputSchema = briefFieldsSchema.extend({
  id: z.string().min(1),
});

export type BriefFields = z.infer<typeof briefFieldsSchema>;

export class BriefNotFoundError extends Error {
  constructor() {
    super("Brief not found.");
    this.name = "BriefNotFoundError";
  }
}

export class BriefOwnershipError extends Error {
  constructor() {
    super("You do not own this brief.");
    this.name = "BriefOwnershipError";
  }
}

const briefListSelect = {
  id: true,
  companyId: true,
  title: true,
  summary: true,
  domain: true,
  status: true,
  createdAt: true,
  closedAt: true,
  company: { select: { displayName: true } },
} as const;

const briefDetailSelect = {
  ...briefListSelect,
  description: true,
  deliverables: true,
} as const;

async function requireOwnership(
  id: string,
  companyId: string,
  briefs: BriefDelegate,
) {
  const brief = await briefs.findUnique({
    where: { id },
    select: {
      id: true,
      companyId: true,
      status: true,
      closedAt: true,
    },
  });

  if (!brief) {
    throw new BriefNotFoundError();
  }
  if (brief.companyId !== companyId) {
    throw new BriefOwnershipError();
  }

  return brief;
}

export async function createBrief(
  companyId: string,
  rawInput: BriefFields,
  briefs: BriefDelegate = db.brief,
) {
  const input = createBriefInputSchema.parse(rawInput);
  return briefs.create({
    data: {
      ...input,
      companyId,
      status: BriefStatus.OPEN,
    },
    select: briefDetailSelect,
  });
}

export async function updateBrief(
  companyId: string,
  id: string,
  rawInput: BriefFields,
  briefs: BriefDelegate = db.brief,
) {
  const input = briefFieldsSchema.parse(rawInput);
  await requireOwnership(id, companyId, briefs);

  return briefs.update({
    where: { id },
    data: input,
    select: briefDetailSelect,
  });
}

export async function closeBrief(
  companyId: string,
  id: string,
  briefs: BriefDelegate = db.brief,
) {
  const brief = await requireOwnership(id, companyId, briefs);

  return briefs.update({
    where: { id },
    data: {
      status: BriefStatus.CLOSED,
      closedAt: brief.closedAt ?? new Date(),
    },
    select: briefDetailSelect,
  });
}

export async function reopenBrief(
  companyId: string,
  id: string,
  briefs: BriefDelegate = db.brief,
) {
  await requireOwnership(id, companyId, briefs);

  return briefs.update({
    where: { id },
    data: { status: BriefStatus.OPEN, closedAt: null },
    select: briefDetailSelect,
  });
}

export function listOpenBriefs(
  domain?: BriefDomain,
  briefs: BriefDelegate = db.brief,
) {
  return briefs.findMany({
    where: {
      status: BriefStatus.OPEN,
      ...(domain ? { domain } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: briefListSelect,
  });
}

export async function getBriefById(
  id: string,
  briefs: BriefDelegate = db.brief,
) {
  const brief = await briefs.findUnique({
    where: { id },
    select: briefDetailSelect,
  });

  if (!brief) {
    throw new BriefNotFoundError();
  }

  return brief;
}

export function listCompanyBriefs(
  companyId: string,
  briefs: BriefDelegate = db.brief,
) {
  return briefs.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: briefListSelect,
  });
}
