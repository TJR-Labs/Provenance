"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "~/trpc/react";

type LayoutMode = "GRID" | "CANVAS";

// Grid/canvas switch, moved here from the profile-edit form. Behavior is
// identical to the old toggle: an immediate canvas.setMode mutation, no
// separate save step. On success it refreshes the server component so the
// page swaps between the "you're on grid" state and the canvas editor
// without a further navigation.
export function LayoutModeToggle({ mode }: { mode: LayoutMode }) {
  const router = useRouter();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(mode);
  const setMode = api.canvas.setMode.useMutation();

  function chooseLayoutMode(next: LayoutMode) {
    if (next === layoutMode || setMode.isPending) return;
    const previous = layoutMode;
    setLayoutMode(next);
    setMode.mutate(
      { mode: next },
      {
        onSuccess: () => router.refresh(),
        onError: () => setLayoutMode(previous),
      },
    );
  }

  return (
    <fieldset className="mt-6">
      <legend className="text-ink text-sm font-medium">
        How your profile is arranged
      </legend>
      <p className="text-muted mt-1 text-sm">
        Grid stacks your sections (About, Projects, Links). Canvas lets you
        freely place and resize elements. Changes apply immediately.
      </p>
      <div className="mt-3 flex gap-2">
        {(["GRID", "CANVAS"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={layoutMode === option}
            disabled={setMode.isPending}
            onClick={() => chooseLayoutMode(option)}
            className={
              layoutMode === option
                ? "bg-accent text-on-accent rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                : "border-line-strong text-muted hover:bg-raised hover:text-ink rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
            }
          >
            {option === "GRID" ? "Grid" : "Canvas"}
          </button>
        ))}
      </div>
      {setMode.isPending ? (
        <p className="text-muted mt-2 text-sm">Switching layout…</p>
      ) : null}
      {setMode.isError ? (
        <p role="alert" className="text-danger mt-2 text-sm">
          Could not switch layout. Please try again.
        </p>
      ) : null}
    </fieldset>
  );
}
