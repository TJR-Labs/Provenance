import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  CanvasOwnershipError,
  dismissCanvasHint,
  getCanvasEditorState,
  publishCanvasLayout,
  saveCanvasDraft,
  saveCanvasElementsInputSchema,
  setLayoutMode,
} from "~/server/canvas";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

function canvasError(error: unknown): never {
  if (error instanceof CanvasOwnershipError) {
    throw new TRPCError({ code: "FORBIDDEN" });
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
    .input(saveCanvasElementsInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await saveCanvasDraft(ctx.session.user.id, input);
      } catch (error) {
        canvasError(error);
      }
    }),

  publish: protectedProcedure
    .input(saveCanvasElementsInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await publishCanvasLayout(ctx.session.user.id, input);
      } catch (error) {
        canvasError(error);
      }
    }),
});
