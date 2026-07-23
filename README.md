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

The rate-limit concurrency integration cases run only against a reachable `DATABASE_URL` whose host/database name identifies it as `test` or `ci`. For an isolated test database with a different provider-assigned name, explicitly opt in for that shell session with `$env:RUN_DATABASE_INTEGRATION_TESTS="true"` before `npm test`. Never set that flag when `DATABASE_URL` targets development or production data.

CI and branch protection on `main` must require the lint/typecheck/test/build/audit job to pass before merge.

### Deployment

Vercel runs `npm run vercel-build`. The build runs `prisma migrate deploy` only when `VERCEL_ENV` is exactly `production`; Preview and Development builds never run migrations. A missing or unexpected `VERCEL_ENV` also blocks migrations and logs the reason before continuing with `next build`.

In the Vercel project settings, scope `DATABASE_URL`, `DIRECT_URL`, Supabase Storage (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, and `SUPABASE_STORAGE_STAGING_BUCKET`), and OAuth credentials separately for Preview and Production. Preview values must point only to non-production resources so a preview deployment cannot access the production database, Storage project, bucket, or OAuth application.

Configure environment values by Vercel scope:

| Scope       | Configuration                                                                                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Development | Use local or development-only `DATABASE_URL`, `DIRECT_URL`, Supabase project/buckets, and `AUTH_SECRET`. OAuth is optional, but each configured provider requires both its client ID and client secret.                                                        |
| Preview     | Use preview-only database URLs, Supabase project/buckets, `AUTH_SECRET`, and OAuth applications. Preview database, Storage, and OAuth resources must be isolated from Production.                                                                              |
| Production  | Set dedicated production `AUTH_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, and `SUPABASE_STORAGE_STAGING_BUCKET`. Set both values for each enabled OAuth provider; omit both to disable it. |

Never copy Production database, Supabase service-role, Storage, OAuth, or backup credentials into Development or Preview scopes.

### Storage reconciliation and reporting

Run the full idempotent reconciliation job manually with:

```powershell
npm run storage:reconcile
```

This retries pending public-object deletions and removes failed, expired, or abandoned staging objects. Finalized staging leftovers are eligible only after the upload intent's 10-minute retention window. Schedule this command hourly with an external scheduler, or expose equivalent protected server-side invocation through Vercel Cron in a later deployment pass. Record its JSON output in scheduler logs to verify the last successful execution. A nonzero exit code means at least one Storage operation failed and remains eligible for retry.

The narrower `npm run cleanup:uploads` command remains available when only staging cleanup is needed. For an aggregate, secret-free operational report, run:

```powershell
npm run storage:report
```

The report prints total finalized owned bytes, pending-deletion count, abandoned-staging count, and the count of deletion records that have reached the reconciliation failure threshold. It never prints Storage credentials or per-object provider errors.

### Database backups

Supabase's free tier does not include automatic Postgres backups. Run a logical export with:

```powershell
npm run backup:database
```

This writes a timestamped, gzip-compressed `pg_dump` of `DIRECT_URL` to `./backups` (override with `BACKUP_OUTPUT_DIR`) and never prints the connection string. Schedule this daily, then encrypt and copy the dump off-site — never into this repository or the project's own Supabase Storage bucket. See `docs/runbook.md` for retention, RPO/RTO, the Storage-object backup gap, and the restore-drill procedure.

### Security and OAuth cleanup

Remove stale rate-limit/login-attempt rows and expired OAuth signup/link intents with:

```powershell
npm run cleanup:rate-limits
```

Schedule this command at least daily (hourly is also safe). Limiter rows remain eligible for enforcement throughout their active window or lockout and are retained for a full day of inactivity before deletion. The command prints only aggregate deletion counts; keep that output in scheduler logs to verify the last successful run.

### Grid layout migration

After deploying the Grid layout schema, convert eligible legacy profile and project content with this idempotent sequence:

```powershell
npm run db:migrate
npm run grid:migrate
```

The migration prints exact counts for migrated profiles and projects, records that were already migrated, and records skipped because they contain video or require more than 50 blocks. Skipped video and oversized records remain on the legacy renderer with all existing content intact. Rerunning the command does not duplicate layouts or replace owner edits.

The login lockout remains ten failed attempts within fifteen minutes, followed by a fifteen-minute lock. Public visitors can browse `/`, profiles at `/<username>`, and project pages without signing in. Signed-in users can edit their profile, manage projects, and submit reports. Administrators review reports at `/admin/reports`.

The public `/terms` and `/privacy` pages remain structural placeholders and require legal review before launch.
