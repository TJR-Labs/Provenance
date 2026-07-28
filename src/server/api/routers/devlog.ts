import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  createDevlogEntry,
  devlogInputSchema,
  listDevlogEntries,
} from "~/server/devlog";
import { consumeRateLimit } from "~/server/rate-limit";

export const DEVLOG_CREATE_RATE_LIMIT_SCOPE = "devlog.create";

export const devlogRouter = createTRPCRouter({
  listMine: protectedProcedure.query(({ ctx }) =>
    listDevlogEntries(ctx.session.user.id, ctx.db),
  ),

  create: protectedProcedure
    .input(devlogInputSchema)
    .mutation(async ({ ctx, input }) => {
      await consumeRateLimit(
        {
          scope: DEVLOG_CREATE_RATE_LIMIT_SCOPE,
          key: ctx.session.user.id,
          limit: 30,
          windowMs: 60_000,
          lockoutMs: 60_000,
        },
        ctx.db.rateLimitAttempt,
      );
      return createDevlogEntry(ctx.session.user.id, input, ctx.db);
    }),
});
