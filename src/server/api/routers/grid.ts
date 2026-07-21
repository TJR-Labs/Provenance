import { TRPCError } from "@trpc/server";
import { z, ZodError } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  getProfileGridEditorState,
  getProjectGridEditorState,
  GridLayoutConflictError,
  GridLayoutOwnershipError,
  GridLayoutUnavailableError,
  GridLayoutValidationError,
  gridProjectSaveInputSchema,
  gridSaveInputSchema,
  publishProfileGrid,
  publishProjectGrid,
  saveProfileGridDraft,
} from "~/server/grid-layouts";

function gridError(error: unknown): never {
  if (error instanceof GridLayoutOwnershipError) {
    throw new TRPCError({ code: "FORBIDDEN", message: error.message });
  }
  if (error instanceof GridLayoutUnavailableError) {
    throw new TRPCError({ code: "NOT_FOUND", message: error.message });
  }
  if (error instanceof GridLayoutConflictError) {
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }
  if (error instanceof GridLayoutValidationError || error instanceof ZodError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

export const gridRouter = createTRPCRouter({
  profileEditorState: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getProfileGridEditorState(ctx.session.user.id, ctx.db);
    } catch (error) {
      gridError(error);
    }
  }),

  projectEditorState: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      try {
        return await getProjectGridEditorState(
          input.projectId,
          ctx.session.user.id,
          ctx.db,
        );
      } catch (error) {
        gridError(error);
      }
    }),

  saveProfileDraft: protectedProcedure
    .input(gridSaveInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await saveProfileGridDraft(ctx.session.user.id, input, ctx.db);
      } catch (error) {
        gridError(error);
      }
    }),

  publishProfile: protectedProcedure
    .input(gridSaveInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await publishProfileGrid(ctx.session.user.id, input, ctx.db);
      } catch (error) {
        gridError(error);
      }
    }),

  publishProject: protectedProcedure
    .input(gridProjectSaveInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await publishProjectGrid(
          input.projectId,
          ctx.session.user.id,
          input,
          ctx.db,
        );
      } catch (error) {
        gridError(error);
      }
    }),
});
