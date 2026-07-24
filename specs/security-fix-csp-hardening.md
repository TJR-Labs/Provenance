# Harden Content-Security-Policy (Remove unsafe-inline/unsafe-eval) — Spec

## Objective
`next.config.js` sets a `Content-Security-Policy` whose `script-src` includes
`'unsafe-inline'` and `'unsafe-eval'`. The app renders user-influenced HTML
in a few places (sanitized custom profile CSS, sanitized canvas rich text),
protected today by allowlist sanitizers rather than by CSP. Because
`script-src` currently allows inline scripts and `eval`, CSP provides no
backstop if one of those sanitizers is ever bypassed — a future sanitizer bug
would let injected script execute freely. Tighten `script-src` to drop
`'unsafe-inline'`/`'unsafe-eval'` so CSP becomes a real second layer of
defense. Full detail in `SECURITY_AUDIT.md` finding #2.

## Requirements
1. Remove `'unsafe-inline'` and `'unsafe-eval'` from the `script-src` directive in `next.config.js`.
2. The one legitimate inline script in the app — `themeInitScript` in `src/app/layout.tsx` (sets the initial theme before paint) — must continue to run, using a CSP-compliant mechanism: either a per-request nonce (`script-src 'self' 'nonce-<value>'`, with the nonce generated in middleware and threaded to `<script nonce={nonce}>`) or a static SHA-256 hash source (`script-src 'self' 'sha256-<hash>'`) since the script's content is fixed and doesn't change at runtime.
3. Verify no other inline `<script>` tags or inline event-handler attributes (`onclick=`, etc.) exist anywhere in `src/` that would break under the tightened policy; if any are found, convert them to CSP-compliant equivalents (external script, nonce, or removing the inline handler in favor of a React event handler).
4. `style-src 'unsafe-inline'` may remain as-is — it is out of scope for this spec (Tailwind/inline `style={{...}}` usage depends on it and removing it is a separate, larger effort not covered by the audit finding).
5. After the change, the app must build and run in dev and production mode without CSP violations blocking normal functionality (theme toggle on load, canvas editor rich text rendering, custom profile CSS rendering).

## Constraints
- No new runtime dependencies. If a nonce approach is used, it must use Next.js's supported middleware-based nonce pattern (no third-party CSP middleware package).
- Do not weaken any other existing CSP directive (`default-src`, `object-src`, `frame-ancestors`, etc.) while making this change.
- Do not change `themeInitScript`'s behavior (the theme-flash-prevention logic itself), only how it's permitted to execute under CSP.

## Edge Cases
- Dev server (`next dev`) vs. production build (`next build && next start`) may compute/serve headers differently — the chosen approach (nonce or hash) must work correctly in both.
- If a nonce approach is chosen, the nonce must be unique per request/response and must not be cacheable/reused in a way that lets an attacker predict or reuse it (standard Next.js middleware nonce generation via `crypto.randomUUID()`/`randomBytes` satisfies this).
- If a hash approach is chosen instead, any future edit to `themeInitScript`'s exact string must update the hash too — leave a short comment noting this coupling so it isn't missed later.

## Definition of Done
- [ ] `script-src` in `next.config.js` no longer includes `'unsafe-inline'` or `'unsafe-eval'`.
- [ ] The theme-init script in `src/app/layout.tsx` still runs on every page load with no flash-of-wrong-theme regression, via a CSP-compliant nonce or hash.
- [ ] Manually loading the app in a browser (or an automated check) shows no CSP violation errors in the console for normal usage: page load, theme toggle, viewing a profile with custom CSS, viewing a profile with canvas rich-text elements.
- [ ] No other inline scripts/handlers in `src/` are newly broken by the tightened policy.
- [ ] `SECURITY_AUDIT.md` finding #2 can be marked resolved.
