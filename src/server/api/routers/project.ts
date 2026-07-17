import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import {
  createProject,
  deleteProject,
  getPublicProject,
  listMyProjects,
  listProjectsByUsername,
  ProjectNotFoundError,
  ProjectOwnershipError,
  projectInputSchema,
  updateProject,
} from "~/server/projects";

function projectError(error: unknown): never {
  if (error instanceof ProjectOwnershipError) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  if (error instanceof ProjectNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  throw error;
}

export const projectRouter = createTRPCRouter({
  create: protectedProcedure
    .input(projectInputSchema)
    .mutation(({ ctx, input }) =>
      createProject(ctx.session.user.id, input, ctx.db.project),
    ),

  update: protectedProcedure
    .input(z.object({ id: z.string().min(1), project: projectInputSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateProject(
          input.id,
          ctx.session.user.id,
          input.project,
          ctx.db.project,
        );
      } catch (error) {
        projectError(error);
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteProject(input.id, ctx.session.user.id, ctx.db.project);
        return { success: true as const };
      } catch (error) {
        projectError(error);
      }
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) => getPublicProject(input.id, ctx.db.project)),

  listMine: protectedProcedure.query(({ ctx }) =>
    listMyProjects(ctx.session.user.id),
  ),

  listByUsername: publicProcedure
    .input(z.object({ username: z.string().trim().min(1) }))
    .query(({ ctx, input }) =>
      listProjectsByUsername(input.username, ctx.db.project),
    ),
});
