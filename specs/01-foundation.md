# Foundation — Spec

## Objective
Bootstrap the Provenance web app: a talent-scouting platform where engineers are
discovered through real, verifiable work instead of resumes (see
`Provenance_OnePager (2).pdf`). This spec delivers the T3-stack skeleton every
later spec builds on: a scaffolded Next.js app with tRPC, Prisma, NextAuth, and
Tailwind, a base layout, and working build/test commands. Success: a developer
clones the repo, runs the README quickstart, and sees the Provenance home page.

## Requirements
Must-have:
1. Scaffold with **create-t3-app** (latest): TypeScript, Next.js App Router,
   Tailwind CSS, tRPC, Prisma, NextAuth. The app lives at the repo root.
2. Database: **Supabase Postgres via Prisma** (`provider = "postgresql"`).
   `DATABASE_URL` uses Supabase's transaction pooler (port 6543) and
   `directUrl = env("DIRECT_URL")` uses the direct connection (port 5432) for
   migrations/`db push`. `.env` is gitignored; `.env.example` is committed with
   every required variable and a comment saying exactly where in the Supabase
   dashboard each value comes from (Settings → Database → Connection string).
3. Base layout: shared nav bar (app name "Provenance", links slot for later
   specs) and footer, applied to all pages via the root layout.
4. Home page at `/` showing the platform name and tagline: "Engineers discovered
   through real work — not resumes."
5. A styled not-found page (Next.js `not-found.tsx`) using the shared layout.
6. Test runner: **Vitest** wired up with `npm test`, including at least one real
   unit test (e.g., a tRPC health/hello procedure returns the expected shape).
7. `npm run build` (includes typecheck) passes clean; `npm run dev` serves the
   home page on localhost.
8. README rewritten with quickstart: prerequisites (Node ≥20 LTS, a free
   Supabase project), install, env setup (both connection strings),
   `prisma db push`, dev, build, and test commands — exact commands,
   PowerShell-friendly.

Deferred (not in this spec): any domain models, auth configuration beyond what
the scaffold generates, custom styling beyond the basic layout.

## Constraints
- T3 stack as scaffolded — Next.js App Router, TypeScript strict, Tailwind,
  tRPC, Prisma (SQLite), NextAuth. No additional runtime dependencies beyond the
  scaffold except Vitest (dev) and what later specs explicitly add.
- Node ≥20 LTS required (the dev machine currently has 18.17.1 — upgrading Node
  is part of setting up this spec; document the requirement in the README).
- Windows/PowerShell is the dev environment; all documented commands must work
  in PowerShell.
- The app runs locally with `npm run dev`; the database is a Supabase free-tier
  Postgres project (the only cloud service; no paid dependencies).
- Secrets (Supabase connection strings, auth secret) live in `.env`
  (gitignored); never hardcode or commit them.

## Edge Cases
- Fresh clone with no `.env` → README instructions produce a working setup;
  `.env.example` lists everything needed.
- Empty Supabase database → `npx prisma db push` creates the schema.
- Unreachable/incorrect DATABASE_URL → pages that don't touch the DB (home,
  404) still render; DB errors surface as readable errors, not silent hangs.
- Unknown route → styled 404 page using the shared layout, not the unstyled
  default.
- `npm test` with a failing test exits nonzero (CI-usable).

## Definition of Done
- [ ] `npm install`, `npx prisma db push`, `npm run dev` from a fresh clone
      (plus copying `.env.example` → `.env` and filling in the Supabase
      connection strings) serves `http://localhost:3000/` with the tagline
      visible.
- [ ] `npm run build` completes with no type errors.
- [ ] `npm test` runs Vitest and passes; a deliberately broken assertion makes
      it exit nonzero.
- [ ] Visiting an unknown path renders the styled 404 page.
- [ ] `.env` is gitignored; `git status` after a full dev cycle never offers
      secrets for commit.
- [ ] README contains the full quickstart and the commands work as written.
