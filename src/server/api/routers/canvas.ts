import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  CanvasOwnershipError,
  CanvasClipboardError,
  CanvasDraftConflictError,
  canvasSnapshotInputSchema,
  dismissCanvasHint,
  getCanvasEditorState,
  publishCanvasLayout,
  saveCanvasDraft,
  setImageResourceRemoved,
  setLayoutMode,
  validateCanvasClipboard,
} from "~/server/canvas";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

function canvasError(error: unknown): never {
  if (error instanceof CanvasOwnershipError) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  if (error instanceof CanvasClipboardError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  if (error instanceof CanvasDraftConflictError) {
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }
  throw error;
}

export const canvasRouter = createTRPCRouter({
  setMode: protectedProcedure
    .input(z.object({ mode: z.enum(["GRID", "CANVAS"]) }))
    .mutation(({ ctx, input }) =>
      setLayoutMode(ctx.session.user.id, input.mode),
    ),

  getEditorState: protectedProcedure.query(({ ctx }) =>
    getCanvasEditorState(ctx.session.user.id),
  ),

  dismissHint: protectedProcedure.mutation(({ ctx }) =>
    dismissCanvasHint(ctx.session.user.id),
  ),

  saveDraft: protectedProcedure
    .input(canvasSnapshotInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await saveCanvasDraft(ctx.session.user.id, input);
      } catch (error) {
        canvasError(error);
      }
    }),

  publish: protectedProcedure
    .input(canvasSnapshotInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await publishCanvasLayout(ctx.session.user.id, input);
      } catch (error) {
        canvasError(error);
      }
    }),

  validateClipboard: protectedProcedure
    .input(z.unknown())
    .mutation(async ({ ctx, input }) => {
      try {
        return await validateCanvasClipboard(
          ctx.session.user.id,
          ctx.session.user.username,
          input,
        );
      } catch (error) {
        canvasError(error);
      }
    }),

  setResourceRemoved: protectedProcedure
    .input(z.object({ id: z.string().min(1), removed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await setImageResourceRemoved(
          ctx.session.user.id,
          input.id,
          input.removed,
        );
      } catch (error) {
        canvasError(error);
      }
    }),
});
