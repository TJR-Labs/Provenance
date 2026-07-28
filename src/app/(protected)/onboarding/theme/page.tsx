"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  SITE_STYLE_PRESET_OPTIONS,
  type SiteStylePreset,
} from "~/lib/site-style";
import { api } from "~/trpc/react";
import { OnboardingShell } from "../onboarding-shell";

const ONBOARDING_THEME_OPTIONS = SITE_STYLE_PRESET_OPTIONS;

export default function OnboardingThemePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mediums = searchParams.get("mediums") ?? "";
  const [selected, setSelected] =
    useState<Exclude<SiteStylePreset, "default">>("cream");
  const setTheme = api.site.setStylePreset.useMutation();

  function goBack() {
    router.push(`/onboarding/mediums?mediums=${encodeURIComponent(mediums)}`);
  }

  function useTheme() {
    setTheme.mutate(
      { preset: selected },
      { onSuccess: () => router.push("/onboarding/import") },
    );
  }

  return (
    <OnboardingShell
      title="Start from a beautiful default"
      subtitle="Themes are starting points — tweak everything after."
      footerNote="2 / 3 · NEXT: BRING YOUR WORK"
    >
      <div className="flex w-full max-w-6xl flex-col items-center gap-7">
        <div className="flex flex-wrap justify-center gap-3">
          {ONBOARDING_THEME_OPTIONS.map((option) => {
            const isSelected = option.value === selected;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelected(option.value)}
                className={`w-44 rounded-xl border p-2.5 text-left transition-colors ${
                  isSelected
                    ? "border-accent border-2"
                    : "border-line hover:border-line-strong"
                }`}
              >
                <span
                  className="flex h-28 flex-col justify-end rounded-lg p-3"
                  style={{ backgroundColor: option.background }}
                >
                  <span
                    className="text-base font-bold"
                    style={{ color: option.ink }}
                  >
                    Alex Rivera
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: option.ink, opacity: 0.65 }}
                  >
                    Builder · designer
                  </span>
                </span>
                <span className="mt-2.5 flex items-center justify-between gap-2 px-0.5">
                  <span className="text-ink text-sm font-medium">
                    {option.label}
                  </span>
                  {isSelected ? (
                    <span className="text-accent font-mono text-xs tracking-[0.14em] uppercase">
                      SELECTED
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={goBack}
            className="text-muted hover:text-ink rounded-md px-4 py-2 font-semibold transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            disabled={setTheme.isPending}
            onClick={useTheme}
            className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-4 py-2 font-semibold transition-colors disabled:opacity-50"
          >
            Use this theme
          </button>
        </div>
        {setTheme.isError ? (
          <p role="alert" className="text-danger text-sm">
            Could not save this theme. Please try again.
          </p>
        ) : null}
      </div>
    </OnboardingShell>
  );
}
