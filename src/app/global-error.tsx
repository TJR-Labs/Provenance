"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- The global error fallback cannot assume Next.js routing works. */

// This fallback replaces the root layout entirely, so it cannot rely on the
// app's stylesheet or fonts. The inline styles mirror the dark "archive"
// palette from src/styles/globals.css.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(error, ...(error.digest ? [`Digest: ${error.digest}`] : []));

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          backgroundColor: "#131714",
          color: "#e9e7db",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <main
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            padding: "6rem 1.5rem",
            boxSizing: "border-box",
            textAlign: "center",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                color: "#cfa45e",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: "0.875rem",
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
              }}
            >
              Provenance
            </p>
            <h1
              style={{
                margin: "1rem 0 0",
                color: "#e9e7db",
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: "2.25rem",
                fontWeight: 600,
                lineHeight: 1.1,
              }}
            >
              Something went wrong.
            </h1>
            <a
              href="/"
              style={{
                display: "inline-flex",
                marginTop: "2rem",
                borderRadius: "0.375rem",
                backgroundColor: "#5fc694",
                padding: "0.5rem 1rem",
                color: "#0e2419",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Return home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
