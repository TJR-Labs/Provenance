# Write-Path Hardening — Spec

## Objective

Three small, independent gaps exist in how Provenance's API layer handles
requests: authenticated write endpoints on the canvas/grid routers have no
rate limit, project-visibility authorization logic is reimplemented
separately in four files (the exact pattern that caused one already-fixed
data leak), and the rate limiter's client-IP resolution trusts a header by
convention rather than by verifying it's actually running behind Vercel. A
fourth item removes a dead health-check procedure that always reports
healthy.

None of these require new infrastructure — they apply or extend patterns
that already exist elsewhere in the codebase (`consumeRateLimit`, the
`private`/`isOwner` checks, the real `/api/health/ready` route).

## Requirements

1. **Rate limit canvas/grid mutations.** Apply the existing
   `consumeRateLimit` helper (from `src/server/rate-limit.ts`, already used
   in `users.ts` and `moderation.ts`) to the save/mutation procedures in
   `canvas.ts` and `grid.ts` (e.g. `grid.save`, `canvas.save`, and any other
   mutating procedures in these two routers). Limit: 60 requests per minute
   per authenticated user per procedure. Exceeding it returns the same
   `TOO_MANY_REQUESTS`-style error shape already used elsewhere.
2. **Centralize project-visibility authorization.** Add a single
   `canViewProject(project: { userId: string; private: boolean }, viewerId:
   string | null): boolean` helper (location: `src/server/projects.ts` or a
   new `src/server/authorization.ts`). Replace the independently-written
   private/owner checks currently in `profiles.ts`, `projects.ts`,
   `grid-layouts.ts`, and `canvas.ts` with calls to this helper. Behavior
   must be identical to today's (owner always sees it; non-owners see it iff
   `!private`).
3. **Harden client IP resolution.** In `resolveClientIp`
   (`src/server/rate-limit.ts`), only trust the last `x-forwarded-for` entry
   when the app is confirmed to be running on Vercel (`process.env.VERCEL
   === "1"`). Otherwise, fail closed to the strictest available fallback
   already present in the function (e.g. treating the request as
   unidentified/using the strictest bucket), rather than trusting the header.
4. **Remove the dead health-check procedure.** Delete `health.check` from
   `src/server/api/routers/health.ts` and its registration in the router
   tree. Confirm no client code calls `api.health.check`; update/remove any
   that does to use the existing `/api/health/ready` REST route instead.

## Constraints

- No new dependencies.
- No change to the public shape of `canViewProject`'s callers beyond
  swapping their internal check for the helper call — no behavior change
  for existing users.
- Rate limiting must use the existing `consumeRateLimit`/`resolveClientIp`
  infrastructure, not a new limiter.
- The IP-resolution change must not break existing rate limiting in
  production (where `VERCEL` is set) — this is a hardening change for
  non-Vercel environments, not a behavior change on Vercel.

## Edge Cases

- **User exceeds 60 saves/minute on `grid.save` legitimately (e.g. rapid
  undo/redo storm):** request is rejected with a rate-limit error; client
  should already handle this error shape from other rate-limited
  procedures.
- **`canViewProject` called with `viewerId: null` (anonymous visitor) on a
  private project:** returns `false`.
- **`canViewProject` called by the owner on their own private project:**
  returns `true`.
- **App running locally or on a non-Vercel host (`VERCEL` env unset):**
  `resolveClientIp` does not trust `x-forwarded-for`; rate limiting falls
  back to its strictest existing behavior rather than silently trusting
  attacker-controllable input.
- **Any remaining reference to `health.check` in tests or client code:**
  must be updated or removed as part of this change, not left broken.

## Definition of Done

- [ ] `grid.save`, `canvas.save`, and other mutating procedures in
      `canvas.ts`/`grid.ts` are rate-limited at 60/minute/user via
      `consumeRateLimit`, with a test confirming the 61st request in a
      window is rejected.
- [ ] A single `canViewProject` helper exists and is the only place this
      check is implemented; `profiles.ts`, `projects.ts`, `grid-layouts.ts`,
      and `canvas.ts` all call it instead of reimplementing the check.
      Existing regression tests for the grid-layout data leak still pass
      unchanged.
- [ ] `resolveClientIp` only trusts `x-forwarded-for` when
      `process.env.VERCEL === "1"`, with a test covering both branches.
- [ ] `health.check` no longer exists in the router tree; no remaining code
      references it; `npm run typecheck` and `npm test` pass.
- [ ] `npm test` and `npm run typecheck` pass with all changes applied.
