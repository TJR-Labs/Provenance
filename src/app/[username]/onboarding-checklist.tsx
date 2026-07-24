"use client";

import Link from "next/link";
import { useState } from "react";

import { api } from "~/trpc/react";

type OnboardingChecklistProps = {
  items: { bio: boolean; project: boolean; layout: boolean };
};

const checklistItems = [
  { key: "bio" as const, href: "/profile/edit", label: "Add a bio" },
  {
    key: "project" as const,
    href: "/projects/new",
    label: "Add your first project",
  },
  {
    key: "layout" as const,
    href: "/profile/edit#layout-mode",
    label: "Choose a layout",
  },
];

export function OnboardingChecklist({ items }: OnboardingChecklistProps) {
  const [visible, setVisible] = useState(true);
  const dismiss = api.profile.dismissOnboarding.useMutation();

  if (!visible) return null;

  return (
    <div className="border-line bg-surface mb-8 rounded-lg border p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-ink text-xl font-semibold">
            Finish setting up your profile
          </h2>
          <p className="text-muted mt-1 text-sm">
            A few quick steps will make your portfolio ready to share.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setVisible(false);
            dismiss.mutate();
          }}
          className="text-muted hover:text-ink shrink-0 text-sm font-medium transition-colors"
        >
          Dismiss
        </button>
      </div>
      <ul className="mt-5 space-y-2">
        {checklistItems.map((item) => {
          const complete = items[item.key];
          return (
            <li key={item.key} className="bg-raised rounded-md px-3 py-2.5">
              <Link
                href={item.href}
                className={`flex items-center gap-3 text-sm font-medium transition-colors ${
                  complete
                    ? "text-muted line-through"
                    : "text-ink hover:text-accent"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={
                    complete
                      ? "bg-accent text-on-accent flex h-5 w-5 items-center justify-center rounded-full text-xs"
                      : "border-line-strong h-5 w-5 rounded-full border"
                  }
                >
                  {complete ? "✓" : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
