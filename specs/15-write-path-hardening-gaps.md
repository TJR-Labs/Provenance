# Write-Path Hardening Gaps — Spec

## Objective

A follow-up backend audit (post spec 14, post `58f0452` write-path hardening)
found the overall backend to be in good shape — auth/authorization, upload
lifecycle, pagination, health checks, env validation, and migration gating
all held up under review. Four concrete gaps remain before shipping:

- two write paths that cost real storage/DB resources are not rate-limited,
  unlike every structurally similar mutation in the codebase;
- the trusted-IP resolver has a fallback branch that lets a client choose its
  own rate-limit bucket;
- two high-impact admin mutations are not recorded in the admin audit trail
  that sibling mutations already use; and
- an admin-issued password-reset token is returned in a mutation response as
  its only delivery path when email fails.

## Confirmed Baseline

- `src/app/api/upload/intent/route.ts` and
  `src/app/api/upload/finalize/route.ts` call `auth()` but never
  `consumeRateLimit`, `assertNotLockedOut`, or any other limiter.
- `src/server/api/routers/project.ts` (`create`, `update`, `delete`) never
  calls `consumeRateLimit`, while the structurally equivalent mutations in
  `grid.ts` and `canvas.ts` all do.
- `src/server/rate-limit.ts` `resolveClientIp` falls back to the
  client-controllable `x-real-ip` header whenever `x-forwarded-for` is
  missing or `VERCEL !== "1"`, even though Vercel never sets `x-real-ip`.
- `src/server/api/routers/users.ts` `ban` and
  `src/server/api/routers/moderation.ts` `removeProject` are `adminProcedure`
  mutations that do not call `logAdminAction`, while `verifyEmail` and
  `forcePasswordReset` in the same file do.
- `src/server/password-recovery.ts` `adminForcePasswordReset` returns
  `{ emailSent: false, token }` to the calling admin client when email
  delivery fails, as the only way to relay the reset link.

## Requirements

### 1. Rate-limit remaining write paths

1. Add a `consumeRateLimit` call to `POST /api/upload/intent`, keyed by
   authenticated user id, scoped separately from the existing per-user upload
   quota in `upload-intents.ts` (this is abuse throttling, not the quota
   check).
2. Add a `consumeRateLimit` call to `POST /api/upload/finalize`, keyed by
   authenticated user id.
3. Add `consumeRateLimit` to `project.create`, `project.update`, and
   `project.delete` in `src/server/api/routers/project.ts`, keyed by
   authenticated user id, using limits consistent with the existing
   `grid.ts`/`canvas.ts` write-path limits.

### 2. Remove the spoofable IP fallback

1. In `resolveClientIp`, only trust `x-real-ip` when the request is not
   running on Vercel (local/dev). When `VERCEL === "1"` and
   `x-forwarded-for` is missing or empty, fall back directly to the shared
   `"unknown"` bucket rather than reading `x-real-ip`.
2. Add or update a unit test asserting that on `VERCEL === "1"` a
   client-supplied `x-real-ip` header with no `x-forwarded-for` present
   resolves to `"unknown"`, not the header value.

### 3. Complete the admin audit trail

1. Add a `logAdminAction` call to `users.ban` recording the admin id, target
   user id, and action `"ban"`, matching the pattern in `verifyEmail` and
   `forcePasswordReset`.
2. Add a `logAdminAction` call to `moderation.removeProject` recording the
   admin id, the reported project's owner id (or project id if owner lookup
   is not already available at that point), and action `"removeProject"`.

### 4. Document the admin reset-token fallback as an accepted risk

1. Add a code comment at the `token: emailSent ? null : token` return in
   `adminForcePasswordReset` stating this is a deliberate fallback for a
   trusted, audited, small admin pool and that the token must never be
   logged, pasted into tickets/chat tools with retention, or captured by
   client-side error reporting.
2. No behavior change required unless the team decides otherwise.

## Constraints

- Do not change the shape of any existing successful API response.
- Reuse existing `consumeRateLimit`/`RateLimitConfig` and `logAdminAction`
  helpers; do not introduce a new rate-limiting or audit-logging mechanism.
- Preserve current upload and project mutation behavior for callers under
  the new limits.

## Edge Cases

- A user rapidly retries a legitimate large-video upload after a transient
  network failure: the new upload rate limit must not lock them out before
  the existing per-hour upload-intent quota would.
- A non-Vercel local dev request with only `x-real-ip` set continues to
  resolve an IP for local rate-limit testing.
- An admin bans a user and then the same user is unbanned/reinstated: both
  actions appear in the audit trail with distinct entries.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
```

Additional manual checks:

- Exceed the new upload intent/finalize rate limit in a test and confirm
  `TOO_MANY_REQUESTS`.
- Exceed the new `project` mutation rate limit in a test and confirm
  `TOO_MANY_REQUESTS`.
- Call `resolveClientIp` with `VERCEL="1"`, no `x-forwarded-for`, and a set
  `x-real-ip`; confirm it returns `"unknown"`.
- Call `users.ban` and `moderation.removeProject` as an admin and confirm a
  row is written to `AdminActionAudit` for each.
