# Production Logging — Spec

## Objective
Two related logging gaps found in the deploy-readiness review, both in the
tRPC request path: (1) `timingMiddleware` in `src/server/api/trpc.ts` logs a
line for *every* request in *every* environment, including production, even
though the artificial delay right next to it is already dev-only — that's
unbounded log noise/cost with no value in prod. (2) the tRPC `onError` handler
in `src/app/api/trpc/[trpc]/route.ts` only logs when
`env.NODE_ENV === "development"` — in production it's `undefined`, so a
failing request today leaves **zero** server-side trace. This spec fixes both
using only `console.*`, since Vercel already collects stdout/stderr from
serverless functions — no new logging service or dependency.

## Requirements
Must-have:
1. `timingMiddleware` (`src/server/api/trpc.ts`): only emit the
   `[TRPC] ${path} took ${end - start}ms` log line when `t._config.isDev` is
   true (the same condition already gating the artificial delay above it).
   Production stops logging per-request timing entirely.
2. `onError` (`src/app/api/trpc/[trpc]/route.ts`): always run (remove the
   `env.NODE_ENV === "development" ? ... : undefined` gate), so every
   environment logs failing requests via `console.error`, including the path,
   `error.message`, and `error.cause` when present.
3. Keep the logged content limited to path + error message/cause — no request
   body, headers, or session/user data (avoid logging PII or secrets).

Deferred: a real APM/error-tracking service (Sentry or similar). `ponytail:`
console logging captured by the host's platform logs is enough for current
scale; add a tracking service if error volume or the need to search/alert on
errors ever outgrows grepping logs.

## Constraints
- No new dependency — `console.log`/`console.error` only.
- Don't change what gets logged in dev mode (timing log stays as-is there);
  only production behavior changes.

## Edge Cases
- A request that throws a client-facing validation error (e.g. Zod) in
  production still gets logged server-side, even though the client sees a
  normal formatted error response — that's intentional (visibility beats
  silence); no attempt to filter "expected" vs. "unexpected" errors is made
  here, since doing that well is a separate, deferred piece of work.
- Dev mode: behavior for both the timing log and the error log is unchanged
  from before this spec.

## Definition of Done
- [ ] `npm run dev`: per-request `[TRPC] ...` timing log still appears
      (unchanged).
- [ ] `npm run build && npm start`: the timing log does **not** appear for
      normal requests; deliberately triggering a tRPC error (e.g. calling a
      protected procedure while signed out) produces a `console.error` line
      with the path and error message.
- [ ] `npm test` passes; if the error-logging change is covered by a unit
      test, it verifies logging happens regardless of `NODE_ENV` — otherwise
      the manual production-mode check above is documented as the
      verification step.
- [ ] `npm run build` passes clean.
