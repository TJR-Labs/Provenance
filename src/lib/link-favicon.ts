// Favicon comes from a third-party favicon-by-domain service via a plain
// client-rendered <img> request — the server never fetches the target URL.
// The service redirects to a gstatic.com host to serve the icon, so both hosts
// are allowlisted in the CSP's img-src (see src/middleware.ts).
export function faviconUrl(linkUrl: string) {
  try {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
      new URL(linkUrl).hostname,
    )}`;
  } catch {
    return null;
  }
}
