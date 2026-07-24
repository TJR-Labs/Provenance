import { Category } from "../../../../generated/prisma";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  paginationCursorSchema,
  pageSizeSchema,
  PUBLIC_PROJECT_PAGE_SIZE,
} from "~/server/pagination";
import { discoverProjects, listPopularHashtags } from "~/server/projects";

export const discoveryRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        category: z.nativeEnum(Category).optional(),
        hashtag: z.string().trim().max(60).optional(),
        cursor: paginationCursorSchema.optional(),
        limit: pageSizeSchema(PUBLIC_PROJECT_PAGE_SIZE),
      }),
    )
    .query(({ ctx, input }) =>
      discoverProjects(input, ctx.session?.user?.id ?? null, ctx.db.project),
    ),
  popularHashtags: publicProcedure.query(({ ctx }) =>
    listPopularHashtags(20, ctx.db),
  ),
});
