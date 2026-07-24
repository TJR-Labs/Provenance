# Canvas Project Card Editing — Spec

## Objective

Today, right-clicking a `PROJECT` element on the canvas and choosing Edit
navigates away to that project's own edit page (`canvas-editor-refinements.md`
Requirement 4) — the only way to change what a placed card shows. There's no
way to quickly adjust how one specific placement looks (a shorter title for a
tight layout, a different blurb, which hashtags show) without leaving the
canvas and editing the underlying project, which also changes it everywhere
else the project appears (its own page, other canvas placements, `/my-work`).

This spec adds inline, canvas-only editing for a placed project card's
title, description, and hashtags, plus a choice of a few preset layouts for
how media and description are arranged within the card — all scoped to that
one canvas placement, leaving the real project untouched.

Success looks like: a user can right-click a project card on their canvas,
tweak its title/description/hashtags and pick a different card layout just
for that placement, and their actual project (and any other place it's
referenced) is unaffected.

## Requirements

### Canvas-only content override
1. Edit on a `PROJECT` canvas element opens an inline panel on the canvas
   (same interaction pattern as `TextPanel`/`ImagePanel`/`LinkPanel` —
   `canvas-editor-refinements.md` Requirement 4's "Text/Image/Link: opens
   inline editing... without navigating away"), replacing today's
   navigate-to-project-edit-page behavior.
2. The inline panel offers three optional override fields, pre-filled with
   the real project's current title/description/hashtags as placeholders:
   title override, description override, hashtags override. Leaving a field
   blank/unset means "use the real project's value" (no override stored for
   that field).
3. Saving the panel writes the overrides onto that specific `CanvasElement`
   row only. The underlying `Project` record (`title`, `description`,
   `hashtags`) is never modified by this panel. The project's own page
   (`/projects/[id]`), its `/projects/[id]/edit` form, and any *other*
   canvas placement of the same project (the user's or, if ever supported,
   another context) are unaffected and continue showing the real project
   data.
4. The panel includes a visible "Edit full project →" link to
   `/projects/[id]/edit` for changes this panel doesn't cover (media,
   category, links) — this is the same destination Edit used to navigate to
   directly; it's now a secondary action inside the inline panel rather than
   the only action.
5. Clearing a previously-set override (emptying the field and saving) removes
   that override, reverting the card to showing the real project's current
   value again.

### Card layout presets
6. A placed `PROJECT` element has a card layout override, chosen from a
   fixed preset list distinct from the project's own `layout` field
   (`projectLayouts` in `src/server/projects.ts`, used for the project's own
   page rendering — untouched by this spec). At minimum: **Media top /
   description below** (today's only rendering, and the default), **Description
   top / media below**, **Media left / description right** (side-by-side),
   and **Text only** (media hidden regardless of whether the project has
   any). No override selected means the card renders exactly as it does
   today.
7. The layout preset applies only to that canvas placement's rendering; it
   does not change the project's own page layout or any other placement.

## Constraints

- Build on the existing stack: Next.js 15 (App Router), React 19, tRPC,
  Prisma with Supabase Postgres, Tailwind CSS v4.
- New nullable columns on `CanvasElement` for the override fields (title,
  description, hashtags, card layout), following the existing
  `textContent`/`imageUrl`/`imageCaption` nullable-column pattern — not a
  new table.
- Reuse the existing `ProjectCard` component's rendering logic where
  possible (media rendering, hashtag chip styling); the new layout presets
  rearrange existing pieces rather than introducing a second card
  implementation from scratch.
- No change to `Project`'s own schema, its `layout` field's existing values,
  or `/projects/[id]/edit`'s form beyond what's already there.
- No change to unrelated existing infrastructure (auth, rate limiting,
  security headers, CI pipeline) is required or expected by this spec.

## Edge Cases

- **Hashtag override set to an empty list explicitly** (as opposed to left
  unset): renders the card with zero hashtags shown, distinct from "unset"
  which falls back to the real project's hashtags — the panel needs a clear
  way to distinguish "no override" from "override to empty."
- **Real project's title/description/hashtags change after an override was
  set**: the override still wins on that canvas placement (it's an
  override, not a snapshot-and-diverge); only clearing the override reveals
  the updated real value.
- **Project deleted while a canvas placement has overrides set**: existing
  cascade behavior removes the `CanvasElement` row (and its overrides) along
  with the project, same as today (`portfolio-canvas-builder.md`'s
  "Project deleted while placed on canvas" edge case) — no orphaned
  override data.
- **"Media left / description right" chosen on a project with no media**:
  degrades to the existing "No media on record" placeholder occupying the
  media side, not a broken/collapsed layout.
- **"Text only" chosen on a project with media**: media is simply not
  rendered in the card; this has no effect on the project's own page, where
  its media still shows normally.
- **Very long title/description override on a narrow resized card**: same
  clipping behavior already accepted for dense About-block content in
  `portfolio-canvas-builder.md`'s edge cases (clips/scrolls within the
  element; no dynamic font scaling required).

## Definition of Done

- [ ] Right-click/"⋯" Edit on a placed `PROJECT` element opens an inline
      panel on the canvas instead of navigating away, verified by a test.
- [ ] Title, description, and hashtags can each be independently overridden
      or left to fall back to the real project's value; unset vs.
      overridden-to-empty (hashtags) are distinguishable, verified by a
      test.
- [ ] Saving an override never modifies the underlying `Project` row,
      verified by a test that sets an override and asserts the project
      record is unchanged.
- [ ] The panel's "Edit full project →" link navigates to
      `/projects/[id]/edit`.
- [ ] A placed project card can select one of at least four layout presets
      (media-top/desc-below default, desc-top/media-below, media-left/
      desc-right, text-only), each rendering distinctly, verified by a
      test or snapshot per preset.
- [ ] Clearing an override reverts that field to the real project's current
      value on next render, verified by a test.
- [ ] Deleting the underlying project removes its canvas placement and any
      overrides with no orphaned data, verified by a test (no regression to
      existing cascade behavior).
- [ ] `npm run build` and `npm test` pass with no regression to existing
      canvas editor, `ProjectCard`, or project CRUD tests.
