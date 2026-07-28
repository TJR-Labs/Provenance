import type { ReactNode } from "react";

type OnboardingShellProps = {
  title: string;
  subtitle: string;
  footerNote: string;
  children: ReactNode;
};

export function OnboardingShell({
  title,
  subtitle,
  footerNote,
  children,
}: OnboardingShellProps) {
  return (
    <div className="bg-canvas flex min-h-screen flex-col items-center justify-center gap-9 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-3.5">
        <p className="text-accent font-mono text-xs tracking-[0.14em] uppercase">
          PROVENANCE
        </p>
        <h1 className="font-display text-ink max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="text-muted max-w-xl text-lg">{subtitle}</p>
      </div>
      {children}
      <p className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
        {footerNote}
      </p>
    </div>
  );
}
