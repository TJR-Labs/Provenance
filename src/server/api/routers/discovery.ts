import { Category } from "../../../../generated/prisma";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { discoverProjects, listPopularHashtags } from "~/server/projects";

export const discoveryRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        category: z.nativeEnum(Category).optional(),
        hashtag: z.string().trim().max(60).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      discoverProjects(input, ctx.session?.user?.id ?? null, ctx.db.project),
    ),
  popularHashtags: publicProcedure.query(({ ctx }) =>
    listPopularHashtags(20, ctx.db.project),
  ),
});
