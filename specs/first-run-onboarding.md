# First-Run Onboarding — Spec

## Objective

The UX audit found two related drop-off points right at the start of a new
user's experience: signing up (`src/app/signup/page.tsx`) redirects to
`/login?created=1` instead of signing the user in directly, forcing them to
retype the password they just chose; and after finally logging in, a new
account lands on the public Discover feed (`/`) with no guidance toward
adding a bio, creating a first project, or picking a layout.

This spec establishes a session on signup and gives every new account a short,
self-dismissing checklist toward the profile actions that actually make their
portfolio worth visiting.

## Requirements

1. On successful signup, establish the user's session directly using the same
   underlying session mechanism the existing password-login flow already uses
   (NextAuth), instead of redirecting to `/login?created=1`. The signup server
   action (`src/app/signup/page.tsx`) signs the user in immediately after
   `users.signup` succeeds.
2. After signup, redirect the now-signed-in user to their own profile page
   (`/[username]`), not to Discover.
3. A dismissible first-run checklist appears on the signed-in user's own
   profile page (or a lightweight equivalent surfaced there) listing: add a
   bio, add a first project, and choose a layout mode — each item links
   directly to the page where it's done (`/profile/edit`, `/projects/new`,
   `/profile/edit`'s layout-mode section).
4. Checklist item completion is derived from existing data, not a separate
   "onboarding progress" flag: bio is complete when `User.bio` is non-empty,
   first project is complete when the user has at least one `Project` row,
   layout mode is complete when the user has explicitly changed it from the
   default (or is simply considered complete once visited — build-phase
   decision, but must not require new persisted "did they see this" state
   beyond what's needed for dismissal).
5. The checklist auto-hides once all items are complete, and is also
   manually dismissible before that; a dismissal is remembered (server-side)
   and the checklist does not reappear on a later login.

## Constraints

- Build on the existing stack: Next.js 15 (App Router), React 19, tRPC,
  Prisma with Supabase Postgres, NextAuth.
- Must not weaken any existing auth/session guarantees — reuse NextAuth's
  existing credentials sign-in path for establishing the session post-signup,
  rather than hand-rolling session/cookie handling.
- OAuth signup (Google/GitHub, `src/app/oauth-buttons.tsx` and related) already
  establishes a session directly today and needs no change to its sign-in
  mechanics — but the first-run checklist must apply equally to OAuth-created
  accounts, since they're just as new.
- Signup validation failures (username taken, weak password, etc.) are
  unchanged: still redirect to `/signup?error=...` with no session created.
- The "dismissed" flag is a small piece of new persisted state on `User`
  (exact field is a build-phase decision).

## Edge Cases

- **Signup fails validation**: unchanged behavior — no session, redirect back
  to `/signup?error=...`.
- **A user signs up via OAuth**: already signed in today; still sees the
  first-run checklist on their first visit to their own profile, same as a
  password-signup user.
- **A user dismisses the checklist manually before completing any items**: it
  does not reappear on a later login, even though items remain incomplete.
- **A returning (pre-existing) user who predates this spec**: does not
  retroactively see the checklist — it is scoped to first-run only, not
  "anyone with an incomplete profile." (Build-phase decision on exact cutoff,
  e.g. based on account creation date or an explicit backfilled
  already-dismissed flag for existing accounts.)
- **A user completes all three checklist items without ever manually
  dismissing it**: checklist disappears automatically once all conditions are
  met, no explicit action required.

## Definition of Done

- [ ] Successful signup establishes a session; the user is not redirected to
      `/login` and does not need to re-enter credentials.
- [ ] Post-signup, the user lands on their own profile page.
- [ ] A first-run checklist (bio, first project, layout mode) appears with
      working links to each destination.
- [ ] The checklist auto-hides once all three conditions are met.
- [ ] Manually dismissing the checklist persists and it does not reappear on
      a later login.
- [ ] OAuth signup continues to work unchanged and also sees the checklist on
      first login.
- [ ] Existing accounts created before this spec do not retroactively see the
      checklist.
- [ ] `npm run build` and `npm test` pass with no regression to existing
      signup/auth tests.
