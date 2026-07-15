import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { BriefDomain } from "../../../../generated/prisma";
import {
  BriefNotFoundError,
  BriefOwnershipError,
  closeBrief,
  createBrief,
  createBriefInputSchema,
  getBriefById,
  listCompanyBriefs,
  listOpenBriefs,
  reopenBrief,
  updateBrief,
  updateBriefInputSchema,
} from "~/server/briefs";
import {
  companyProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

const briefIdSchema = z.object({ id: z.string().min(1) });

function throwBriefError(error: unknown): never {
  if (error instanceof BriefOwnershipError) {
    throw new TRPCError({ code: "FORBIDDEN", message: error.message });
  }
  if (error instanceof BriefNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: error.message });
  }
  throw error;
}

export const briefRouter = createTRPCRouter({
  create: companyProcedure
    .input(createBriefInputSchema)
    .mutation(({ ctx, input }) =>
      createBrief(ctx.session.user.id, input, ctx.db.brief),
    ),

  update: companyProcedure
    .input(updateBriefInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      try {
        return await updateBrief(ctx.session.user.id, id, fields, ctx.db.brief);
      } catch (error) {
        throwBriefError(error);
      }
    }),

  close: companyProcedure
    .input(briefIdSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await closeBrief(ctx.session.user.id, input.id, ctx.db.brief);
      } catch (error) {
        throwBriefError(error);
      }
    }),

  reopen: companyProcedure
    .input(briefIdSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await reopenBrief(ctx.session.user.id, input.id, ctx.db.brief);
      } catch (error) {
        throwBriefError(error);
      }
    }),

  listOpen: protectedProcedure
    .input(
      z.object({ domain: z.nativeEnum(BriefDomain).optional() }).optional(),
    )
    .query(({ ctx, input }) => listOpenBriefs(input?.domain, ctx.db.brief)),

  getById: protectedProcedure
    .input(briefIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getBriefById(input.id, ctx.db.brief);
      } catch (error) {
        throwBriefError(error);
      }
    }),

  listMine: companyProcedure.query(({ ctx }) =>
    listCompanyBriefs(ctx.session.user.id, ctx.db.brief),
  ),
});
