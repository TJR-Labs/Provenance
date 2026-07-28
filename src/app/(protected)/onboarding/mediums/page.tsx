"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { OnboardingShell } from "../onboarding-shell";

const MEDIUMS = [
  "Software",
  "Graphic design",
  "Mech design",
  "Music",
  "Video",
  "Physical",
  "Writing",
  "Photography",
] as const;

export default function OnboardingMediumsPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  function toggleMedium(medium: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(medium)) {
        next.delete(medium);
      } else {
        next.add(medium);
      }
      return next;
    });
  }

  function continueToTheme() {
    const mediums = Array.from(selected).join(",");
    router.push(`/onboarding/theme?mediums=${encodeURIComponent(mediums)}`);
  }

  return (
    <OnboardingShell
      title="What do you make?"
      subtitle="Pick your mediums — we fill a beautiful site before you touch the editor."
      footerNote="1 / 3 · NEXT: PICK A THEME"
    >
      <div className="flex w-full max-w-3xl flex-col items-center gap-7">
        <div className="flex flex-wrap justify-center gap-2.5">
          {MEDIUMS.map((medium) => {
            const isSelected = selected.has(medium);
            return (
              <button
                key={medium}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggleMedium(medium)}
                className={
                  isSelected
                    ? "bg-accent text-on-accent rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
                    : "border-line-strong text-muted hover:bg-raised hover:text-ink rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
                }
              >
                {medium}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={continueToTheme}
          className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-4 py-2 font-semibold transition-colors"
        >
          Continue
        </button>
      </div>
    </OnboardingShell>
  );
}
