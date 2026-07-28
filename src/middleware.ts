import { NextResponse, type NextRequest } from "next/server";

// Generates a fresh, unpredictable per-request nonce and uses it to build the
// Content-Security-Policy header. This is the standard Next.js
// middleware-based nonce pattern (no third-party CSP package):
// https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
//
// script-src intentionally omits 'unsafe-inline'/'unsafe-eval' so CSP remains
// a real backstop against XSS if the HTML/CSS sanitizers (sanitizeCanvasText,
// sanitizeCustomCss) are ever bypassed. The one legitimate inline script —
// themeInitScript in src/app/layout.tsx, which prevents a flash of the wrong
// theme on load — is allow-listed via this nonce (threaded through via the
// `x-nonce` request header and read with `headers()` in layout.tsx) instead
// of by 'unsafe-inline'.
//
// A nonce (rather than a static hash) is required here because Next.js's App
// Router also injects its own inline scripts per request (RSC streaming
// payloads, hydration data) whose content differs on every request/page —
// those can only be allow-listed by a nonce, and Next.js automatically
// applies this same nonce to its own inline scripts once it reads it back off
// the Content-Security-Policy response header.
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // 'unsafe-eval' is added to script-src ONLY in `next dev` (never in a
  // production build/start): Next.js's dev-mode bundler (Turbopack/webpack)
  // wraps modules in `eval(...)` for fast refresh and inline source maps, so
  // dev mode is blocked without it. No app code under src/ uses eval/new
  // Function (verified — grep found none), so this exception has no effect
  // on the actual security posture of what ships to production.
  // PostHog's asset host is allowed for lazy-loaded SDK resources.
  const scriptSrc =
    process.env.NODE_ENV === "production"
      ? `'self' 'nonce-${nonce}' https://us-assets.i.posthog.com`
      : `'self' 'nonce-${nonce}' 'unsafe-eval' https://us-assets.i.posthog.com`;

  // img-src allows www.google.com and *.gstatic.com: the canvas Link
  // element's third-party favicon-by-domain lookup (s2/favicons) redirects to
  // a gstatic.com host to serve the actual icon — see
  // specs/canvas-editor-refinements.md requirement 7.
  //
  // frame-src exists solely for the Embed block: without it, `default-src
  // 'self'` would block every iframe the editor lets a user place. It is a
  // narrow allowlist and MUST stay byte-for-byte in sync with
  // EMBED_ALLOWED_HOSTS in src/lib/site-style.ts, which is what the editor and
  // the server-side zod schema validate embedUrl against. If a host is added
  // or removed there, change it here too — otherwise an embed the app happily
  // saves will silently fail to render behind CSP.
  const cspHeader = `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://www.google.com https://*.gstatic.com; frame-src https://www.youtube.com https://player.vimeo.com https://codepen.io https://www.figma.com https://open.spotify.com https://www.loom.com; font-src 'self'; connect-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("Content-Security-Policy", cspHeader);

  return response;
}

export const config = {
  matcher: [
    // Run on every request except Next.js's own static asset routes, which
    // don't render HTML and don't need a CSP nonce.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
