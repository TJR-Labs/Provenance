# Production Scheduled Jobs — Spec

## Objective

Provenance has three maintenance scripts (`cleanup:rate-limits`,
`cleanup:uploads`, `storage:reconcile`) that exist only as manually-invoked
CLI commands in `package.json`. Nothing schedules them in production, so
`RateLimitAttempt` rows and orphaned Storage uploads currently grow without
bound between deploys.

This spec wires all three jobs to run automatically in production via Vercel
Cron, on the Hobby plan's constraints (max one invocation per cron per day,
10s function timeout by default). Success means each job runs unattended
every day, finishes inside the timeout even with a backlog, and requires no
change to how an engineer runs the same cleanup manually today.

## Requirements

1. Extract the core logic of each script into a shared, importable function:
   - `runRateLimitCleanup(batchSize: number)` (from `cleanup:rate-limits`)
   - `runUploadCleanup(batchSize: number)` (from `cleanup:uploads`)
   - `runStorageReconciliation(batchSize: number)` (from `storage:reconcile`)
   Location: `src/server/jobs/`.
2. Each existing CLI script (`scripts/cleanup-rate-limits.ts`, etc.) is
   updated to call its corresponding shared function instead of containing
   the logic inline. CLI behavior (arguments, console output, exit codes)
   stays the same from an operator's point of view.
3. Add three new routes under `src/app/api/cron/`:
   - `cron/cleanup-rate-limits`
   - `cron/cleanup-uploads`
   - `cron/storage-reconcile`
   Each route calls its shared function with a fixed batch size and returns a
   JSON body reporting `{ processed: number, remaining: number }`.
4. Every cron route rejects the request with `401` unless the incoming
   `Authorization` header is exactly `Bearer ${process.env.CRON_SECRET}`,
   matching Vercel's documented cron-auth convention.
5. Register all three routes in `vercel.json` under `crons`, each with a
   daily schedule (exact times staggered by at least 15 minutes so they don't
   compete for DB connections in the same window).
6. Each job processes a single bounded batch per invocation:
   - Rate-limit cleanup: delete the oldest expired `RateLimitAttempt` rows,
     oldest-first, up to a fixed `LIMIT`.
   - Upload cleanup: same pattern for abandoned/staging upload rows.
   - Storage reconciliation: same pattern for the set of Storage objects it
     reconciles per run.
   No cursor or multi-invocation retry state is introduced — if a day's
   backlog exceeds one batch, the next day's run continues from the oldest
   remaining rows.
7. Each run logs (via the existing production logger) the count processed
   and the count still remaining after the run, so a growing backlog is
   visible in logs without new alerting infrastructure.
8. Batch sizes are chosen (and documented in code comments or `docs/runbook.md`)
   to comfortably finish within Vercel Hobby's 10s function timeout under
   expected data volume.

### Explicitly deferred (not in this spec)

- Upgrading to Vercel Pro for hourly cron or longer timeouts.
- Alerting/paging when backlog size crosses a threshold.
- Cross-invocation cursors or intra-day catch-up runs.

## Constraints

- Must work within Vercel Hobby plan limits: cron jobs invoked at most once
  per day each, function execution capped at 10s.
- Must use Vercel's standard `CRON_SECRET` env var + `Authorization: Bearer`
  header pattern for authenticating cron-triggered requests — no custom
  secret scheme.
- No new dependencies; use the existing Prisma client and Supabase Storage
  client already used by the CLI scripts.
- CLI scripts must remain independently runnable by an engineer without
  needing the deployed cron routes.

## Edge Cases

- **Cron route hit with missing/wrong `Authorization` header:** respond
  `401` and do not run any cleanup logic.
- **Batch larger than what fits in 10s:** the run processes as many as it
  safely can within the configured `LIMIT` and exits normally; it does not
  attempt to detect or extend past the timeout.
- **Job runs with nothing to clean up:** returns `{ processed: 0, remaining: 0 }`
  and logs the same, without erroring.
- **Two cron routes accidentally scheduled to overlap:** staggering scheduled
  times in `vercel.json` is the mitigation; the spec does not add
  distributed locking on top of this.
- **Database or Storage call fails mid-batch:** the job logs the error and
  returns a non-200 status; partially-completed deletes are acceptable since
  the next day's run will continue from the oldest remaining rows.

## Definition of Done

- [ ] `src/server/jobs/` contains the three extracted job functions, each
      independently unit-testable.
- [ ] The three existing CLI scripts still run manually and produce the same
      observable behavior as before, now calling the shared functions.
- [ ] Three routes exist under `src/app/api/cron/`, each returning `401`
      when called without a valid `CRON_SECRET` bearer token, and a `200`
      with `{ processed, remaining }` when called with a valid one.
- [ ] `vercel.json` declares all three crons with staggered daily schedules.
- [ ] Each job's batch `LIMIT` is documented (code comment or runbook entry)
      with the reasoning for why it fits the 10s timeout.
- [ ] Tests cover: unauthorized request → 401; successful run with a
      populated backlog → correct processed/remaining counts; empty backlog →
      zero-count success.
- [ ] `docs/runbook.md` is updated to note these jobs now run automatically
      in production and describe how to check their logs.
