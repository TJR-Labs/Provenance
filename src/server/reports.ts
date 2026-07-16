import type { PrismaClient } from "../../generated/prisma";
import { z } from "zod";

import { db } from "~/server/db";

type ReportDelegate = Pick<PrismaClient["report"], "create" | "findMany">;
type UserDelegate = Pick<PrismaClient["user"], "findUnique">;
type ProjectDelegate = Pick<PrismaClient["project"], "delete">;

export const reportInputSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    reportedUsername: z.string().trim().min(1).optional(),
    reason: z.string().trim().max(1000).optional(),
  })
  .refine(
    (input) => Boolean(input.projectId) !== Boolean(input.reportedUsername),
    "Report exactly one project or profile.",
  );

export type ReportInput = z.infer<typeof reportInputSchema>;

export class ReportTargetNotFoundError extends Error {}

export async function createReport(
  reporterId: string,
  rawInput: ReportInput,
  reports: ReportDelegate = db.report,
  users: UserDelegate = db.user,
) {
  const input = reportInputSchema.parse(rawInput);
  let reportedUserId: string | undefined;
  if (input.reportedUsername) {
    const user = await users.findUnique({
      where: { username: input.reportedUsername.toLowerCase() },
      select: { id: true },
    });
    if (!user) throw new ReportTargetNotFoundError();
    reportedUserId = user.id;
  }

  return reports.create({
    data: {
      reporterId,
      projectId: input.projectId,
      reportedUserId,
      reason: input.reason?.length ? input.reason : null,
    },
  });
}

export function listReports(reports: ReportDelegate = db.report) {
  return reports.findMany({
    include: {
      reporter: { select: { username: true } },
      project: {
        include: {
          user: { select: { id: true, username: true, banned: true } },
        },
      },
      reportedUser: { select: { id: true, username: true, banned: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function removeReportedProject(
  projectId: string,
  projects: ProjectDelegate = db.project,
) {
  return projects.delete({ where: { id: projectId } });
}
