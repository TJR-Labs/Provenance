# Deployment and incident runbook

## Scheduled maintenance jobs

`cleanup:rate-limits`, `cleanup:uploads`, and `storage:reconcile` now run **automatically in production** via Vercel Cron (`vercel.json`), in addition to remaining runnable manually with `npm run <script>`. Each cron route lives under `src/app/api/cron/` and shares its core logic with the CLI script through `src/server/jobs/`:

| Cron route | Schedule (UTC) | Shared job function | Batch size (`LIMIT`) and why it fits the 10s timeout |
| --- | --- | --- | --- |
| `/api/cron/cleanup-rate-limits` | `0 3 * * *` | `runRateLimitCleanup` (`src/server/jobs/rate-limit-cleanup.ts`) | 500 oldest-eligible rows per table (7 tables) — each delete targets an indexed column, sub-second even at the cap. |
| `/api/cron/cleanup-uploads` | `20 3 * * *` | `runUploadCleanup` (`src/server/jobs/upload-cleanup.ts`) | 25 rows — each row costs one sequential Supabase Storage network call plus a DB update (~300ms budgeted per row). |
| `/api/cron/storage-reconcile` | `40 3 * * *` | `runStorageReconciliation` (`src/server/jobs/storage-reconciliation-job.ts`) | 10 rows per sub-step (pending-deletion reconciliation, then abandoned-staging cleanup) — each row is a DB transaction plus a Storage call. |

Schedules are staggered by at least 15 minutes so they don't compete for database connections in the same window. Each run is bounded to a single batch (`LIMIT`) per invocation, oldest rows first; if a day's backlog exceeds one batch, the next day's run continues from the oldest remaining rows — there is no cursor or intra-day retry.

Vercel signs cron requests with `Authorization: Bearer ${CRON_SECRET}`; every cron route rejects any other request with `401` before running cleanup logic. Set `CRON_SECRET` in the Production environment (required — the app fails to build without it in production).

**Checking logs:** each run logs one JSON line (`event: "cron_job_completed"`) with the route, `processed` count, and `remaining` backlog count via `console.log`, alongside any `server_error` line from `logServerError` on failure. View these in the Vercel deployment's Runtime Logs (or the log drain configured below) filtered by route. A `remaining` count that keeps growing day over day — visible directly in these logs — is the signal that the batch size or schedule needs revisiting; there is no separate alerting on backlog size yet (explicitly deferred).

## Health monitoring and alert ownership

The application exposes two stable, unauthenticated health endpoints:

- `GET /api/health/live` proves only that the deployed process can serve HTTP. It makes no database or Storage calls.
- `GET /api/health/ready` runs a minimal Postgres query with a three-second application timeout. It returns `200` when Postgres is reachable and `503` with a generic body when the query fails or times out.

Configure the external uptime monitor with these settings:

- URL: the production origin plus `/api/health/ready`
- Method and interval: `GET` every 60 seconds
- Alert threshold: three consecutive non-2xx responses or timeouts; resolve only after two consecutive successful checks
- Alert acknowledgement owner: `<on-call owner>`
- Notification target: `<incident notification channel>`
- Monitor timeout: at least five seconds so the endpoint's three-second database timeout can return its controlled `503`

Do not use liveness as the primary uptime signal: Postgres can be unavailable while liveness remains healthy. Keep `/api/health/live` as the comparison signal that distinguishes a process/routing failure from a database-readiness failure.

After configuring the monitor, test it against a disposable Preview deployment whose test-only database is intentionally unreachable. Confirm `/api/health/live` remains `200`, `/api/health/ready` becomes `503`, the alert reaches `<incident notification channel>` after three checks, and recovery resolves after two healthy checks. Never run this test by changing Production credentials.

## Error and job-failure alerting

Runtime API errors are emitted as one-line JSON records with `event`, `correlationId`, `route`, `deploymentEnvironment`, `releaseIdentifier`, `errorCategory`, and a safe error type/code. The logger deliberately excludes error messages and stacks because provider errors can contain connection strings, internal hostnames, or credentials. It also never logs request bodies, cookies, authorization headers, passwords, OAuth tokens, service-role keys, or user data.

Console collection alone is not an alert. Configure a Vercel log drain, or an equivalent runtime-log export, to send these JSON records to `<log alerting destination>`, then configure `<incident notification channel>` alerts for:

- any sustained `event=server_error` burst (five events in five minutes), grouped by `route`, `releaseIdentifier`, and `errorCategory`;
- three `database` events in five minutes (the readiness monitor remains the authoritative availability alert);
- five `upload` events in ten minutes; and
- five `unknown` events in five minutes, because these are unexpected API failures.

The external scheduler or CI system must also alert `<on-call owner>` on any failed production migration or backup/export failure or missed backup, and on any non-200 response or `server_error` log line from `/api/cron/cleanup-rate-limits`, `/api/cron/cleanup-uploads`, or `/api/cron/storage-reconcile` (two consecutive failures of the same cron route). Capture each run's status and the `processed`/`remaining` counts from its `cron_job_completed` log line; do not place environment values or secret-bearing provider errors in alert messages. `npm run storage:report` provides the secret-free Storage totals and failure counts needed during triage, and each job also remains runnable manually via `npm run storage:reconcile`, `npm run cleanup:uploads`, or `npm run cleanup:rate-limits`.

Test the log integration in Preview by generating a controlled server error, locating its correlation id in `<log alerting destination>`, and confirming the threshold/test notification reaches `<incident notification channel>`. Test scheduler alerts with the scheduler's built-in test-failure facility rather than damaging data or disabling a Production dependency. Record the test date, result, monitor configuration, log-drain destination, and dashboard links in the private operations system; do not commit private contacts or credentials here.

## Incident response

Every incident is acknowledged by `<on-call owner>` in `<incident notification channel>`. Keep correlation ids, release identifiers, and aggregate counts in incident notes; do not copy secret-bearing provider responses into chat or tickets.

### Database outage

- **Detect:** `/api/health/live` remains `200` while `/api/health/ready` returns `503`; the uptime monitor alerts, and runtime logs show `errorCategory=database` for `/api/health/ready`.
- **Mitigate:** acknowledge the alert, check Supabase/Postgres service status and connection capacity, stop migrations and other database maintenance, and keep the last known-good deployment serving while the provider recovers. Do not attempt a destructive rollback.
- **Check next:** `<on-call owner>` checks the Supabase project, Vercel release/runtime logs, recent credential or connection-setting changes, and then verifies two healthy readiness checks before resolving.

### Storage outage

- **Detect:** readiness may stay `200`; uploads return bounded errors, runtime logs show repeated `errorCategory=upload`, and scheduled `npm run storage:reconcile` or `npm run cleanup:uploads` runs fail. `npm run storage:report` shows pending deletions or reconciliation failures without provider details.
- **Mitigate:** leave non-media pages serving, communicate that uploads are impaired, preserve pending-deletion and staging records, and do not manually delete database ownership records. After Storage recovers, run `npm run storage:reconcile` and confirm its failed counts are zero.
- **Check next:** `<on-call owner>` checks Supabase Storage status and bucket configuration, then reviews `npm run storage:report` and the last reconciliation/cleanup outputs for remaining work.

### Failed migration

- **Detect:** the controlled Production build fails during `prisma migrate deploy`; Vercel build logs report the migration failure and promotion stops. The previously serving release's health endpoints show whether it remains available.
- **Mitigate:** stop promotion, keep or restore the previous application deployment, and inspect the failed migration state. Do not use `prisma db push`, automatically roll back destructive SQL, or retry until the cause and backup state are understood.
- **Check next:** `<on-call owner>` checks the committed migration, Prisma migration state, Production environment scoping, and the verified pre-migration backup/recovery instructions before scheduling a corrected expand/contract migration.

### Elevated 5xx rate

- **Detect:** the external log consumer alerts on a `server_error` burst or Vercel reports elevated 5xx responses. Group structured logs by `route`, `releaseIdentifier`, `errorCategory`, and correlation id; compare `/api/health/live` with `/api/health/ready`.
- **Mitigate:** identify the affected route and first bad release, roll back the application deployment when the onset matches a code release, and avoid schema rollback unless a written recovery plan requires it. Keep unaffected routes serving.
- **Check next:** `<on-call owner>` checks recent releases plus the last outputs of `npm run storage:reconcile`, `npm run cleanup:uploads`, and `npm run cleanup:rate-limits` to distinguish runtime, Storage, and maintenance failures.

### Credential compromise

- **Detect:** a provider/security notification, a reported secret exposure, unexplained authentication or Storage activity, or correlated API errors may indicate compromise. Health endpoints alone do not detect leaked credentials.
- **Mitigate:** revoke and rotate the affected database, Supabase service-role, OAuth, or authentication secret in every scoped environment; invalidate it at the provider; redeploy; and restrict access while impact is assessed. Never paste the old or new value into logs or incident chat.
- **Check next:** `<on-call owner>` reviews Vercel access/audit data and the relevant Supabase/OAuth provider activity, checks Git history without reproducing the secret, confirms Preview and Production isolation, and reviews the last `npm run cleanup:rate-limits` output for stale security/OAuth rows. That cleanup command does not rotate credentials or revoke active sessions.

## Backup and recovery

### Database (Postgres)

This project runs on **Supabase's free tier**, which does **not** include automatic daily backups or point-in-time recovery. There is no built-in RPO/RTO to rely on — backups only exist if this project schedules and runs them itself.

- **Mechanism:** `npm run backup:database` runs `pg_dump` against `DIRECT_URL` (the direct, non-pooled connection) and writes a timestamped, gzip-compressed logical dump to `./backups` (or `BACKUP_OUTPUT_DIR`). It never prints the connection string or a password.
- **Schedule:** run this daily via an external scheduler (the same class of scheduler used for `npm run storage:reconcile` and `npm run cleanup:rate-limits`). There is currently no automatic backup without this job running — a missed run is a real, unrecovered gap, not a redundant safety net.
- **Off-site copy:** the script only writes locally. After each run, the operator (or the scheduler's post-step) must encrypt the dump (e.g. `gpg --symmetric` or a password-protected archive) and copy it to storage **outside** this project's own Supabase project — a separate cloud bucket or equivalent. Never store a database dump in this Git repository, in the project's own Supabase Storage bucket, or on a public bucket.
- **Retention:** keep at minimum 7 daily dumps and 4 weekly dumps off-site; delete older ones on a rolling basis. Adjust once real usage/storage cost is known.
- **RPO / RTO (documented, not automatic):** because backups are once-daily and manually triggered restore, the realistic recovery point objective is **up to 24 hours** of data loss, and the recovery time objective depends on how quickly `<on-call owner>` can provision a new Postgres instance and run a restore (budget at least an hour for a first attempt, faster once the restore drill below has been rehearsed). If this becomes unacceptable, upgrading the Supabase plan for continuous/point-in-time backups is the documented alternative — evaluate cost against the business need before adopting it.
- **Before destructive operations:** per Requirement 6 (migration/rollback) and Requirement 3 (Storage cleanup), run `npm run backup:database` and confirm the resulting dump file is non-empty and its timestamp is current *before* any destructive production migration or any bulk `npm run storage:reconcile` / `npm run cleanup:*` run that is expected to delete a large number of rows. Do not proceed on a stale or missing backup.

### Storage (Supabase Storage objects)

Supabase's database backups (if the plan is later upgraded to include them) do **not** cover Storage bucket objects — Postgres and Storage are backed up, if at all, completely separately.

- **Current policy:** this project does not yet run a separate bulk export of Storage objects. Finalized media currently exists only in the Supabase Storage bucket named by `SUPABASE_STORAGE_BUCKET`, with no independent copy. This is an explicitly accepted loss characteristic until a Storage export job is built: if the Supabase project is lost or an object is wrongly deleted outside the application's own tracked deletion flow, that object is not recoverable from a Provenance-owned backup.
- **What *is* recoverable:** the database dump above includes every `ProjectMedia.storageBucket`/`storagePath`, `ImageResource.storageBucket`/`storagePath`, and `UploadIntent` staging/result path column (added for Requirement 3's ownership metadata), so a restored database always knows which bucket+path each row is *supposed* to point to — the gap is only the object bytes themselves, not the metadata needed to reconnect them.
- **Upgrade path:** when Storage export becomes a priority, the natural next step is a scheduled job (same pattern as `npm run storage:reconcile`) that lists finalized objects via the Supabase Storage API and copies them to a second bucket or off-site archive, keyed by the same `storageBucket`/`storagePath` values already recorded in Postgres — no schema change needed to support it later.

### Restore drill

- Before public launch, and at least twice a year afterward, perform a full restore drill into a **new, non-production** Supabase project:
  1. Create a fresh Supabase project (or reuse a dedicated drill project) — never restore into the real Preview or Production project.
  2. Restore the most recent `npm run backup:database` dump into that project's Postgres with `psql` (`gunzip -c <dump>.sql.gz | psql <drill-project-DIRECT_URL>`).
  3. Verify referential consistency: spot-check that restored `ProjectMedia`/`ImageResource` rows' `storageBucket`/`storagePath` values match objects that still exist in the real Storage bucket (or, once a Storage export job exists, in the Storage backup) — this drill is what would catch the gap noted above where the database restores but Storage objects are separately lost.
  4. Confirm representative media actually loads using the restored rows' recorded path (a restored row whose object is missing is the exact inconsistency the drill exists to catch, per the spec's edge case: "A backup restores database metadata but not Storage: the restore drill must detect and report the inconsistency").
  5. Record the drill date, dump used, what was checked, what passed, and any inconsistency found, in the private operations system (not in this repo).
  6. Tear down the drill project afterward; never leave a second copy of production data sitting in a low-security drill project indefinitely.
