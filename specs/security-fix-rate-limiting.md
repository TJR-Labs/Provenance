# Add Rate Limiting to Signup, Password Change, and Reports — Spec

## Objective
Credentials login has a per-username lockout (`LoginAttempt`, 10 failures /
15 minutes — see `src/server/auth/config.ts`), but it's the only
rate-limited path in the app. `users.signup` (public, unauthenticated),
`users.changePassword` (session required, but no cap on `currentPassword`
guesses), and `moderation.report` (session required, unlimited) have no
throttling at all. This allows scripted mass account creation, moderation
report spam against a target, and unlimited password-guessing attempts by
anyone holding a live session. Add rate limiting to these three paths,
following the existing `LoginAttempt`-table pattern already established in
this codebase rather than introducing a new limiting mechanism. Full detail
in `SECURITY_AUDIT.md` finding #4.

## Requirements
1. Add a reusable rate-limiting mechanism backed by Postgres (via Prisma), consistent with the existing `LoginAttempt` model's approach (a table keyed by an identifier + a rolling window + a lockout timestamp), rather than adding an external dependency (e.g. Redis) for this.
2. Apply it to `users.signup` (`src/server/api/routers/users.ts`): limit signups per source IP address to a reasonable threshold (e.g. 5 per 15 minutes — match the order of magnitude of the existing login lockout; exact numbers can be tuned, but must be a finite, enforced cap, not unlimited).
3. Apply it to `moderation.report` (`src/server/api/routers/moderation.ts`): limit reports per user id to a reasonable threshold (e.g. 10 per hour).
4. Apply it to `users.changePassword`'s `currentPassword` check (`src/server/users.ts`'s `changePassword` function): lock out further attempts for a user id after a threshold of consecutive wrong-current-password attempts within a window (mirroring the existing credentials-login lockout: 10 failures / 15 minutes), resetting on a successful change.
5. All three limits must fail closed with a clear, existing-style error (a `TRPCError` with an appropriate code — `TOO_MANY_REQUESTS` if supported by the installed tRPC version, otherwise `BAD_REQUEST` with a clear message) rather than silently dropping the request or throwing an unhandled exception.
6. Getting the source IP for the signup limiter must use whatever request-header/context plumbing is standard for this deployment target (check how `createTRPCContext`/the Next.js request object exposes the client IP in this app's hosting setup, e.g. `x-forwarded-for` behind Vercel) — do not invent a new context field without checking how headers currently flow into `createTRPCContext` (`src/server/api/trpc.ts`).

## Constraints
- No new external dependencies (no Redis, no third-party rate-limit service). Reuse Prisma/Postgres, matching the existing `LoginAttempt` pattern.
- Do not change the public behavior/response shape of `users.signup`, `users.changePassword`, or `moderation.report` for requests that stay under the limit.
- Do not weaken the existing credentials-login lockout while adding the new one for `changePassword`.
- Migration(s) needed for any new Prisma model(s) must follow this repo's existing migration conventions (see `prisma/migrations/`), with a clear descriptive name.

## Edge Cases
- Legitimate user retries after a typo (e.g. wrong current password once, then correct) must not be blocked — the cap is on *consecutive failures within the window*, matching the existing login-lockout semantics.
- Signup rate limiting must not be so aggressive that it blocks multiple legitimate users signing up from behind the same NAT/shared IP (office, university, campus Wi-Fi) — pick a threshold generous enough to avoid common false positives (the existing spec's suggested "5 per 15 minutes" is a floor to tune, not a hard requirement, but it must not be 1).
- If the IP header is missing/unparseable (e.g. local dev, direct connection without a proxy), the limiter must degrade safely (e.g. treat as a single bucket or skip limiting in that case) rather than throwing an unrelated error that breaks signup entirely.
- Concurrent requests right at the threshold boundary must not allow unbounded overshoot due to a race condition (use an atomic increment/upsert pattern, as the existing `LoginAttempt.upsert` does).

## Definition of Done
- [ ] A reusable Postgres-backed rate-limiting mechanism exists, modeled on the existing `LoginAttempt` pattern.
- [ ] `users.signup` rejects further attempts from the same source IP after the configured threshold within the window, with a clear error.
- [ ] `moderation.report` rejects further reports from the same user id after the configured threshold within the window, with a clear error.
- [ ] `users.changePassword` locks out further `currentPassword` attempts for a user id after repeated failures within a window, resetting on success, mirroring the existing login lockout.
- [ ] Tests cover: under-threshold requests succeed, at/over-threshold requests are rejected, and the window/lockout resets correctly after it expires or after a success (as applicable).
- [ ] `SECURITY_AUDIT.md` finding #4 can be marked resolved.
