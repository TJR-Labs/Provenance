"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "~/trpc/react";
import { OnboardingShell } from "../onboarding-shell";

const CONNECTORS = [
  "GitHub",
  "Behance",
  "YouTube",
  "Vimeo",
  "App Store",
  "Paste URL",
] as const;

export default function OnboardingImportPage() {
  const router = useRouter();
  const profile = api.profile.me.useQuery();
  const [importNote, setImportNote] = useState("");
  const dismissOnboarding = api.profile.dismissOnboarding.useMutation({
    onSuccess: () => {
      if (profile.data?.username) {
        router.push(`/${profile.data.username}`);
      }
    },
  });
  const finishDisabled = !profile.data?.username || dismissOnboarding.isPending;

  function showComingSoon() {
    setImportNote("Coming soon — imports aren't wired up yet.");
  }

  function finishOnboarding() {
    dismissOnboarding.mutate();
  }

  return (
    <OnboardingShell
      title="Bring work you already have"
      subtitle="Optional — populate your portfolio in under five minutes."
      footerNote="3 / 3 · NEXT: MY SITE"
    >
      <div className="flex w-full max-w-4xl flex-col items-center gap-7">
        <div>
          <div className="flex flex-wrap justify-center gap-3">
            {CONNECTORS.map((connector) => (
              <button
                key={connector}
                type="button"
                onClick={showComingSoon}
                className={`bg-surface hover:bg-raised text-ink flex items-center gap-2.5 rounded-lg px-4.5 py-3 text-sm font-medium transition-colors ${
                  connector === "GitHub"
                    ? "border-accent border-2"
                    : "border-line-strong border"
                }`}
              >
                {connector}
              </button>
            ))}
          </div>
          {importNote ? (
            <p className="text-muted mt-2 text-sm">{importNote}</p>
          ) : null}
        </div>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={finishDisabled}
            onClick={finishOnboarding}
            className="text-muted hover:text-ink rounded-md px-4 py-2 font-semibold transition-colors disabled:opacity-50"
          >
            Skip for now
          </button>
          <button
            type="button"
            disabled={finishDisabled}
            onClick={finishOnboarding}
            className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-4 py-2 font-semibold transition-colors disabled:opacity-50"
          >
            Generate my site
          </button>
        </div>
      </div>
    </OnboardingShell>
  );
}
