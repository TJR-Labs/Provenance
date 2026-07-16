import "~/styles/globals.css";

import type { Metadata } from "next";
import Link from "next/link";

import { Role } from "../../generated/prisma";
import { TRPCReactProvider } from "~/trpc/react";
import { auth, signOut } from "~/server/auth";

export const metadata: Metadata = {
  title: "Provenance",
  description:
    "Build a public portfolio and discover what other people create.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="en" className="h-full bg-slate-950">
      <body className="min-h-full bg-slate-950 text-slate-100 antialiased">
        <TRPCReactProvider>
          <div className="flex min-h-screen flex-col">
            <header className="border-b border-slate-800 bg-slate-950/95 px-6 py-4">
              <nav
                className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4"
                aria-label="Main navigation"
              >
                <div className="flex items-center gap-6">
                  <Link
                    href="/"
                    className="text-lg font-bold tracking-tight text-white"
                  >
                    Provenance
                  </Link>
                  <Link
                    href="/"
                    className="text-sm text-slate-300 hover:text-white"
                  >
                    Discover
                  </Link>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-4 text-sm">
                  {session ? (
                    <>
                      <Link
                        href={`/${session.user.username}`}
                        className="text-slate-300 hover:text-white"
                      >
                        My profile
                      </Link>
                      <Link
                        href="/projects/new"
                        className="text-slate-300 hover:text-white"
                      >
                        New project
                      </Link>
                      <Link
                        href="/account"
                        className="text-slate-300 hover:text-white"
                      >
                        Account
                      </Link>
                      {session.user.role === Role.ADMIN ? (
                        <Link
                          href="/admin/reports"
                          className="text-slate-300 hover:text-white"
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
                        <button className="text-slate-300 hover:text-white">
                          Log out
                        </button>
                      </form>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        className="text-slate-300 hover:text-white"
                      >
                        Log in
                      </Link>
                      <Link
                        href="/signup"
                        className="rounded-md bg-sky-400 px-3 py-2 font-semibold text-slate-950 hover:bg-sky-300"
                      >
                        Sign up
                      </Link>
                    </>
                  )}
                </div>
              </nav>
            </header>
            <main className="flex flex-1 flex-col">{children}</main>
            <footer className="border-t border-slate-800 px-6 py-6 text-sm text-slate-400">
              <div className="mx-auto flex w-full max-w-6xl items-center justify-center gap-5">
                <span>Provenance</span>
                <Link href="/terms" className="hover:text-white">
                  Terms
                </Link>
                <Link href="/privacy" className="hover:text-white">
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
