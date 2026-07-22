# Provenance

Provenance is a public portfolio and project-discovery platform. People can share work across disciplines, customize a public profile, and browse projects by category or hashtag.

## Quickstart

Prerequisites: Node.js 20 or newer, npm, and a Supabase project.

```powershell
npm install
Copy-Item .env.example .env
npx auth secret
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

Configure the database and Supabase Storage values documented in `.env.example`. In the Supabase dashboard, manually create the public Storage bucket named by `SUPABASE_STORAGE_BUCKET` and the private bucket named by `SUPABASE_STORAGE_STAGING_BUCKET`. The private staging bucket must not be made public. The service-role key is server-only and must never be exposed to the browser.

Uploads use a two-phase flow: the application creates a 10-minute, user-bound intent; the browser uploads the file body directly to the private staging bucket using a signed URL; and the server downloads, size-checks, magic-byte-validates, and finalizes the object into the public bucket. The browser never sends supported image or video file bytes to a Vercel Function. Images up to 10 MB and videos up to 50 MB use this same direct upload path.

For OAuth sign-in, create a Google OAuth client and a GitHub OAuth App, then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET`. Register these redirect URIs, replacing the origin with each deployed environment:

- `http://localhost:3000/api/auth/callback/google`
- `http://localhost:3000/api/auth/callback/github`

The production URIs use the same `/api/auth/callback/google` and `/api/auth/callback/github` paths on the production domain. Keep both client secrets server-only.

The seed creates the first administrator only when the user table is empty. If `ADMIN_PASSWORD` is unset, it prints a generated password once. Everyone else signs up at `/signup` and receives the standard user role.

## Development

Schema changes are committed as new Prisma migrations.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
npx prisma validate
```

CI and branch protection on `main` must require the lint/typecheck/test/build/audit job to pass before merge.

### Deployment

Vercel runs `npm run vercel-build`. The build runs `prisma migrate deploy` only when `VERCEL_ENV` is exactly `production`; Preview and Development builds never run migrations. A missing or unexpected `VERCEL_ENV` also blocks migrations and logs the reason before continuing with `next build`.

In the Vercel project settings, scope `DATABASE_URL`, `DIRECT_URL`, Supabase Storage (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, and `SUPABASE_STORAGE_STAGING_BUCKET`), and OAuth credentials separately for Preview and Production. Preview values must point only to non-production resources so a preview deployment cannot access the production database, Storage project, bucket, or OAuth application.

### Upload staging cleanup

Run abandoned/failed upload cleanup manually with:

```powershell
npm run cleanup:uploads
```

Schedule this command hourly with an external scheduler, or expose equivalent protected server-side invocation through Vercel Cron in a later deployment pass. A successful run prints JSON counts for selected, deleted, expired, and failed intents; record that output in the scheduler logs to verify the last successful execution. The job is idempotent and never selects finalized intents.

### Grid layout migration

After deploying the Grid layout schema, convert eligible legacy profile and project content with this idempotent sequence:

```powershell
npm run db:migrate
npm run grid:migrate
```

The migration prints exact counts for migrated profiles and projects, records that were already migrated, and records skipped because they contain video or require more than 50 blocks. Skipped video and oversized records remain on the legacy renderer with all existing content intact. Rerunning the command does not duplicate layouts or replace owner edits.

The login lockout remains ten failed attempts within fifteen minutes, followed by a fifteen-minute lock. Public visitors can browse `/`, profiles at `/<username>`, and project pages without signing in. Signed-in users can edit their profile, manage projects, and submit reports. Administrators review reports at `/admin/reports`.

The public `/terms` and `/privacy` pages remain structural placeholders and require legal review before launch.
