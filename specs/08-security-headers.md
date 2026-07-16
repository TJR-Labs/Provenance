# Security Headers — Spec

## Objective
`next.config.js` currently sets no HTTP security headers at all — no CSP, no
clickjacking protection, no MIME-sniffing protection. This spec adds a
baseline set of response headers to every route using Next.js's native
`headers()` config, no new dependency. Success: the deployed app can't be
framed by another site, browsers won't MIME-sniff responses, and a reasonable
default CSP is in place without breaking the app.

## Requirements
Must-have. Add an async `headers()` function in `next.config.js` applying to
`source: "/:path*"`:
1. `X-Content-Type-Options: nosniff`
2. `X-Frame-Options: DENY`
3. `Referrer-Policy: strict-origin-when-cross-origin`
4. `Permissions-Policy` disabling unused sensor/media APIs the app never uses:
   `camera=(), microphone=(), geolocation=()`
5. `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
   (safe to send always — browsers only enforce it over HTTPS, and Vercel
   serves production over HTTPS by default).
6. `Content-Security-Policy`: `default-src 'self'; script-src 'self'
   'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src
   'self' data:; font-src 'self'; connect-src 'self'; object-src 'none';
   base-uri 'self'; frame-ancestors 'none'`. (`'unsafe-eval'`/`'unsafe-inline'`
   on script-src are required for Next.js dev-mode HMR and current App Router
   inline bootstrap scripts — see Deferred.)

Deferred: nonce- or hash-based strict CSP that drops `'unsafe-inline'`/
`'unsafe-eval'` from `script-src` — meaningfully more secure but needs
per-request nonce plumbing through middleware and every inline script; not
worth it before the app has real public traffic. `report-uri`/CSP violation
reporting endpoint.

## Constraints
- Native Next.js config only (`next.config.js` `headers()`) — no new
  dependency, no middleware required.
- Must not break existing functionality: login form, tRPC fetch calls
  (same-origin), Tailwind-generated styles, Next's built-in dev/HMR scripts.

## Edge Cases
- `npm run dev`: HMR and live reload must keep working with these headers in
  place (the permissive script-src covers this).
- A page that legitimately needs to be embedded (none currently exist) would
  need a header override — not needed today, note it as a known limitation if
  it ever comes up.
- Static assets (`/favicon.ico`, `_next/static/*`) still get the headers via
  the wildcard match; confirm this doesn't break asset loading.

## Definition of Done
- [ ] `next.config.js` returns the header set above for all paths.
- [ ] `npm run dev`: clicking through login → briefs → a submission form →
      inbox produces no CSP violations in the browser console that break
      rendering or functionality.
- [ ] `npm run build && npm start`, then `curl -I http://localhost:3000/`
      shows all six headers present on the response.
- [ ] `npm run build` passes clean.
