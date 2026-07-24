# Data Durability and Email Delivery — Spec

## Objective

Two silent gaps currently exist between "the code works" and "this is an
operating product": Supabase is on the free tier with no automatic backups
or point-in-time recovery, and `RESEND_API_KEY` / `EMAIL_FROM` are unset in
every environment, so password-reset and signup-verification emails are
never actually sent — the flows appear to succeed but the user never
receives anything.

This spec closes the email gap in code (fail loudly instead of silently) and
closes the backup gap via a documented operational prerequisite, plus gives
admins a way to manually unstick an account that got stuck because email
wasn't configured when it signed up.

## Requirements

1. **Backups (documentation only, no code):** `docs/runbook.md` gets a
   clearly-flagged prerequisite section stating that Supabase must be
   upgraded to a tier with automatic backups/PITR before onboarding real
   users, with a link to Supabase's backup documentation and the specific
   plan tier required.
2. **Email send failure surfaces to the caller.** `requestPasswordReset` and
   `requestEmailVerification` (in `src/server/password-recovery.ts`) currently
   assume email sending is best-effort. Update them so that when the email
   provider is not configured (`RESEND_API_KEY` or `EMAIL_FROM` missing) or
   the send call itself fails, the function throws/returns a distinct error
   rather than resolving as if the email went out.
3. **tRPC procedures propagate the error.** The `users.ts` procedures that
   call these functions (password-reset request, verification request)
   catch this specific error and return a clear tRPC error (e.g.
   `INTERNAL_SERVER_ERROR` or a dedicated code) with a user-facing message
   such as "We couldn't send that email right now — try again shortly or
   contact support."
4. **Signup is not blocked by email misconfiguration.** Account creation via
   `createUser` still succeeds even if the subsequent verification email
   fails to send. The signup response/UI surfaces a distinct error state:
   "Your account was created, but we couldn't send a verification email."
   The account is left unverified, same as today.
5. **Admin recovery actions**, added to the existing `adminProcedure` set in
   `usersRouter` (alongside `list`, `ban`):
   - `verifyEmail`: marks a target user's email as verified, bypassing the
     token flow, for use when a user is stuck unverified due to email
     delivery failure.
   - `forcePasswordReset`: generates a password-reset token for a target
     user and returns/logs it (or triggers a fresh send attempt) so support
     can relay it out-of-band if email is still down.
   Both require `Role.ADMIN`, are audit-logged the same way `ban` is, and
   reject invalid/nonexistent target user ids with `NOT_FOUND`.

### Explicitly deferred (not in this spec)

- Any in-app database backup/export mechanism (e.g. scheduled `pg_dump`) as
  a stopgap while on the free tier — upgrading the Supabase plan is the only
  fix specified.
- Self-service resend of verification/reset emails by the end user.
- Actually purchasing/upgrading the Supabase plan (this spec only documents
  that it's required).

## Constraints

- Must use the existing Resend integration and `password-recovery.ts`
  module; no new email provider.
- Must not change the token format/expiry already used for password reset
  and email verification.
- Admin mutations must follow the existing `adminProcedure` + audit-logging
  pattern already used by `ban` in `users.ts` — no new authorization scheme.
- No change to the public signup contract's success shape beyond adding the
  distinct "email failed to send" error path.

## Edge Cases

- **`RESEND_API_KEY`/`EMAIL_FROM` unset entirely:** every send attempt fails
  immediately without a network call; error surfaces the same as a runtime
  send failure.
- **Resend API call fails (network/4xx/5xx) with keys configured:** same
  user-facing error path as the unconfigured case.
- **User requests password reset repeatedly while email is down:** existing
  rate limiting on this flow still applies; each attempt still fails loudly
  rather than appearing to succeed.
- **Admin calls `verifyEmail` on an already-verified user:** succeeds as a
  no-op, does not error.
- **Admin calls `forcePasswordReset` on a banned user:** allowed — support
  may need to reset a banned user's password for account recovery even if
  sign-in is otherwise blocked; this does not unban the account.
- **Non-admin calls either new mutation:** rejected with `FORBIDDEN` via the
  existing `adminProcedure` guard.

## Definition of Done

- [ ] `docs/runbook.md` has a prerequisite section documenting the required
      Supabase backup/PITR tier upgrade, linked to Supabase's docs.
- [ ] `requestPasswordReset` and `requestEmailVerification` throw/return a
      distinct, identifiable error when email is unconfigured or the send
      fails, instead of resolving successfully.
- [ ] The corresponding tRPC procedures return a clear, user-facing error
      message on that failure instead of a generic success or an unrelated
      500.
- [ ] Signup still creates the account when the verification email fails to
      send, and the client-visible response distinguishes "account created,
      email failed" from "account created, email sent."
- [ ] `usersRouter` has `verifyEmail` and `forcePasswordReset` admin
      mutations, both gated by `Role.ADMIN`, both audit-logged, both tested
      for: success, non-admin rejection, and nonexistent target user.
- [ ] Tests cover: password reset request with email unconfigured → error
      surfaced to caller; signup with email unconfigured → account created +
      distinct error; admin `verifyEmail` on already-verified user → no-op
      success.
