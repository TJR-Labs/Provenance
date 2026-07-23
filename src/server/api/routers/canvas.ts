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
import { consumeRateLimit } from "~/server/rate-limit";

const SET_MODE_RATE_LIMIT_SCOPE = "canvas.setMode";
const DISMISS_HINT_RATE_LIMIT_SCOPE = "canvas.dismissHint";
const SAVE_DRAFT_RATE_LIMIT_SCOPE = "canvas.saveDraft";
const PUBLISH_RATE_LIMIT_SCOPE = "canvas.publish";
const VALIDATE_CLIPBOARD_RATE_LIMIT_SCOPE = "canvas.validateClipboard";
const SET_RESOURCE_REMOVED_RATE_LIMIT_SCOPE = "canvas.setResourceRemoved";
const CANVAS_MUTATION_RATE_LIMIT_THRESHOLD = 60;
const CANVAS_MUTATION_RATE_LIMIT_WINDOW_MS = 60_000;

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
    .mutation(async ({ ctx, input }) => {
      await consumeRateLimit(
        {
          scope: SET_MODE_RATE_LIMIT_SCOPE,
          key: ctx.session.user.id,
          limit: CANVAS_MUTATION_RATE_LIMIT_THRESHOLD,
          windowMs: CANVAS_MUTATION_RATE_LIMIT_WINDOW_MS,
          lockoutMs: CANVAS_MUTATION_RATE_LIMIT_WINDOW_MS,
        },
        ctx.db.rateLimitAttempt,
      );
      return setLayoutMode(ctx.session.user.id, input.mode);
    }),

  getEditorState: protectedProcedure.query(({ ctx }) =>
    getCanvasEditorState(ctx.session.user.id),
  ),

  dismissHint: protectedProcedure.mutation(async ({ ctx }) => {
    await consumeRateLimit(
      {
        scope: DISMISS_HINT_RATE_LIMIT_SCOPE,
        key: ctx.session.user.id,
        limit: CANVAS_MUTATION_RATE_LIMIT_THRESHOLD,
        windowMs: CANVAS_MUTATION_RATE_LIMIT_WINDOW_MS,
        lockoutMs: CANVAS_MUTATION_RATE_LIMIT_WINDOW_MS,
      },
      ctx.db.rateLimitAttempt,
    );
    return dismissCanvasHint(ctx.session.user.id);
  }),

  saveDraft: protectedProcedure
    .input(canvasSnapshotInputSchema)
    .mutation(async ({ ctx, input }) => {
      await consumeRateLimit(
        {
          scope: SAVE_DRAFT_RATE_LIMIT_SCOPE,
          key: ctx.session.user.id,
          limit: CANVAS_MUTATION_RATE_LIMIT_THRESHOLD,
          windowMs: CANVAS_MUTATION_RATE_LIMIT_WINDOW_MS,
          lockoutMs: CANVAS_MUTATION_RATE_LIMIT_WINDOW_MS,
        },
        ctx.db.rateLimitAttempt,
      );
      try {
        return await saveCanvasDraft(ctx.session.user.id, input);
      } catch (error) {
        canvasError(error);
      }
    }),

  publish: protectedProcedure
    .input(canvasSnapshotInputSchema)
    .mutation(async ({ ctx, input }) => {
      await consumeRateLimit(
        {
          scope: PUBLISH_RATE_LIMIT_SCOPE,
          key: ctx.session.user.id,
          limit: CANVAS_MUTATION_RATE_LIMIT_THRESHOLD,
          windowMs: CANVAS_MUTATION_RATE_LIMIT_WINDOW_MS,
          lockoutMs: CANVAS_MUTATION_RATE_LIMIT_WINDOW_MS,
        },
        ctx.db.rateLimitAttempt,
      );
      try {
        return await publishCanvasLayout(ctx.session.user.id, input);
      } catch (error) {
        canvasError(error);
      }
    }),

  validateClipboard: protectedProcedure
    .input(z.unknown())
    .mutation(async ({ ctx, input }) => {
      await consumeRateLimit(
        {
          scope: VALIDATE_CLIPBOARD_RATE_LIMIT_SCOPE,
          key: ctx.session.user.id,
          limit: CANVAS_MUTATION_RATE_LIMIT_THRESHOLD,
          windowMs: CANVAS_MUTATION_RATE_LIMIT_WINDOW_MS,
          lockoutMs: CANVAS_MUTATION_RATE_LIMIT_WINDOW_MS,
        },
        ctx.db.rateLimitAttempt,
      );
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
      await consumeRateLimit(
        {
          scope: SET_RESOURCE_REMOVED_RATE_LIMIT_SCOPE,
          key: ctx.session.user.id,
          limit: CANVAS_MUTATION_RATE_LIMIT_THRESHOLD,
          windowMs: CANVAS_MUTATION_RATE_LIMIT_WINDOW_MS,
          lockoutMs: CANVAS_MUTATION_RATE_LIMIT_WINDOW_MS,
        },
        ctx.db.rateLimitAttempt,
      );
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
