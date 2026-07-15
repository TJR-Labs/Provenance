"use client";

import { useEffect, useState } from "react";

export const inboxReadEvent = "provenance:inbox-read";

export function UnreadMessageBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const clearCount = () => setCount(0);
    window.addEventListener(inboxReadEvent, clearCount);
    return () => window.removeEventListener(inboxReadEvent, clearCount);
  }, []);

  if (count === 0) return null;

  return (
    <span className="rounded-full bg-sky-400 px-2 py-0.5 text-xs font-bold text-slate-950">
      {count}
    </span>
  );
}
