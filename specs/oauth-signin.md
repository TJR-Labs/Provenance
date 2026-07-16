# OAuth Sign-In — Spec

## Objective
Add Google and GitHub as sign-in/sign-up methods alongside the existing
username/password flow, so new users can join with one click instead of
picking a password, and existing users get a second way in. Success: a new
visitor can create a Provenance account via Google or GitHub in under a
minute (choosing only a username), and an existing credentials user can sign
in with the same provider account without ending up with a duplicate profile.

## Requirements

Must-have:
1. Add NextAuth's built-in `Google` and `GitHub` providers to
   `src/server/auth/config.ts`. No new dependency — both ship in `next-auth`.
   New env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, documented in `.env.example`
   and the README (including the redirect URI to register with each
   provider: `/api/auth/callback/google` and `/api/auth/callback/github`).
2. Prisma schema changes:
   - `User.passwordHash` becomes nullable (OAuth-only accounts have none).
   - Add `User.email String? @unique`.
   - Add an `Account` model storing provider links: `id`, `userId` (→ `User`),
     `provider` (`"google" | "github"`), `providerAccountId`, unique on
     (`provider`, `providerAccountId`). One `User` can have zero, one, or
     both providers linked, plus optionally a password.
   - Migration for existing rows: `email` starts `null` for all current
     users; `passwordHash` keeps its existing value.
3. Sign-in resolution logic (in the NextAuth `signIn`/`jwt` callback path):
   - If `providerAccountId` already exists in `Account`, sign into that
     linked user directly.
   - Else, if the provider reports the email as **verified** and it matches
     an existing `User.email`, create the `Account` link to that user and
     sign in (auto-link).
   - Else, treat as a new signup: do not create a `User` row yet. Hold the
     pending OAuth profile (provider, providerAccountId, email, name) in a
     short-lived server-side pending-signup record (e.g. a signed token or a
     temporary DB row with an expiry, not a client-trusted cookie) and
     redirect to a username-picker page.
4. Username-picker page (e.g. `/signup/username`): shown only for a pending
   OAuth signup. User submits a username; on submit, validate uniqueness,
   create the `User` row (email from the provider if verified, no
   passwordHash) and the `Account` link, then sign in and redirect home.
   Abandoning this step leaves no `User` row behind.
5. `/login` and `/signup` both show "Continue with Google" / "Continue with
   GitHub" buttons, doing the same thing on either page (per requirement 3).
6. Banned users (`User.banned`) are blocked from OAuth sign-in the same way
   they're blocked from credentials login today.
7. `/account` gets a "Connected accounts" section:
   - Shows which of Google/GitHub are linked, with a Link/Unlink action for
     each.
   - Linking while signed in: standard OAuth redirect, then attach the
     `Account` to the current session's user (reject if that
     `providerAccountId` is already linked to a *different* user).
   - Unlinking is blocked if it would leave the account with **no password
     and no remaining linked provider** (would lock the user out).
8. `/account` gets a "Set password" action for accounts with no
   `passwordHash` (OAuth-only), reusing the existing bcrypt hashing
   (cost ≥ 12) from the credentials flow. Once set, the existing
   change-password flow applies normally.
9. Vitest tests: auto-link only fires on verified email; unverified email
   does not link and instead goes to the username-picker path; duplicate
   `providerAccountId` linking to a second user is rejected; unlink blocked
   when it's the last sign-in method; unlink allowed when a password exists.

Deferred: linking more than one Google or GitHub account per provider type,
other OAuth providers, email/password recovery via OAuth, showing OAuth
profile pictures as the avatar (avatar upload is unchanged), 2FA.

## Constraints
- Same stack as the rest of the app: NextAuth (`next-auth` beta), Prisma,
  Supabase Postgres. No new dependencies — Google/GitHub providers are
  built into `next-auth`.
- Provider secrets (`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET`) are
  server-only env vars, never sent to the client, never logged.
- The pending-signup hold between OAuth redirect and username submission
  must not let a client forge an arbitrary email/provider identity — it has
  to be produced server-side from the verified OAuth callback, short-lived,
  and single-use.
- Existing login rate-limiting (`LoginAttempt` lockout) is unaffected; it
  stays scoped to credentials login only since OAuth has no password to
  brute-force.
- All authorization/role/ban checks continue to run server-side regardless
  of which sign-in method was used.

## Edge Cases
- **Unverified GitHub email matches an existing account**: do not auto-link;
  route to the username-picker as a new signup instead (prevents account
  takeover via an unverified email claim).
- **Two different OAuth providers, same verified email, no existing
  account**: first one to sign in creates the `User` (via the username
  picker); the second, later, auto-links to that same user (per requirement
  3) rather than creating a duplicate.
- **User abandons the username-picker step**: no `User` or `Account` row is
  created; a retried sign-in starts fresh.
- **Chosen username collides with an existing one**: inline error on the
  picker, same case-insensitive uniqueness rule as credentials signup; no
  account created.
- **Unlink the only linked provider, no password set**: rejected with a
  clear error telling the user to set a password first.
- **Linking a Google/GitHub account already linked to a different existing
  user**: rejected with a clear error; no account merging happens
  automatically.
- **Banned user attempts OAuth sign-in**: rejected the same way a banned
  user is rejected at credentials login today.
- **Provider returns no email at all** (can happen with some GitHub privacy
  settings): treated as a new signup via the username-picker; auto-link by
  email is simply skipped since there's nothing to match.

## Definition of Done
- [ ] `Account` model and nullable `User.passwordHash`/`User.email` are
      added via a Prisma migration; existing users are unaffected.
- [ ] A brand-new visitor can click "Continue with Google" (or GitHub),
      pick a unique username, and land signed in with a working profile.
- [ ] An existing credentials user whose provider email matches their
      verified `User.email` signs into their *existing* account via OAuth,
      not a new one.
- [ ] An OAuth signup attempt with an unverified matching email goes
      through the username-picker (new account), not auto-link.
- [ ] From `/account`, a signed-in user can link a second provider, unlink
      a provider (when allowed), and set a password when they have none.
- [ ] Unlinking the last sign-in method with no password set is rejected
      with a clear error.
- [ ] A banned user cannot sign in via Google or GitHub.
- [ ] `npm test` passes, including the new OAuth linking/unlinking tests;
      `npm run build` stays clean.
- [ ] README and `.env.example` document the four new env vars and the
      redirect URIs to register with Google Cloud Console and GitHub OAuth
      Apps.
