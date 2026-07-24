# Missing `@react-email/render` Dependency — Spec

## Objective

Multiple local pages currently return HTTP 500 in dev (`/`, `/signup`,
`/forgot-password`, `/my-work`, and any other route whose server component
chain reaches `src/server/email.ts`). Root cause: `src/server/email.ts`
statically imports `Resend` from the `resend` package (v6.1.0), and `resend`'s
own compiled code does `import("@react-email/render")` inside its internal
`render()` function. Next.js's dev/build bundler must resolve every dynamic
`import()` reachable from a page's module graph at compile time (for chunk
splitting), even though the code only executes at runtime — and
`@react-email/render` is not installed and not listed in `package.json` at
all. The result is a hard compile-time "Module not found" error that crashes
the page, regardless of whether `RESEND_API_KEY` is set (the existing
`if (!env.RESEND_API_KEY || !env.EMAIL_FROM)` guard in `email.ts:41` never
even gets a chance to run).

Target: the app owner running the app locally pre-launch, with no email
domain/Resend account configured yet. Success = the affected pages load
normally locally, and a regression check exists so this failure mode can't
silently reappear (the existing 520-test suite currently passes despite the
pages being broken, because vitest's module resolution doesn't reproduce
Next's bundler behavior here).

This is a dependency-only fix. It does not set up email sending, does not
require a Resend account/domain, and does not change any email-sending logic.

## Requirements

1. Add `@react-email/render` as a real dependency in `package.json` (and
   update `package-lock.json` accordingly via `npm install`), at a version
   compatible with `resend@^6.1.0`'s peer expectations.
2. No changes to `src/server/email.ts`'s logic, the `RESEND_API_KEY`/
   `EMAIL_FROM` guard, or any other file's email-sending behavior — this is
   purely closing the missing-dependency gap.
3. Add a regression test that asserts `@react-email/render` resolves as a
   module (e.g. via `require.resolve` or a dynamic `import()` inside a
   `try`/expect-not-to-throw), placed near the existing test suite (co-located
   with `src/server/email.ts` or in a small standalone test file). This test
   must fail if the dependency is ever removed from `package.json`/
   `node_modules` again, independent of whether `RESEND_API_KEY` is set.

**Explicitly deferred (not in this build):**
- Configuring a real Resend sending domain or `RESEND_API_KEY`/`EMAIL_FROM`
  for local/dev use — `.env.example`'s existing documented behavior (leave
  both unset to skip delivery while still creating hashed tokens) is correct
  and unaffected by this fix.
- Any broader "does every page compile cleanly" build-time smoke test beyond
  the specific dependency-resolution check in Requirement 3 — narrowly
  targeted at the actual failure mode, not a general CI hardening pass.

## Constraints

- No new dependencies beyond `@react-email/render` itself.
- Must not change observable email-sending behavior in any environment
  (local, test, or production) — production already has `RESEND_API_KEY`
  unset per current deployment state, and must continue to no-op identically
  after this fix.
- Regression test must not require network access, a real Resend API key, or
  a running dev server — it only needs to prove the package resolves.

## Edge Cases

| Situation | Expected behavior |
|---|---|
| `RESEND_API_KEY`/`EMAIL_FROM` unset (current local state) | Affected pages compile and render normally; `email.ts`'s existing guard still short-circuits before any real send attempt, exactly as documented in `.env.example`. |
| `RESEND_API_KEY`/`EMAIL_FROM` set (future production-like config) | Email sending code path is reachable and `resend`'s internal `render()` call can resolve `@react-email/render` successfully instead of throwing at runtime. |
| Dependency accidentally removed again later (e.g. a future `npm prune` or manual edit) | The new regression test fails immediately in the test suite, rather than only surfacing as a page-level 500 discovered by manually clicking through the app. |

## Definition of Done

- [ ] `@react-email/render` appears in `package.json` dependencies and is
      present in `node_modules` after `npm install`.
- [ ] `package-lock.json` reflects the new dependency.
- [ ] Locally, with `.env` unchanged (no `RESEND_API_KEY`/`EMAIL_FROM` set),
      `npm run dev` and visiting `/`, `/signup`, `/forgot-password`, and
      `/my-work` (after logging in) all return HTTP 200, not 500.
- [ ] A new regression test exists that asserts `@react-email/render`
      resolves as a module, and it fails if the package is manually removed
      from `node_modules` (verify this by temporarily removing it and
      confirming the test goes red, then reinstalling).
- [ ] Full existing test suite still passes (520+ tests, excluding the
      pre-existing unrelated `rate-limit.integration.test.ts` DB-env
      failure).
- [ ] `npm run typecheck` passes with no new errors.
