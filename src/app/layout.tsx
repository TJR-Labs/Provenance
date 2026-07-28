import "~/styles/globals.css";

import type { Metadata } from "next";
import {
  Archivo,
  IBM_Plex_Mono,
  Newsreader,
  Schibsted_Grotesk,
} from "next/font/google";
import Link from "next/link";
import { headers } from "next/headers";

import { Role } from "../../generated/prisma";
import { TRPCReactProvider } from "~/trpc/react";
import { auth, signOut } from "~/server/auth";
import { PostHogTracker } from "./posthog-tracker";
import { ThemeToggle } from "./theme-toggle";
import { WorkspaceRail } from "./workspace-rail";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
});

const schibstedGrotesk = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted-grotesk",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: "Provenance",
  description:
    "Build a public portfolio and discover what other people create.",
};

// Runs before paint: applies the persisted theme (or the system preference)
// so there is never a flash of the wrong theme.
//
// This is the only developer-authored inline <script> in the app. It is
// allow-listed under the tightened CSP script-src via a per-request nonce
// (generated in middleware.ts and threaded through here via the `x-nonce`
// request header) rather than 'unsafe-inline'.
const themeInitScript = `(function(){var d=document.documentElement;var t=null;try{t=localStorage.getItem("pv-theme")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}d.setAttribute("data-theme",t)})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isOnboarding = pathname.startsWith("/onboarding");
  const isWorkspace =
    pathname.startsWith("/site") || pathname.startsWith("/profile/canvas");

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${archivo.variable} ${schibstedGrotesk.variable} ${ibmPlexMono.variable} ${newsreader.variable} h-full`}
    >
      <body className="bg-canvas text-ink min-h-full font-sans antialiased">
        <script
          nonce={nonce}
          // Browsers deliberately hide the `nonce` attribute from
          // getAttribute()/outerHTML after the element is parsed (so other
          // scripts can't read and reuse it), which makes React's hydration
          // diff see a mismatch on this attribute even though nothing is
          // actually wrong. suppressHydrationWarning silences that expected,
          // harmless warning without affecting the tightened CSP itself.
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        <PostHogTracker userId={session?.user.id ?? null} />
        <TRPCReactProvider>
          <div className="flex min-h-screen flex-col">
            {!isOnboarding && !isWorkspace && (
              <header className="border-line bg-canvas border-b px-6 py-4">
                <nav
                  className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3"
                  aria-label="Main navigation"
                >
                  <div className="flex items-center gap-6">
                    <Link
                      href="/"
                      className="font-display text-ink text-xl font-semibold tracking-tight"
                    >
                      Provenance<span className="text-brass">.</span>
                    </Link>
                    <Link
                      href="/"
                      className="text-muted hover:text-ink text-sm font-medium transition-colors"
                    >
                      Discover
                    </Link>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-sm">
                    {session ? (
                      <>
                        <Link
                          href={`/${session.user.username}`}
                          className="text-muted hover:text-ink font-medium transition-colors"
                        >
                          My profile
                        </Link>
                        <Link
                          href="/site"
                          className="text-muted hover:text-ink font-medium transition-colors"
                        >
                          My Work
                        </Link>
                        <Link
                          href="/account"
                          className="text-muted hover:text-ink font-medium transition-colors"
                        >
                          Account
                        </Link>
                        {session.user.role === Role.ADMIN ? (
                          <Link
                            href="/admin/reports"
                            className="text-muted hover:text-ink font-medium transition-colors"
                          >
                            Admin reports
                          </Link>
                        ) : null}
                        <form
                          action={async () => {
                            "use server";
                            await signOut({ redirectTo: "/" });
                          }}
                        >
                          <button className="text-muted hover:text-ink font-medium transition-colors">
                            Log out
                          </button>
                        </form>
                      </>
                    ) : (
                      <>
                        <Link
                          href="/login"
                          className="text-muted hover:text-ink font-medium transition-colors"
                        >
                          Log in
                        </Link>
                        <Link
                          href="/signup"
                          className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-3.5 py-2 font-semibold transition-colors"
                        >
                          Sign up
                        </Link>
                      </>
                    )}
                    <ThemeToggle />
                  </div>
                </nav>
              </header>
            )}
            {isWorkspace ? (
              <div className="flex flex-1">
                <WorkspaceRail username={session?.user.username ?? null} />
                <main className="flex min-w-0 flex-1 flex-col">{children}</main>
              </div>
            ) : (
              <main className="flex flex-1 flex-col">{children}</main>
            )}
            {!isOnboarding && !isWorkspace && (
              <footer className="rule-double text-muted px-6 py-8 text-sm">
                <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2">
                  <span className="font-display text-base italic">
                    Provenance
                  </span>
                  <Link
                    href="/terms"
                    className="hover:text-ink transition-colors"
                  >
                    Terms
                  </Link>
                  <Link
                    href="/privacy"
                    className="hover:text-ink transition-colors"
                  >
                    Privacy
                  </Link>
                </div>
              </footer>
            )}
          </div>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
