# Accounts & Auth — Spec

## Objective
Controlled-distribution accounts for the three actors in Provenance: admins (the
founding team), companies (post briefs, scout), and engineers (submit work). Per
the one-pager the GTM is hand-matched and high-touch, so there is **no self-signup**:
admins create every account manually so access can be monitored. Success: an admin
can provision accounts, users can log in/out securely, and every later feature can
guard pages and tRPC procedures by role.

## Requirements
Must-have:
1. Prisma `User` model: id, username (unique; stored lowercase, uniqueness is
   case-insensitive), passwordHash (bcryptjs, cost ≥ 12), role enum
   (`ADMIN` | `COMPANY` | `ENGINEER`), displayName, companyName (nullable, set
   for companies), createdAt. Replace/extend the scaffold's NextAuth models as
   needed for credentials auth.
2. NextAuth **Credentials provider**: username + password, JWT session strategy,
   session exposes `user.id` and `user.role`. Login page at `/login`; logout
   action in the nav. Nav shows the signed-in user's displayName and role.
3. Seed script (`prisma/seed.ts`, wired to `npx prisma db seed`): if no users
   exist, create user `admin` (role ADMIN) with password from `ADMIN_PASSWORD`
   env var, or a random password printed once to the console if unset.
4. `/admin/users` (ADMIN only): lists all users (username, role, display name,
   created date) and a create-user form: username, display name, role,
   companyName (required iff role COMPANY), initial password. Passwords are
   handed to users out-of-band. No self-signup route exists anywhere.
5. Authorization layers:
   - tRPC: `protectedProcedure` plus role-scoped procedures (`adminProcedure`,
     `companyProcedure`, `engineerProcedure`) that throw `FORBIDDEN` on wrong
     role and `UNAUTHORIZED` when signed out.
   - Pages: signed-out users hitting a protected page are redirected to
     `/login`; wrong-role users get a 403 page. Home and `/login` are the only
     public pages.
6. `/account` (any signed-in user): change own password (requires current
   password; verify before updating).
7. Vitest tests: bcrypt hash/verify round-trip and wrong-password rejection;
   duplicate-username creation rejected; role-guard logic (admin procedure
   rejects COMPANY/ENGINEER sessions and anonymous callers).

Deferred: password reset flows, account disabling/deletion, email, OAuth
providers, "remember me" behavior beyond NextAuth defaults.

## Constraints
- Same stack constraints as foundation. New dependencies allowed: `bcryptjs`
  (pure JS — no native build steps on Windows) and `tsx` (dev-only, to run the
  TypeScript seed script).
- Passwords never stored or logged in plaintext (the one-time seeded admin
  password printed at first seed is the only exception).
- Session cookies stay HttpOnly (NextAuth default); auth endpoints keep
  NextAuth's built-in CSRF protection.
- All credential checks happen server-side (tRPC/NextAuth); no client-side
  role trust.

## Edge Cases
- Duplicate username (any case) on create → form error, no user created.
- Wrong username or password at login → same generic error message (no user
  enumeration).
- Company role created without companyName → validation error.
- Change-password with wrong current password → error, password unchanged.
- Signed-out user calling a protected tRPC procedure directly → UNAUTHORIZED,
  not a crash.
- Session for a since-deleted user id → treated as signed out, no crash.

## Definition of Done
- [ ] `npx prisma db seed` on an empty DB creates `admin` and prints its
      password once; `admin` can log in with it.
- [ ] Admin can create a COMPANY and an ENGINEER user via `/admin/users`, and
      both can log in.
- [ ] A non-admin visiting `/admin/users` gets the 403 page; a signed-out
      visitor is redirected to `/login`.
- [ ] Logout works; protected pages redirect to `/login` afterward.
- [ ] A user can change their own password and log in with the new one.
- [ ] `npm test` passes, including the new auth tests; `npm run build` stays clean.
- [ ] README documents seeding, the admin flow, and how accounts are provisioned.
