import type { PrismaClient } from "../../generated/prisma";
import { z } from "zod";

import { db } from "~/server/db";

export const devlogInputSchema = z.object({
  label: z.string().trim().min(1, "Label is required.").max(20),
  body: z.string().trim().min(1, "Note is required.").max(500),
});

export type DevlogInput = z.infer<typeof devlogInputSchema>;

export async function createDevlogEntry(
  userId: string,
  rawInput: DevlogInput,
  database: PrismaClient = db,
) {
  const input = devlogInputSchema.parse(rawInput);
  return database.devlogEntry.create({
    data: { userId, label: input.label, body: input.body },
  });
}

export async function listDevlogEntries(
  userId: string,
  database: PrismaClient = db,
  options: { limit?: number } = {},
) {
  const limit = options.limit ?? 20;
  return database.devlogEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function countDevlogEntriesSince(
  userId: string,
  since: Date,
  database: PrismaClient = db,
) {
  return database.devlogEntry.count({
    where: { userId, createdAt: { gte: since } },
  });
}
