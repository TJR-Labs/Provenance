# Deploy Migrations — Spec

## Objective
Provenance has **no migration history** — `prisma/migrations/` doesn't exist;
every schema change so far has gone through `prisma db push`, which syncs the
schema directly with no record of *how* it changed and no safe way to apply
changes to production without wiping/guessing. The `db:migrate` script
(`prisma migrate deploy`) already exists in `package.json` but has nothing to
deploy and nothing triggers it. This spec establishes real migration history
and wires it into the Vercel deploy so schema changes ship automatically and
safely. Success: pushing a schema change to `main` applies it to production
via a tracked migration, with zero manual `db push` steps.

## Requirements
Must-have:
1. Baseline the current schema into migration history using Prisma's
   documented **baselining an existing database** procedure (not
   `prisma migrate dev`, which tries to apply/reset and — confirmed by
   running it — refuses with "We need to reset the public schema... All data
   will be lost" because migration history is empty while the database
   already has data). The safe procedure never runs SQL against the live
   database, it only records bookkeeping:
   1. `mkdir prisma/migrations/0_init`
   2. `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql`
      (pure diff generation, read-only, touches nothing live)
   3. `npx prisma migrate resolve --applied 0_init` (marks this migration as
      already applied in the database's `_prisma_migrations` tracking table
      — this writes one bookkeeping row, it does not run the migration SQL
      against the schema/data)
   Commit the generated `prisma/migrations/` directory.
2. Add a `vercel-build` script:
   `"vercel-build": "prisma migrate deploy && next build"`. Keep the existing
   `build` script (`next build`) unchanged so CI (spec 11), which has no live
   database, keeps working exactly as before.
3. Add `vercel.json` at the repo root with `"buildCommand": "npm run
   vercel-build"`, so the migrate-then-build step is committed and
   reproducible rather than living only in the Vercel dashboard's project
   settings.
4. `db:generate` (`prisma migrate dev`) stays the documented local workflow
   for *creating* new migrations during development; `db:push` remains
   available for quick local prototyping but is no longer how schema changes
   reach production.

Deferred: automatic rollback on failed migration (Vercel's build simply fails
if `migrate deploy` fails, which blocks the bad deploy — that's the safety net
for now), preview-environment database branching.

## Constraints
- Must not run any destructive operation against the existing Supabase
  database. Before running `prisma migrate dev --name init`, confirm current
  schema/data state and that Prisma reports no drift requiring a reset; if
  Prisma's shadow-database diff wants to reset/drop anything, stop and
  surface that instead of proceeding.
- No new dependency — `prisma migrate deploy` is already part of the
  installed `prisma` CLI.
- `vercel.json`'s build command must not affect local `npm run build` or the
  CI workflow from spec 11, both of which keep using the plain `build` script.

## Edge Cases
- Fresh clone with an already-up-to-date database (matches the baseline
  migration) → `prisma migrate deploy` reports "no pending migrations",
  `next build` proceeds normally.
- A future schema change made via `prisma migrate dev --name <change>` locally
  → committing the new migration folder is enough for the next Vercel deploy
  to apply it automatically.
- Someone runs `prisma db push` locally after this spec ships and drifts their
  local DB from migration history → documented in README as no longer the
  supported path; `prisma migrate dev` is.
- `prisma migrate deploy` fails on Vercel (e.g. bad migration SQL) → the
  Vercel build fails and the bad deploy never goes live, which is the desired
  fail-safe behavior (nothing further to build for this case).

## Definition of Done
- [ ] `prisma/migrations/` exists, contains an initial migration, and is
      committed (not gitignored).
- [ ] `npm run db:migrate` (`prisma migrate deploy`) run locally against the
      dev database reports the schema is already up to date (confirming the
      baseline captured it correctly with no drift).
- [ ] `vercel-build` script and `vercel.json` exist; `npm run vercel-build`
      run locally completes successfully.
- [ ] `npm run build` (the plain script CI uses) is unaffected — still just
      runs `next build`.
- [ ] README documents the new workflow: `prisma migrate dev --name <x>` to
      create a migration locally, commit it, and Vercel applies it
      automatically on deploy; `db push` is for local prototyping only.
