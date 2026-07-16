import "~/styles/globals.css";

import type { Metadata } from "next";
import { Newsreader, Spline_Sans, Spline_Sans_Mono } from "next/font/google";
import Link from "next/link";

import { Role } from "../../generated/prisma";
import { TRPCReactProvider } from "~/trpc/react";
import { auth, signOut } from "~/server/auth";
import { ThemeToggle } from "./theme-toggle";

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
});

const splineSans = Spline_Sans({
  subsets: ["latin"],
  variable: "--font-spline-sans",
});

const splineSansMono = Spline_Sans_Mono({
  subsets: ["latin"],
  variable: "--font-spline-mono",
});

export const metadata: Metadata = {
  title: "Provenance",
  description:
    "Build a public portfolio and discover what other people create.",
};

// Runs before paint: applies the persisted theme (or the system preference)
// so there is never a flash of the wrong theme.
const themeInitScript = `(function(){var d=document.documentElement;var t=null;try{t=localStorage.getItem("pv-theme")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}d.setAttribute("data-theme",t)})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${newsreader.variable} ${splineSans.variable} ${splineSansMono.variable} h-full`}
    >
      <body className="bg-canvas text-ink min-h-full font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <TRPCReactProvider>
          <div className="flex min-h-screen flex-col">
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
                        href="/projects/new"
                        className="text-muted hover:text-ink font-medium transition-colors"
                      >
                        New project
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
            <main className="flex flex-1 flex-col">{children}</main>
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
          </div>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
