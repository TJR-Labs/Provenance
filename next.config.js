/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Content-Security-Policy is intentionally NOT set here: it needs a
          // fresh per-request nonce for script-src (so the one legitimate
          // inline script, themeInitScript in src/app/layout.tsx, can run
          // without 'unsafe-inline'), and next.config.js's headers() can only
          // return static values. See middleware.ts for the actual CSP header
          // (same directives as before, script-src hardened to a nonce).
        ],
      },
    ];
  },
  experimental: {
    authInterrupts: true,
  },
};

export default config;
