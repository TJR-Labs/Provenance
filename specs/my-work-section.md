# My Work Section — Spec

## Objective

There is currently no page that lists all of a user's projects. Creating one
is done via a "New project" nav link straight to `/projects/new`; managing an
existing one requires already knowing its URL or finding it through the
canvas editor's Library sidebar or the public profile grid. There is no
single place to see, add, or manage the full set of projects that make up a
user's portfolio.

"My Work" fills that gap: a dedicated hub page listing all of a user's
projects, with an entry point to add a new one and manage existing ones.
It's the source library the canvas editor's placement UI already draws
from (`getCanvasEditorState` in `src/server/canvas.ts`) — My Work is where
that content actually gets created and maintained.

Success looks like: a user clicks "My Work" in the nav and sees every
project they've created, with enough info to recognize each one and jump
into editing it, plus a clear way to add a new one — instead of relying on
nav shortcuts or the canvas Library to discover their own content.

## Requirements

1. A new route (`/my-work`) lists every project belonging to the signed-in
   user: title, thumbnail (first media item, if any), and whether it's
   currently placed on the canvas or unplaced (mirroring the placed/unplaced
   status already shown in the canvas editor's Library sidebar).
2. The top nav's existing "New project" link is replaced by a "My Work"
   link, pointing at `/my-work`.
3. `/my-work` has its own "Add project" entry point (linking to the existing
   `/projects/new` flow) — the nav no longer links directly to project
   creation.
4. Each listed project links to its existing edit page (`/projects/[id]/edit`,
   via `project-form.tsx`), which already supports title, description,
   images/media, and links per project. No new project-editing UI is built;
   My Work is the missing list/hub view, not a rebuild of the edit form.
5. Deleting a project remains available from the existing edit page/flow;
   behavior is unchanged (existing cascade: removes it from the canvas if
   placed, and from the profile grid).
6. Bio, links (the profile-wide list), about text, display name, avatar,
   school, theme, custom CSS, section order, and layout mode are unaffected
   by this spec — they remain on `/profile/edit` exactly as they are today.
7. The canvas editor's Library sidebar and public profile rendering are
   unaffected — both already read from the `Project` table directly and
   need no changes for My Work to exist.

## Constraints

- Build on the existing stack: Next.js 15 (App Router), React 19, tRPC,
  Prisma with Supabase Postgres, Tailwind CSS v4.
- `/my-work` is a protected route (same auth gate as `/projects/new`,
  `/profile/edit`, etc. under the `(protected)` layout).
- Reuse the existing `Project` model, `project-form.tsx`, and
  `/projects/new` / `/projects/[id]/edit` pages as-is; this spec only adds
  the listing page and a `tRPC` query to fetch the signed-in user's own
  projects (ordered newest-first, matching the existing ordering used
  elsewhere, e.g. `getCanvasEditorState`).
- No change to unrelated existing infrastructure (auth, rate limiting,
  security headers, CI pipeline) is required or expected by this spec.

## Edge Cases

- **User has zero projects**: `/my-work` shows an empty state ("No records
  yet" / no projects yet, consistent with the empty-state pattern already
  used on the public profile grid) with a prominent "Add project" entry
  point.
- **Project has no media/thumbnail**: list shows a placeholder consistent
  with how the canvas Library sidebar already renders projects without a
  `thumbnailUrl`.
- **Project deleted while placed on the canvas**: unchanged existing
  cascade behavior — removed from canvas and profile grid; `/my-work` no
  longer lists it.
- **User navigates to `/my-work` while logged out**: redirected to `/login`,
  same as any other protected route.
- **Very large number of projects**: no pagination is required by this
  spec; the list renders all of a user's projects (portfolios are expected
  to hold a modest project count, consistent with the existing unpaginated
  profile grid and canvas Library sidebar).

## Definition of Done

- [ ] `/my-work` exists, is protected (redirects to `/login` when signed
      out), and lists all of the signed-in user's projects with title,
      thumbnail (or placeholder), and placed/unplaced-on-canvas status.
- [ ] Top nav shows "My Work" linking to `/my-work`; the old "New project"
      nav link no longer appears.
- [ ] `/my-work` has an "Add project" entry point that reaches the existing
      `/projects/new` flow.
- [ ] Each listed project links to its existing `/projects/[id]/edit` page
      and reflects edits/deletions made there without further changes to
      that page.
- [ ] A user with zero projects sees an empty state with an "Add project"
      entry point instead of a blank page.
- [ ] `/profile/edit` (bio/links/about/appearance/layout mode) is unchanged
      by this spec, verified by existing tests continuing to pass unmodified.
- [ ] The canvas editor's Library sidebar and public profile rendering
      continue to work unchanged (existing tests pass with no modification
      needed for this spec).
- [ ] `npm run build` and `npm test` pass with no regression to existing
      project, profile, or canvas tests.
