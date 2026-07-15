"use client";

import { useEffect } from "react";

import { inboxReadEvent } from "~/app/unread-message-badge";
import { markInboxReadAction } from "./actions";

export function InboxReadMarker() {
  useEffect(() => {
    async function markRead() {
      try {
        await markInboxReadAction();
        window.dispatchEvent(new Event(inboxReadEvent));
      } catch {
        return;
      }
    }

    void markRead();
  }, []);

  return null;
}
