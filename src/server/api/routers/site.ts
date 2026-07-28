import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { LEGACY_THEME_STYLE_PRESETS } from "~/lib/site-style";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { consumeRateLimit } from "~/server/rate-limit";
import {
  SiteDraftConflictError,
  SiteOwnershipError,
  getSiteEditorState,
  publishSite,
  saveSiteDraft,
  setResourceRemoved,
  setStylePreset,
  siteSnapshotInputSchema,
  type LegacyStylePreset,
} from "~/server/site-editor";

const SAVE_DRAFT_RATE_LIMIT_SCOPE = "site.saveDraft";
const PUBLISH_RATE_LIMIT_SCOPE = "site.publish";
const SET_RESOURCE_REMOVED_RATE_LIMIT_SCOPE = "site.setResourceRemoved";
const SET_STYLE_PRESET_RATE_LIMIT_SCOPE = "site.setStylePreset";
const SITE_MUTATION_RATE_LIMIT_THRESHOLD = 60;
const STYLE_PRESET_RATE_LIMIT_THRESHOLD = 10;
const SITE_MUTATION_RATE_LIMIT_WINDOW_MS = 60_000;
const STYLE_PRESETS = Object.keys(LEGACY_THEME_STYLE_PRESETS) as [
  LegacyStylePreset,
  ...LegacyStylePreset[],
];

function siteError(error: unknown): never {
  if (error instanceof SiteOwnershipError) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  if (error instanceof SiteDraftConflictError) {
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }
  throw error;
}

export const siteRouter = createTRPCRouter({
  getEditorState: protectedProcedure.query(({ ctx }) =>
    getSiteEditorState(ctx.session.user.id),
  ),

  saveDraft: protectedProcedure
    .input(siteSnapshotInputSchema)
    .mutation(async ({ ctx, input }) => {
      await consumeRateLimit(
        {
          scope: SAVE_DRAFT_RATE_LIMIT_SCOPE,
          key: ctx.session.user.id,
          limit: SITE_MUTATION_RATE_LIMIT_THRESHOLD,
          windowMs: SITE_MUTATION_RATE_LIMIT_WINDOW_MS,
          lockoutMs: SITE_MUTATION_RATE_LIMIT_WINDOW_MS,
        },
        ctx.db.rateLimitAttempt,
      );
      try {
        return await saveSiteDraft(ctx.session.user.id, input);
      } catch (error) {
        siteError(error);
      }
    }),

  publish: protectedProcedure
    .input(siteSnapshotInputSchema)
    .mutation(async ({ ctx, input }) => {
      await consumeRateLimit(
        {
          scope: PUBLISH_RATE_LIMIT_SCOPE,
          key: ctx.session.user.id,
          limit: SITE_MUTATION_RATE_LIMIT_THRESHOLD,
          windowMs: SITE_MUTATION_RATE_LIMIT_WINDOW_MS,
          lockoutMs: SITE_MUTATION_RATE_LIMIT_WINDOW_MS,
        },
        ctx.db.rateLimitAttempt,
      );
      try {
        return await publishSite(ctx.session.user.id, input);
      } catch (error) {
        siteError(error);
      }
    }),

  setResourceRemoved: protectedProcedure
    .input(z.object({ id: z.string().min(1), removed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await consumeRateLimit(
        {
          scope: SET_RESOURCE_REMOVED_RATE_LIMIT_SCOPE,
          key: ctx.session.user.id,
          limit: SITE_MUTATION_RATE_LIMIT_THRESHOLD,
          windowMs: SITE_MUTATION_RATE_LIMIT_WINDOW_MS,
          lockoutMs: SITE_MUTATION_RATE_LIMIT_WINDOW_MS,
        },
        ctx.db.rateLimitAttempt,
      );
      try {
        return await setResourceRemoved(
          ctx.session.user.id,
          input.id,
          input.removed,
        );
      } catch (error) {
        siteError(error);
      }
    }),

  setStylePreset: protectedProcedure
    .input(z.object({ preset: z.enum(STYLE_PRESETS) }))
    .mutation(async ({ ctx, input }) => {
      await consumeRateLimit(
        {
          scope: SET_STYLE_PRESET_RATE_LIMIT_SCOPE,
          key: ctx.session.user.id,
          limit: STYLE_PRESET_RATE_LIMIT_THRESHOLD,
          windowMs: SITE_MUTATION_RATE_LIMIT_WINDOW_MS,
          lockoutMs: SITE_MUTATION_RATE_LIMIT_WINDOW_MS,
        },
        ctx.db.rateLimitAttempt,
      );
      try {
        return await setStylePreset(ctx.session.user.id, input.preset);
      } catch (error) {
        siteError(error);
      }
    }),
});
