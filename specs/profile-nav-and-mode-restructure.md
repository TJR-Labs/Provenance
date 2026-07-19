# Profile Nav & Mode Restructure — Spec

## Objective

Today `/<username>` shows a single "Edit profile" link (to `/profile/edit`),
and `/profile/edit` (`profile-form.tsx`) bundles the content form (name, bio,
links, theme, custom CSS) together with the grid/canvas layout-mode toggle and
a conditional "Edit canvas layout →" link to `/profile/canvas`. Saving the
content form redirects back to `/profile/edit?success=1`, keeping the user in
the editor instead of returning them to their finished profile.

This spec splits "edit what it says" from "edit how it's arranged" into two
distinct, always-visible entry points, moves the layout-mode toggle to where
the arranging happens, and makes saving profile info return the user to their
profile.

Success looks like: a signed-in user viewing their own profile sees two
buttons — one for content, one for layout — and saving the content form drops
them back on their live profile instead of leaving them mid-edit.

## Requirements

1. On `/<username>` (own profile), replace the single "Edit profile" link
   with two buttons/links, shown together: **"Edit Profile"** → `/profile/edit`
   and **"Edit Layout"** → `/profile/canvas`. Both are visible regardless of
   the profile's current `layoutMode`.
2. The grid/canvas mode toggle (currently the `layout-mode` fieldset in
   `profile-form.tsx`, using `api.canvas.setMode`) is removed from
   `/profile/edit` and moved to `/profile/canvas` (`canvas/page.tsx`). The
   toggle keeps its existing behavior (immediate switch via
   `canvas.setMode`, no separate save step).
3. The "Edit canvas layout →" link inside `profile-form.tsx` is removed (its
   job is now done by the top-level "Edit Layout" button from Requirement 1).
4. `canvas/page.tsx`'s current "your profile is on grid, switch first" gate
   is replaced: visiting `/profile/canvas` while in `GRID` mode now shows the
   mode toggle directly on that page (so the user can switch right there)
   instead of only linking back to `/profile/edit#layout-mode`.
5. `updateProfileAction` (`src/app/(protected)/profile/edit/actions.ts`)
   redirects to the user's own public profile (`/<username>`) on a successful
   save, instead of `/profile/edit?success=1`. The profile page shows a
   brief success acknowledgment (e.g. a `?saved=1` query flag rendering a
   dismissable confirmation) rather than silently landing with no feedback.
6. On validation/save failure, behavior is unchanged: redirect back to
   `/profile/edit?error=...` with the existing inline error rendering, so the
   user can fix the form without losing it.

## Constraints

- Build on the existing stack: Next.js 15 (App Router), React 19, tRPC,
  Prisma with Supabase Postgres, Tailwind CSS v4.
- No change to `canvas.setMode`'s server behavior, to what data grid vs.
  canvas mode render, or to any other field/action in `profile-form.tsx`
  beyond removing the `layout-mode` fieldset and its "Edit canvas layout"
  link.
- `updateProfileAction` needs the acting user's `username` to build the
  redirect target; get it from the authenticated session (already available
  via `getServerCaller`/`auth()` elsewhere in this codebase) or from
  `profile.update`'s return value — do not add a new round trip solely to
  fetch it if the session already has it.
- No change to unrelated existing infrastructure (auth, rate limiting,
  security headers, CI pipeline) is required or expected by this spec.

## Edge Cases

- **User saves the content form with a validation error** (e.g. unsupported
  theme): still redirects to `/profile/edit?error=...`, not to the public
  profile — only a successful save redirects away.
- **User visits `/profile/canvas` while in `GRID` mode**: sees the mode
  toggle inline (not just a link elsewhere); switching to `CANVAS` there
  immediately reveals the canvas editor on the same page without a further
  navigation.
- **User switches mode on `/profile/canvas` from `CANVAS` back to `GRID`**:
  the canvas editor UI is replaced by the same "you're on grid" state
  (now with the toggle inline) rather than erroring or showing a stale
  canvas.
- **Direct navigation to `/profile/edit#layout-mode`** (old anchor, e.g. from
  a bookmark or cached link): the anchor target no longer exists on that
  page; this is an acceptable, silent no-op (page loads normally, just
  doesn't scroll to anything) — no redirect shim required.
- **User saves profile info from `/profile/edit`, arrives at their profile
  with `?saved=1`**: the confirmation is visibly dismissable/transient and
  does not persist across a subsequent unrelated page load.

## Definition of Done

- [ ] `/<username>` for the signed-in owner shows both "Edit Profile" and
      "Edit Layout" buttons/links, pointing at `/profile/edit` and
      `/profile/canvas` respectively.
- [ ] `/profile/edit` no longer renders a layout-mode toggle or an "Edit
      canvas layout" link.
- [ ] `/profile/canvas` renders the grid/canvas mode toggle; switching modes
      there works identically to the old toggle (same `canvas.setMode`
      call), verified by a test.
- [ ] Visiting `/profile/canvas` while in `GRID` mode shows the toggle
      inline instead of only a link back to `/profile/edit`.
- [ ] Saving `/profile/edit` successfully redirects to `/<username>` with a
      visible save confirmation, verified by a test.
- [ ] Saving `/profile/edit` with an invalid input still redirects to
      `/profile/edit?error=...` with the existing inline error shown,
      verified by a test (no regression).
- [ ] `npm run build` and `npm test` pass with no regression to existing
      profile-edit or canvas-editor tests.
