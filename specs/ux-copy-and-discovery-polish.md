# UX Copy and Discovery Polish — Spec

## Objective

Smaller findings from the UX audit that don't need their own feature area but
still lean on technical vocabulary or leave users guessing: the "Layout mode"
label speaks in the system's own terms rather than the user's, the Discover
page's hashtag filter offers no way to see what hashtags actually exist before
typing one, and the signup password field gives no feedback on its minimum
length until after a failed submit.

## Requirements

1. Rename the "Layout mode" fieldset legend and its helper copy in
   `src/app/(protected)/profile/edit/profile-form.tsx` to clearer,
   user-facing language (e.g. "How your profile is arranged") without
   changing the underlying two-option choice or its `GRID`/`CANVAS` values.
   The "Grid"/"Canvas" option labels may be renamed too if a clearer pair is
   identified, as long as it remains a two-option, mutually exclusive choice
   mapped to the same enum values. Apply the copy change everywhere the term
   appears in user-facing text (this fieldset; check for any other
   occurrence, e.g. the canvas editor's own "This profile is using the grid
   layout" message).
2. The Discover page (`src/app/page.tsx`) shows a row of existing hashtags as
   clickable chips near the hashtag filter input, so a user can pick from
   what's actually in use instead of guessing free text. Chips are ordered by
   usage frequency (most-used first) across public, non-banned projects.
   Clicking a chip filters the same way typing it into the hashtag field and
   submitting already does.
3. The signup password field (`src/app/signup/page.tsx`) shows a live
   indicator of the 8-character minimum as the user types (e.g. "8 characters
   minimum" that visually confirms once satisfied), instead of relying solely
   on the native browser validation message after submit attempt.

## Constraints

- Build on the existing stack: Next.js 15 (App Router), React 19, tRPC,
  Prisma with Supabase Postgres, Tailwind CSS v4.
- Hashtag chips reuse the existing `Project.hashtags` data as-is; no new
  tagging table, taxonomy, or admin curation — a simple frequency count over
  existing data is sufficient.
- No change to how hashtags are stored, normalized, or filtered
  (`discoverProjects` in `src/server/projects.ts`) — only how they're
  surfaced for discovery on the page.
- Copy changes must not change the underlying `LayoutMode`/`GRID`/`CANVAS`
  enum values, tRPC procedure names, or API contracts — this is a display
  label change only.
- Password strength indicator is a client-side length check only — no change
  to the actual password validation/hashing on the server.

## Edge Cases

- **No projects have hashtags yet**: the hashtag chip row doesn't render, or
  shows a brief "no tags yet" note; the free-text hashtag filter input still
  works as it does today.
- **A hashtag used only once vs. many times**: chips favor more commonly used
  tags first; a simple count is sufficient, no special-casing needed for
  ties.
- **Password field pre-filled by browser autofill on page load**: the
  minimum-length indicator reflects the filled value immediately, not only
  after a keystroke.
- **A user clicks a hashtag chip while other filters (category) are already
  applied**: combines with the existing category filter the same way manually
  typing a hashtag and submitting does today (no special interaction rule
  needed beyond matching current filter-combination behavior).

## Definition of Done

- [ ] "Layout mode" and related copy on `/profile/edit` uses clearer,
      non-jargon language without changing the underlying `GRID`/`CANVAS`
      values or any other page's reference to the same concept.
- [ ] Discover page shows existing hashtags as clickable filter chips,
      ordered by usage frequency, verified by a test with a mixed-frequency
      fixture.
- [ ] Clicking a hashtag chip filters projects the same way the existing
      text-input filter does.
- [ ] Signup password field shows a live minimum-length indicator that
      updates as the user types and reflects a pre-filled value on load.
- [ ] `npm run build` and `npm test` pass with no regressions.
