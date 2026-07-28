import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import {
  paginationCursorSchema,
  pageSizeSchema,
  PUBLIC_PROJECT_PAGE_SIZE,
} from "~/server/pagination";
import {
  createProject,
  deleteProject,
  getPublicProject,
  listMyProjects,
  listProjectsByUsername,
  ProjectMediaUnavailableError,
  ProjectNotFoundError,
  ProjectOwnershipError,
  projectInputSchema,
  updateProject,
} from "~/server/projects";
import { consumeRateLimit } from "~/server/rate-limit";

const CREATE_PROJECT_RATE_LIMIT_SCOPE = "project.create";
const UPDATE_PROJECT_RATE_LIMIT_SCOPE = "project.update";
const DELETE_PROJECT_RATE_LIMIT_SCOPE = "project.delete";
const PROJECT_MUTATION_RATE_LIMIT_THRESHOLD = 60;
const PROJECT_MUTATION_RATE_LIMIT_WINDOW_MS = 60_000;

function projectError(error: unknown): never {
  if (error instanceof ProjectMediaUnavailableError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
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
    .mutation(async ({ ctx, input }) => {
      await consumeRateLimit(
        {
          scope: CREATE_PROJECT_RATE_LIMIT_SCOPE,
          key: ctx.session.user.id,
          limit: PROJECT_MUTATION_RATE_LIMIT_THRESHOLD,
          windowMs: PROJECT_MUTATION_RATE_LIMIT_WINDOW_MS,
          lockoutMs: PROJECT_MUTATION_RATE_LIMIT_WINDOW_MS,
        },
        ctx.db.rateLimitAttempt,
      );
      return createProject(ctx.session.user.id, input, ctx.db);
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().min(1), project: projectInputSchema }))
    .mutation(async ({ ctx, input }) => {
      await consumeRateLimit(
        {
          scope: UPDATE_PROJECT_RATE_LIMIT_SCOPE,
          key: ctx.session.user.id,
          limit: PROJECT_MUTATION_RATE_LIMIT_THRESHOLD,
          windowMs: PROJECT_MUTATION_RATE_LIMIT_WINDOW_MS,
          lockoutMs: PROJECT_MUTATION_RATE_LIMIT_WINDOW_MS,
        },
        ctx.db.rateLimitAttempt,
      );
      try {
        return await updateProject(
          input.id,
          ctx.session.user.id,
          input.project,
          ctx.db,
        );
      } catch (error) {
        projectError(error);
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await consumeRateLimit(
        {
          scope: DELETE_PROJECT_RATE_LIMIT_SCOPE,
          key: ctx.session.user.id,
          limit: PROJECT_MUTATION_RATE_LIMIT_THRESHOLD,
          windowMs: PROJECT_MUTATION_RATE_LIMIT_WINDOW_MS,
          lockoutMs: PROJECT_MUTATION_RATE_LIMIT_WINDOW_MS,
        },
        ctx.db.rateLimitAttempt,
      );
      try {
        await deleteProject(input.id, ctx.session.user.id, ctx.db);
        return { success: true as const };
      } catch (error) {
        projectError(error);
      }
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) =>
      getPublicProject(
        input.id,
        ctx.session?.user?.id ?? null,
        ctx.db.project,
        ctx.db.gridLayout,
      ),
    ),

  listMine: protectedProcedure
    .input(
      z
        .object({
          cursor: paginationCursorSchema.optional(),
          limit: pageSizeSchema(PUBLIC_PROJECT_PAGE_SIZE),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      listMyProjects(
        ctx.session.user.id,
        ctx.db.project,
        ctx.db.user,
        ctx.db.block,
        input,
      ),
    ),

  listByUsername: publicProcedure
    .input(
      z.object({
        username: z.string().trim().min(1),
        cursor: paginationCursorSchema.optional(),
        limit: pageSizeSchema(PUBLIC_PROJECT_PAGE_SIZE),
      }),
    )
    .query(({ ctx, input }) =>
      listProjectsByUsername(
        input.username,
        ctx.session?.user?.id ?? null,
        ctx.db.project,
        input,
      ),
    ),
});
