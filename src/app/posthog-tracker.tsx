"use client";

import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { useEffect, useRef } from "react";

type PostHogTrackerProps = {
  userId: string | null;
};

function shouldTrackPathname(pathname: string) {
  if (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/signup/username" ||
    pathname === "/projects" ||
    pathname === "/projects/new" ||
    pathname === "/my-work" ||
    pathname === "/profile" ||
    pathname === "/profile/edit" ||
    pathname === "/profile/canvas" ||
    pathname === "/account"
  ) {
    return true;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (
    segments[0] === "projects" &&
    segments[1] !== "new" &&
    (segments.length === 2 || (segments.length === 3 && segments[2] === "edit"))
  ) {
    return true;
  }

  if (segments.length !== 1) return false;
  return ![
    "account",
    "admin",
    "api",
    "forgot-password",
    "login",
    "my-work",
    "privacy",
    "profile",
    "projects",
    "reset-password",
    "signup",
    "terms",
    "verify-email",
  ].includes(segments[0] ?? "");
}

export function PostHogTracker({ userId }: PostHogTrackerProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const lastIdentifiedUserIdRef = useRef<string | null>(null);
  const lastPageviewRef = useRef<string | null>(null);
  const lastQueryEventRef = useRef<string | null>(null);

  useEffect(() => {
    if (!posthog.__loaded) return;

    if (userId && userId !== lastIdentifiedUserIdRef.current) {
      posthog.identify(userId);
      lastIdentifiedUserIdRef.current = userId;
    } else if (!userId && lastIdentifiedUserIdRef.current) {
      posthog.reset();
      lastIdentifiedUserIdRef.current = null;
    }
  }, [userId]);

  useEffect(() => {
    const trackedRoute = shouldTrackPathname(pathname);
    let initializedNow = false;

    if (!posthog.__loaded) {
      const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
      if (!key || !trackedRoute) return;

      const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
      posthog.init(key, {
        api_host: host ?? "https://us.i.posthog.com",
        capture_pageview: false,
        autocapture: false,
        disable_session_recording: true,
      });
      initializedNow = posthog.__loaded;
    }

    if (!posthog.__loaded) return;

    if (initializedNow) {
      if (userId && userId !== lastIdentifiedUserIdRef.current) {
        posthog.identify(userId);
        lastIdentifiedUserIdRef.current = userId;
      } else if (!userId && lastIdentifiedUserIdRef.current) {
        posthog.reset();
        lastIdentifiedUserIdRef.current = null;
      }
    }

    const pageviewSearchParams = new URLSearchParams(search);
    pageviewSearchParams.delete("ph_event");
    const pageviewKey = `${pathname}?${pageviewSearchParams.toString()}`;

    if (trackedRoute && pageviewKey !== lastPageviewRef.current) {
      posthog.capture("$pageview");
      lastPageviewRef.current = pageviewKey;
    } else if (!trackedRoute) {
      lastPageviewRef.current = null;
    }

    const event = searchParams.get("ph_event");
    const eventKey = `${pathname}?${search}`;
    if (
      trackedRoute &&
      eventKey !== lastQueryEventRef.current &&
      (event === "signup_completed" ||
        event === "project_created" ||
        event === "canvas_edited")
    ) {
      lastQueryEventRef.current = eventKey;
      posthog.capture(event);

      const nextSearchParams = new URLSearchParams(search);
      nextSearchParams.delete("ph_event");
      const nextSearch = nextSearchParams.toString();
      window.history.replaceState(
        window.history.state,
        "",
        `${pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`,
      );
    } else if (!event) {
      lastQueryEventRef.current = null;
    }
  }, [pathname, search, searchParams, userId]);

  return null;
}
