# CI Pipeline — Spec

## Objective
`lint`, `typecheck`, and `test` npm scripts already exist but nothing runs
them automatically — a broken build can be pushed straight to `main` today.
This spec adds GitHub Actions CI (the repo's remote is
`github.com/RyanVu612/Provenance`) that runs on every push and pull request.
Success: a PR with a lint error, type error, failing test, or broken build
shows a failing check before it can be merged.

## Requirements
Must-have:
1. `.github/workflows/ci.yml`: triggers on `push` to `main` and
   `pull_request` targeting `main`.
2. Single job: checkout → `actions/setup-node@v4` with Node 20 (matches the
   README's documented Node requirement) and npm cache enabled → `npm ci` →
   `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`.
3. `npm ci`'s `postinstall` runs `prisma generate`, which only needs a
   schema-valid `DATABASE_URL`/`DIRECT_URL` (no live connection) — set dummy
   but URL-shaped values (e.g. `postgresql://ci:ci@localhost:5432/ci`) plus a
   dummy `AUTH_SECRET` as workflow-level `env`, since `next build` runs with
   `NODE_ENV=production` and `env.js` requires `AUTH_SECRET` in production.
   Confirmed no step needs a real database: Vitest tests mock `db` and `auth`
   directly (`vi.mock("~/server/db", ...)`), and no page executes a DB query
   at build time today.
4. All four check steps (`lint`, `typecheck`, `test`, `build`) must run even
   if an earlier one fails is **not** required — failing fast is fine and
   matches how these scripts already behave locally.

Deferred: deployment automation from CI (Vercel's own GitHub integration
already auto-deploys on push independent of this workflow — see spec 12 for
making that deploy migration-safe), test coverage reporting, matrix testing
across multiple Node versions.

## Constraints
- GitHub Actions only — no third-party CI service.
- Must not require any real secrets (Supabase credentials, `AUTH_SECRET`) to
  be added to the repo; dummy values are sufficient given requirement 3.
- Workflow must reflect the exact scripts already in `package.json` — don't
  invent new script names.

## Edge Cases
- A PR that only touches `specs/*.md` still runs the full workflow (no path
  filtering) — acceptable; these are fast checks.
- If `prisma generate` in `postinstall` ever needs a schema change validated
  against a real DB (it doesn't today — it only reads `schema.prisma`), that
  would break CI; not expected to happen based on current usage.
- A future page that queries the DB at build time (static generation) would
  break the dummy-DB build step — out of scope to guard against now, note it
  as a known limitation.

## Definition of Done
- [ ] `.github/workflows/ci.yml` exists and is syntactically valid.
- [ ] Pushing a branch with a deliberate lint error, type error, and failing
      test (verification step, each tried and reverted) produces a failing
      GitHub Actions run for each case.
- [ ] A clean push/PR produces a fully green run covering lint, typecheck,
      test, and build.
- [ ] README notes that CI runs automatically on push/PR and lists the checks.
