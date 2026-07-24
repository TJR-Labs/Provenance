# Backend Deployment Readiness — Spec

## Objective

Provenance has the core backend pieces needed for an MVP—authentication and
roles, input validation, security headers, Prisma migrations, CI, production
error logging, upload content sniffing, and Postgres-backed rate limiting—but
the current application is not ready for a public Vercel deployment.

This spec closes the deployment-critical gaps found in the backend audit:

- the production build currently fails lint;
- uploads are sent through a Vercel Function even though the application
  accepts files larger than Vercel's 4.5 MB request limit;
- uploads have no per-user quota, request throttle, or complete object
  lifecycle;
- rate-limit counters can lose increments under concurrency;
- growing list endpoints and hashtag aggregation are unbounded;
- migrations run before the deployment artifact is known to build and can run
  against the wrong environment;
- the health endpoint does not test dependencies and there is no documented
  monitoring or recovery procedure;
- production can start with incomplete storage or OAuth configuration;
- production dependencies currently include known vulnerable versions; and
- credentials accounts have no supported password-recovery or account-deletion
  path.

Success means a clean commit can pass the same checks used for deployment,
deploy without routing large media through a Vercel Function, resist concurrent
abuse, remain bounded as data grows, expose meaningful readiness information,
and have documented recovery procedures for both Postgres and Storage.

UI/UX changes are out of scope except for the minimum client wiring needed to
use new backend contracts and display existing-style errors.

## Confirmed Baseline

At the time this spec was written:

- `npm run build` compiles the application but fails during linting, so the
  current `dev` branch cannot produce a deployable artifact.
- `npm test` passes all 405 tests when run with the same dummy environment
  variables used by CI.
- `npm run typecheck` passes after Next's generated types are present.
- `npx prisma validate` passes.
- `npm audit --omit=dev` reports two high and two moderate production findings,
  including `sharp@0.34.5` and `next-auth@5.0.0-beta.25`.
- `src/app/api/upload/route.ts` calls `request.formData()` and permits upload
  limits of 10 MB for images and 50 MB for videos. Vercel Functions reject
  request bodies over 4.5 MB. See:
  https://vercel.com/docs/functions/limitations
- no application path deletes an object from Supabase Storage.
- `health.check` always returns `{ status: "ok" }` without checking Postgres.

## Release Priority

### P0 — Required before the first deployment

1. Restore a green production build and deployment gate.
2. Remove large media bodies from the Vercel Function request path.
3. Clear applicable high-severity production dependency findings.
4. Prevent preview deployments from migrating the production database.

### P1 — Required before general public traffic

5. Add storage quotas, throttling, ownership, and deletion/cleanup.
6. Make all security-relevant rate limits concurrency-safe.
7. Bound public and administrative queries with pagination or database-side
   aggregation.
8. Add real readiness checks, monitoring, and actionable production logs.
9. Enforce complete production configuration.
10. Establish database and Storage backup/restore procedures.

### P2 — Required before credentials accounts are treated as durable user
accounts

11. Add secure password recovery.
12. Add account and personal-data deletion.

## Requirements

### 1. Green build and release gate

1. Fix all lint errors currently blocking `npm run lint` and `npm run build`.
   Do not disable lint during Next builds and do not weaken repository-wide
   lint rules merely to make the build green.
2. Keep `npm run build` as a production compilation check that does not require
   a reachable database.
3. Update the obsolete `check`/`lint` scripts before adopting Next 16: the
   installed Next version warns that `next lint` is deprecated. Use the ESLint
   CLI while preserving the current rule set and file coverage.
4. CI must run, in order, install, lint, typecheck, tests, production build, and
   a production-dependency audit. A failure in any required check must block
   production promotion through branch protection/deployment settings.
5. The dependency audit must fail CI for unresolved high or critical
   production vulnerabilities. A temporary exception requires a committed
   record containing the advisory, applicability analysis, compensating
   control, owner, and expiration date.
6. Document the exact local pre-push command sequence in `README.md` using
   PowerShell-compatible commands.

### 2. Direct-to-storage upload flow

1. Replace the current multipart-through-Next upload flow with a two-phase
   backend contract:
   1. An authenticated client requests an upload intent from the backend.
   2. The backend validates purpose, requested MIME type, declared byte size,
      current quota, and rate limit, then generates an unpredictable,
      user-owned object path and a short-lived signed Supabase upload URL or
      token.
   3. The client uploads bytes directly to Supabase Storage.
   4. The client asks the backend to finalize the upload.
   5. The backend verifies the stored object's owner/path, actual byte size,
      and actual content signature before creating or returning an application
      media/resource record.
2. No supported image or video upload may send its file body through a Vercel
   Function. The existing 10 MB image and 50 MB video limits remain unless a
   separate product decision changes them.
3. Preserve the current allow-list and magic-byte verification for PNG, JPEG,
   WebP, GIF, MP4, and WebM. A client-supplied extension, `Content-Type`, size,
   object path, or user id is never trusted by itself.
4. Upload intents must be single-use, expire within 10 minutes, be bound to the
   authenticated user and purpose, and only authorize a server-generated path
   inside that user's prefix.
5. An object must not become an accepted public application asset until final
   validation succeeds. Use a private staging location or an equivalent design
   that prevents unvalidated content from being treated as public content.
6. Finalization must be idempotent. Repeating it for the same valid intent must
   return the same record rather than create duplicate rows.
7. Invalid, expired, abandoned, or failed uploads must be deleted from staging.
   A scheduled cleanup must remove abandoned staging objects after a bounded
   retention period.
8. Keep the service-role key server-only. Never return it, log it, embed it in a
   client bundle, or use it as the signed upload credential.

### 3. Storage accounting, quota, and lifecycle

1. Store the provider bucket and object path for every owned upload; do not use
   a public URL as the only durable identifier. Add Prisma migration(s) for
   this metadata without breaking existing URL-only records.
2. Enforce both of these server-side defaults, with named constants that can
   be adjusted later:
   - no more than 30 upload intents per authenticated user per hour; and
   - no more than 1 GiB of finalized owned media per user.
3. Quota calculations must use server-observed object sizes and must be safe
   under concurrent finalization. Parallel requests must not allow unbounded
   quota overshoot.
4. Deleting or replacing an uploaded project-media item, image resource,
   project, or account must eventually delete its unreferenced Storage object.
   External media URLs must never be sent to the Storage deletion API.
5. Database and Storage operations cannot be one atomic transaction. Use an
   explicit pending-deletion/outbox record or equivalent retryable mechanism
   so a transient Storage failure does not permanently orphan an object.
6. A scheduled, idempotent cleanup reconciles pending deletions and removes
   abandoned staging objects. It must never delete an object still referenced
   by a live record.
7. Add an admin-operable script or report that shows total owned bytes, pending
   deletions, abandoned staging objects, and reconciliation failures without
   exposing service-role credentials.

### 4. Atomic rate limiting and login-abuse controls

1. Replace every security-sensitive read-compute-upsert counter with a
   concurrency-safe database operation. This includes `RateLimitAttempt` and
   the credentials `LoginAttempt` flow.
2. The database operation must atomically decide whether the current request is
   allowed and record it. Use a single conditional SQL statement, row locking
   inside a transaction, or another Postgres mechanism whose concurrency
   behavior is covered by integration tests.
3. Do not rely exclusively on unit-test fakes for concurrency behavior. Add a
   Postgres-backed test that sends parallel attempts at the threshold and
   proves the allowed count cannot exceed the documented bound beyond a small,
   explicitly justified tolerance.
4. Credentials login must have both account-oriented and source-oriented
   protection so one IP cannot make unlimited guesses across usernames and an
   attacker cannot cheaply keep a known username permanently locked.
5. Resolve source addresses only from headers guaranteed by the configured
   trusted Vercel proxy boundary. Document that trust assumption. Do not accept
   an arbitrary client-prepended `x-forwarded-for` value as authoritative.
6. Keep responses generic enough to avoid username/account enumeration.
7. Expired limiter rows and OAuth flow records must be cleaned up on a schedule
   so these tables do not grow without bound.

### 5. Bounded queries and database work

1. Add cursor pagination to all potentially growing list operations, including:
   - discovery projects;
   - projects by username;
   - the signed-in user's projects;
   - admin user listing; and
   - admin report listing.
2. Use a default page size of 24 for public project lists and 50 for admin
   lists, with a hard maximum of 100 records per request.
3. Use stable cursor ordering with a deterministic tie-breaker, such as
   `(createdAt, id)`, and return an explicit `nextCursor` or `null`.
4. Do not load all hashtags into application memory. Compute popular hashtag
   counts in Postgres or maintain a bounded aggregate suitable for the current
   schema.
5. Project list responses must select only fields required by the caller and
   must bound nested media, normally to the first thumbnail. Full media arrays
   belong on the single-project endpoint.
6. Add or confirm indexes that support the final filters and cursor ordering.
   Use `EXPLAIN` against representative data before declaring the work done.
7. Add tests for first page, subsequent page, end of results, stable ordering,
   invalid cursor, maximum page size, and private/banned visibility across
   page boundaries.

### 6. Migration and environment isolation

1. Preview deployments must never run migrations against the production
   database. Preview and production must have separately scoped Vercel
   `DATABASE_URL`, `DIRECT_URL`, Storage, and OAuth values.
2. Gate production migration execution on an explicit deployment environment,
   not merely on the presence of database credentials. A missing or unexpected
   environment value must fail closed.
3. Do not apply production migrations from arbitrary branch builds. Run them
   once from a controlled, serialized release step after required CI checks
   pass.
4. All production migrations must follow expand/contract compatibility:
   - deploy additive schema first;
   - deploy code that can tolerate old and new representations;
   - backfill with an idempotent, observable job;
   - remove old fields/constraints only in a later release.
5. Migration failure must stop promotion. Concurrent release attempts must not
   race migrations.
6. Document rollback behavior. Application rollback is the normal response;
   destructive database rollback is not automatic. Every destructive migration
   requires a verified backup and a written recovery step.
7. Keep `prisma migrate deploy` for applying committed migrations and never use
   `prisma db push` against shared preview or production databases.

### 7. Health, observability, and incident detection

1. Add stable HTTP endpoints suitable for external monitoring:
   - `GET /api/health/live` returns success when the process can serve HTTP and
     performs no dependency calls.
   - `GET /api/health/ready` performs a minimal Postgres query with a short
     timeout and returns non-2xx when the database is unavailable.
2. Health responses must not expose connection strings, provider responses,
   stack traces, internal hostnames, or user data.
3. Add a request/correlation id to API and upload error logs. Include route,
   deployment environment, release identifier, and normalized error category;
   exclude bodies, cookies, authorization headers, passwords, OAuth tokens,
   service-role keys, and unnecessary PII.
4. Configure external uptime monitoring against readiness and alert on
   sustained failures. Document the monitor owner and notification channel in
   a deployment runbook without committing private contact details.
5. Configure error alerting for unexpected server errors and repeated cleanup,
   migration, or backup failures. Console collection alone is insufficient
   unless an external alert consumes those logs.
6. Write a short incident runbook covering database outage, Storage outage,
   failed migration, elevated 5xx rate, and credential compromise.

### 8. Production configuration validation

1. In production, require `AUTH_SECRET`, `DATABASE_URL`, and `DIRECT_URL` as
   today, and also require the Supabase URL, service-role key, and bucket while
   uploads are a supported feature.
2. Validate each OAuth provider as an all-or-nothing pair. If either client id
   or client secret is present, both are required. Register a provider only
   when its complete pair is configured.
3. Production startup/build must fail with a clear variable name when required
   configuration is absent or malformed; it must never echo the secret value.
4. Document which values belong to Development, Preview, and Production in
   Vercel, including the requirement that preview resources are isolated.
5. Keep `.env`, exported environment files, database dumps, service-role keys,
   and backup credentials out of Git.
6. Add a production configuration test that validates representative complete,
   missing, partial-provider, and malformed configurations.

### 9. Dependency maintenance

1. Upgrade `sharp` to a version that resolves GHSA-f88m-g3jw-g9cj and confirm
   the installed tree, not only `package.json`, contains the patched version.
2. Upgrade `next-auth` to at least the first patched beta for
   GHSA-5jpx-9hw9-2fx4, then rerun all credentials and OAuth tests. Prefer a
   current supported release compatible with this Next version rather than the
   minimum version when practical.
3. Resolve the vulnerable nested PostCSS version through a supported Next
   upgrade or another supported dependency resolution. Do not use an override
   that violates the parent package's compatibility range without verification.
4. Enable automated dependency-update PRs for npm and GitHub Actions at a
   manageable cadence.
5. Record why a reported advisory is not applicable when it cannot be upgraded
   immediately; `npm audit fix --force` must not be run blindly.

### 10. Backup and recovery

1. Document the active Supabase plan's database backup behavior, retention,
   expected recovery point objective, and expected recovery time objective.
2. If the project is on a tier without automatic daily backups, schedule
   encrypted off-site logical database exports. Do not store dumps in the
   repository or on a public bucket.
3. Supabase database backups do not include Storage objects. Implement a
   separate versioned backup/export policy for finalized Storage objects or
   explicitly document and accept their loss characteristics.
4. Back up enough object metadata to reconnect restored database rows to
   restored objects.
5. Perform and document a restore drill into a non-production project before
   public launch and at least twice per year thereafter.
6. Verify backups before destructive migrations and before bulk cleanup jobs.

### 11. Password recovery

1. Before credentials accounts are considered durable, collect and verify a
   unique email address or explicitly remove credentials signup in favor of
   recoverable OAuth-only accounts.
2. Password-reset tokens must be generated with a cryptographically secure
   random source, stored only as hashes, expire within one hour, be single-use,
   and be invalidated after a successful reset.
3. Reset request and consumption endpoints must be rate-limited atomically by
   both account/email and trusted source address.
4. Reset requests must return the same response whether or not the account
   exists.
5. A successful reset must revoke or invalidate existing sessions as supported
   by the chosen session design.
6. Never log reset tokens or include them in analytics/referrer-bearing pages.

### 12. Account and personal-data deletion

1. Add an authenticated deletion flow requiring recent reauthentication for
   credentials users or a fresh provider confirmation for OAuth-only users.
2. Deletion must cover the user, projects, layouts, reports where legally
   appropriate, OAuth links/intents, rate-limit/account-security records, and
   all owned Storage objects.
3. Use a retryable deletion job/state rather than claiming completion while
   Storage cleanup is still failing.
4. Define whether moderation/audit records are deleted, anonymized, or retained
   and for how long. Do not make this decision implicitly through cascade rules.
5. The operation must be idempotent and auditable without retaining deleted
   profile content or secrets in logs.

## Constraints

- Preserve all existing private/banned visibility and ownership checks.
- Preserve current upload content validation; moving bytes out of the Function
  path must not turn client-declared MIME type into a trust boundary.
- Do not expose Supabase service-role credentials to the browser.
- Do not run destructive database commands or production migrations while
  implementing or testing this spec without explicit approval and a verified
  backup.
- Prefer Postgres/Prisma and existing Supabase/Vercel capabilities before
  adding paid infrastructure. A new service is acceptable only when its
  operational value and cost are documented.
- Keep changes incremental. This spec may be delivered as multiple pull
  requests in P0/P1/P2 order, but no checked definition-of-done item may depend
  on an undocumented manual action.
- Tests that need a real Postgres concurrency boundary must run against an
  isolated test database, never the developer or production database.
- No UI redesign is required.

## Edge Cases

- A user starts an upload, closes the browser, and never finalizes it: staging
  cleanup removes it after expiration and no quota remains permanently held.
- Two finalization requests arrive for one intent: exactly one application
  record is created and both successful callers receive that record.
- A user uploads valid magic bytes with a false extension or MIME type: the
  server-observed type controls acceptance and stored metadata.
- Supabase accepts an upload but final validation or the database write fails:
  the object is queued for cleanup and can be retried safely.
- Project deletion succeeds in Postgres while Storage is unavailable: the
  pending deletion remains observable and is retried.
- Multiple requests hit a rate-limit threshold simultaneously: the number
  allowed is bounded by the atomic database decision.
- An attacker submits forged forwarding headers: only the trusted platform
  boundary contributes to the source identifier.
- New rows are inserted while a caller paginates: ordering remains stable and
  records are not duplicated within a cursor traversal.
- A preview branch includes a migration: it uses only the preview database and
  cannot reach production credentials.
- A production build fails: no incompatible migration has made the currently
  serving application unusable.
- Postgres is down while the process is alive: liveness succeeds, readiness
  fails, and monitoring alerts.
- Storage is down: existing non-media pages remain usable where possible;
  uploads fail with a bounded, non-secret error and generate an alertable log.
- One OAuth credential in a pair is missing: production validation fails before
  deployment rather than exposing a broken provider.
- A backup restores database metadata but not Storage: the restore drill must
  detect and report the inconsistency.
- A deletion job is retried after partial completion: already-deleted rows and
  objects do not make the job fail permanently or delete another user's data.

## Verification

Run the following against an isolated development/test environment:

```powershell
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
npx prisma validate
```

Additional required verification:

1. Deploy a preview using preview-only database and Storage resources. Confirm
   no production migration or data change occurs.
2. Upload files just below and above the 4.5 MB Vercel Function limit and prove
   both supported files succeed because their bytes travel directly to
   Storage, not through the Function.
3. Attempt unsupported, mislabeled, oversized, expired-intent, cross-user, and
   over-quota uploads; confirm rejection and eventual object cleanup.
4. Run concurrent rate-limit and quota-finalization integration tests against
   Postgres.
5. Seed enough projects, users, reports, and hashtags to span multiple pages;
   verify bounded queries and inspect representative query plans.
6. Stop or point away the test database and confirm liveness/readiness diverge
   correctly without leaking connection details.
7. Trigger a controlled server error and a cleanup failure in preview; confirm
   correlation ids appear and the configured alert reaches its test target.
8. Restore a database backup and Storage backup into a new non-production
   project and verify referential consistency plus representative media access.

## Definition of Done

### P0 — Deployment gate

- [ ] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass
      from a clean checkout under documented environment setup.
- [ ] CI and production promotion require those checks.
- [ ] No supported upload sends file bytes through a Vercel Function.
- [ ] 10 MB images and 50 MB videos can complete through direct-to-Storage
      upload and server-side finalization.
- [ ] Applicable high/critical production dependency findings are resolved or
      covered by a committed, time-bounded exception.
- [ ] Preview builds cannot migrate or access production resources.

### P1 — Public traffic readiness

- [ ] Upload intents are expiring, single-use, user-bound, and finalized only
      after server-side size/type/signature verification.
- [ ] Per-user upload throttling and finalized-byte quota are enforced under
      concurrency.
- [ ] Uploaded objects have durable bucket/path ownership metadata.
- [ ] Replacement, deletion, failed finalization, and abandoned staging paths
      all converge on retryable Storage cleanup.
- [ ] Login and reusable rate-limit counters are atomic and have real Postgres
      concurrency coverage.
- [ ] All growing public/admin lists are cursor-paginated and nested results are
      bounded.
- [ ] Popular hashtag computation no longer loads every project's hashtags
      into application memory.
- [ ] Production migrations are serialized, environment-gated, and documented
      as expand/contract releases.
- [ ] Liveness and database-backed readiness endpoints behave correctly.
- [ ] External uptime/error alerting and incident ownership are documented and
      tested.
- [ ] Production configuration rejects missing storage settings and partial
      OAuth pairs without printing secrets.
- [ ] Database and Storage recovery policies are documented and a non-production
      restore drill succeeds.

### P2 — Durable account readiness

- [ ] Credentials accounts have a verified, enumeration-safe, rate-limited
      password-reset flow, or credentials signup is disabled.
- [ ] Users can request authenticated deletion of their account and owned data.
- [ ] Deletion is idempotent, retries external cleanup, and follows an explicit
      retention/anonymization policy.

## Documentation Deliverables

- Update `README.md` with the local release checks, direct-upload architecture,
  required environment variables, and migration workflow.
- Add a deployment runbook covering environment isolation, migration release,
  health monitoring, alerts, rollback, credential rotation, cleanup failures,
  and backup restoration.
- Document all scheduled cleanup/reconciliation jobs, how to run them manually,
  and how to verify their last successful execution.
- Record external dashboard configuration that cannot live in Git as a
  checklist containing setting names and expected behavior, never secret
  values.
