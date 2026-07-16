# Login Rate Limiting — Spec

## Objective
Provenance's `/login` form (spec 02) is public even though accounts are
admin-provisioned and controlled-distribution — anyone can point a script at it
and grind through passwords for a known username. This spec adds throttling so
repeated failed logins for a username get locked out instead of allowed to
retry indefinitely. Success: a scripted brute-force against one username stops
making progress after a small number of attempts, while a real user who
mistypes their password a couple of times is unaffected.

## Requirements
Must-have:
1. Prisma model to track failed attempts per username (normalized lowercase,
   same normalization as `User.username`), e.g. `LoginAttempt`: username (unique
   key), failedCount, firstFailedAt, lockedUntil (nullable).
2. On each login attempt in the NextAuth `authorize()` callback
   (`src/server/auth/config.ts`):
   - If the username is currently locked (`lockedUntil` in the future), reject
     immediately without checking the password.
   - If the password is wrong (or the username doesn't exist), increment the
     failed counter for that username. Track nonexistent usernames the same way
     real ones are tracked, so lockout behavior doesn't reveal which usernames
     are real.
   - After **10 failed attempts within a 15-minute window**, set `lockedUntil`
     to 15 minutes from the triggering attempt.
   - On a successful login, delete/reset that username's row.
3. Every rejection (wrong password, wrong username, or locked-out) returns the
   same generic "invalid credentials" result from `authorize()` — no distinct
   error message or status for "locked" vs. "wrong password" (matches the
   existing no-enumeration behavior from spec 02).
4. The threshold (10) and window/lockout duration (15 min) are named constants
   in one place, not magic numbers scattered across the file.

Deferred: per-IP throttling (Vercel's proxy headers aren't trustworthy without
more setup — out of scope), CAPTCHA, admin-visible unlock UI (an admin can
clear a lock by deleting the `LoginAttempt` row directly via `prisma studio`
for now), configurable threshold via env var.

## Constraints
- No new runtime dependency — use the existing Prisma/Postgres connection
  (`db`) already available in `authorize()`.
- `ponytail:` this is a single global per-username counter, not a distributed
  rate limiter — fine at Provenance's current scale (small, hand-matched user
  base); revisit if attempts start racing across concurrent serverless
  invocations in a way that matters.
- Must not weaken or bypass the existing password check — lockout is an
  additional gate, not a replacement.

## Edge Cases
- 9 failed attempts then a correct password → login succeeds, counter clears.
- 10th failed attempt → locked; the 11th attempt with the *correct* password
  is still rejected until `lockedUntil` passes.
- Failed attempts against a username that has never existed → still
  throttled/lockable the same way as a real username.
- `lockedUntil` in the past (lock expired) → treated as unlocked; a new
  failure starts a fresh window.
- Two failed attempts arriving concurrently → acceptable if the count is
  occasionally off by one (see `ponytail:` note above); it must never let the
  system silently skip incrementing entirely.

## Definition of Done
- [ ] `prisma/schema.prisma` has the `LoginAttempt` model; `prisma db push`
      applies it cleanly to the dev database.
- [ ] Vitest tests cover: attempts under threshold still allow a correct
      password to succeed; hitting the threshold blocks a subsequently-correct
      password; a successful login resets the counter; a nonexistent username
      is throttled the same way as a real one.
- [ ] Manually attempting 11 wrong passwords in a row against a real test user
      via `/login` locks the account; the correct password is rejected with
      the same generic error until the lock window passes.
- [ ] `npm test` and `npm run build` pass clean.
- [ ] README documents the threshold/window and how an admin clears a lock
      (delete the `LoginAttempt` row).
