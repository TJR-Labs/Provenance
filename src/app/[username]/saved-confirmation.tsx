"use client";

import { useState } from "react";

// Rendered when the owner lands back on their profile after a successful
// save (via the ?saved=1 flag). It is dismissable and transient: dismissing
// hides it for this view, and because it is only shown when the query flag is
// present, it does not reappear on a later unrelated page load.
export function SavedConfirmation() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="status"
      className="border-success-line bg-success-surface text-success mb-8 flex items-center justify-between gap-4 rounded-md border px-4 py-3 text-sm"
    >
      <span>Profile saved.</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-success shrink-0 text-sm font-medium underline-offset-4 hover:underline"
      >
        Dismiss
      </button>
    </div>
  );
}
