# Fix Login Open Redirect — Spec

## Objective
`src/app/login/page.tsx` accepts a `returnTo` query parameter and redirects
there after a successful login (both credentials and OAuth). The current
validation (`startsWith("/") && !startsWith("//")`) blocks the
protocol-relative `//host` form but not backslash variants (`/\evil.com`,
`/\/evil.com`), which browsers normalize to `//evil.com` for special
(http/https) schemes — turning the "same-origin" check into an open
redirect. An attacker can send a victim a link to the real login page that,
after a legitimate successful login, redirects them to an attacker-controlled
domain (phishing/malware), which is far more convincing than a cold phishing
link because it follows a real, successful authentication.

Fix the validation so only genuine same-origin relative paths are accepted,
with no bypass via backslashes, mixed slash/backslash sequences, or other
browser URL-normalization quirks. Full detail and a suggested fix are in
`SECURITY_AUDIT.md` finding #1.

## Requirements
1. Add a single shared helper (e.g. `safeReturnTo(value: string | undefined): string`) that returns a safe, same-origin relative path, defaulting to `"/"` for anything invalid.
2. The helper must reject:
   - Values that don't start with `/`.
   - Values starting with `//` (protocol-relative).
   - Any value containing a backslash (`\`) anywhere in the string (covers `/\evil.com`, `/\/evil.com`, `/a/\evil.com`, and encoded-then-decoded variants once the query string is parsed).
   - Values that parse as an absolute URL with a different origin (defense in depth beyond the string checks above).
3. `src/app/login/page.tsx` must use this helper for the `returnTo` query parameter instead of its current inline check, for both the value passed to `signIn(...)` and the value passed to `<OAuthButtons redirectTo=...>`.
4. The error-redirect path in the same file (`redirect(/login?error=invalid-credentials&returnTo=...)`) must re-use the same sanitized value, not the raw query parameter.
5. Behavior for legitimate same-origin paths (e.g. `/profile/edit`, `/some-username`) must be unchanged — no regression to normal post-login redirects.

## Constraints
- No new dependencies; this is pure string/URL validation.
- Do not change the shape of `LoginPageProps` or introduce new query parameters.
- Keep the fix isolated to the return-URL validation logic; do not refactor unrelated parts of the login page.
- Must not break existing tests; if a test file for this page/flow exists, it must still pass, and add test coverage for the bypass case if a test file exists for this component (check for `src/app/login/page.test.tsx` or similar before deciding whether to add one).

## Edge Cases
- `returnTo` missing entirely → defaults to `/`.
- `returnTo=/\evil.com` → rejected, defaults to `/`.
- `returnTo=/\/evil.com` → rejected, defaults to `/`.
- `returnTo=//evil.com` → rejected, defaults to `/` (already handled, must not regress).
- `returnTo=/profile/edit` → accepted unchanged.
- `returnTo=https://evil.com` → rejected (doesn't start with `/`).
- `returnTo=/a%5Cevil.com` (URL-encoded backslash) → since Next.js decodes query params before this code sees them, this must also be rejected by the same backslash check.

## Definition of Done
- [ ] A shared `safeReturnTo` (or equivalently named) helper exists and is the single place this validation logic lives.
- [ ] `src/app/login/page.tsx` uses it for every use of `returnTo` (initial redirect target, OAuth button redirect, and the error-retry redirect).
- [ ] A test (unit or component test) exercises at least the backslash-bypass case and asserts the result is `/`, alongside a case proving a normal relative path still passes through unchanged.
- [ ] Existing login-related tests still pass.
- [ ] `SECURITY_AUDIT.md` finding #1 can be marked resolved (no code change to that file required, just confirm the fix matches the described remediation).
