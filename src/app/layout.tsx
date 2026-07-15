import "~/styles/globals.css";

import { type Metadata } from "next";
import Link from "next/link";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Provenance",
  description: "Engineers discovered through real work — not resumes.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
                <div
                  data-slot="nav-links"
                  className="flex items-center gap-6"
                />
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
