import "~/styles/globals.css";

import { type Metadata } from "next";
import Link from "next/link";

import { Role } from "../../generated/prisma";
import { auth, signOut } from "~/server/auth";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Provenance",
  description: "Engineers discovered through real work — not resumes.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <TRPCReactProvider>
          <div className="flex min-h-screen flex-col">
            <header className="border-b border-slate-800">
              <nav
                aria-label="Primary navigation"
                className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4"
              >
                <Link
                  href="/"
                  className="text-lg font-semibold tracking-tight text-white"
                >
                  Provenance
                </Link>
                <div className="flex items-center gap-5 text-sm">
                  {session ? (
                    <>
                      <Link
                        href="/briefs"
                        className="text-slate-300 hover:text-white"
                      >
                        Briefs
                      </Link>
                      {session.user.role === Role.COMPANY ? (
                        <Link
                          href="/company"
                          className="text-slate-300 hover:text-white"
                        >
                          Company
                        </Link>
                      ) : null}
                      {session.user.role === Role.ADMIN ? (
                        <Link
                          href="/admin/users"
                          className="text-slate-300 hover:text-white"
                        >
                          Users
                        </Link>
                      ) : null}
                      <Link
                        href="/account"
                        className="text-slate-300 hover:text-white"
                      >
                        Account
                      </Link>
                      <span className="hidden text-right sm:block">
                        <span className="block text-slate-100">
                          {session.user.displayName}
                        </span>
                        <span className="block text-xs text-slate-400">
                          {session.user.role}
                        </span>
                      </span>
                      <form
                        action={async () => {
                          "use server";
                          await signOut({ redirectTo: "/" });
                        }}
                      >
                        <button
                          type="submit"
                          className="text-slate-300 hover:text-white"
                        >
                          Log out
                        </button>
                      </form>
                    </>
                  ) : (
                    <Link
                      href="/login"
                      className="text-slate-300 hover:text-white"
                    >
                      Log in
                    </Link>
                  )}
                </div>
              </nav>
            </header>
            <main className="flex flex-1 flex-col">{children}</main>
            <footer className="border-t border-slate-800 px-6 py-6 text-center text-sm text-slate-400">
              Provenance
            </footer>
          </div>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
