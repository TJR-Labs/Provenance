"use client";

import { closeBriefAction, reopenBriefAction } from "./actions";

type BriefStatusActionsProps = {
  id: string;
  status: "OPEN" | "CLOSED";
};

export function BriefStatusActions({ id, status }: BriefStatusActionsProps) {
  const isOpen = status === "OPEN";

  return (
    <form
      action={isOpen ? closeBriefAction : reopenBriefAction}
      onSubmit={(event) => {
        if (
          isOpen &&
          !window.confirm(
            "Close this brief? Closing it stops new submissions until it is reopened.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-sm font-semibold text-slate-300 hover:text-white"
      >
        {isOpen ? "Close" : "Reopen"}
      </button>
    </form>
  );
}
