"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type WorkspaceRailProps = {
  username: string | null;
};

export function WorkspaceRail({ username }: WorkspaceRailProps) {
  const pathname = usePathname();
  const liveHref = username ? `/${username}` : "/login";
  const items = [
    {
      label: "Feed",
      href: "/",
      isActive: pathname === "/",
      icon: (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[18px]"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      label: "Site",
      href: "/site",
      isActive: pathname.startsWith("/site"),
      icon: (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[18px]"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
        </svg>
      ),
    },
    {
      label: "Editor",
      href: "/profile/canvas",
      isActive: pathname.startsWith("/profile/canvas"),
      icon: (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[18px]"
        >
          <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
          <path d="m14 7 3 3" />
        </svg>
      ),
    },
    {
      label: "Build",
      href: "/projects/new",
      isActive: pathname.startsWith("/projects/new"),
      icon: (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[18px]"
        >
          <path d="m14 6 4-4 4 4-4 4" />
          <path d="m16 8-9.5 9.5" />
          <path d="m5 15 4 4-2 2H3v-4l2-2Z" />
        </svg>
      ),
    },
    {
      label: "Live",
      href: liveHref,
      isActive: pathname.startsWith(liveHref),
      icon: (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[18px]"
        >
          <circle cx="12" cy="12" r="2" />
          <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" />
        </svg>
      ),
    },
  ];

  return (
    <div
      data-theme="dark"
      className="border-line flex h-full w-[76px] flex-col items-center gap-1 border-r bg-[#080808] py-4"
    >
      <div className="bg-surface flex size-[38px] items-center justify-center rounded-[10px]">
        <span className="font-display text-ink text-xl font-black">P</span>
      </div>
      <div className="h-4" />
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          aria-current={item.isActive ? "page" : undefined}
          className={`flex h-[50px] w-[52px] flex-col items-center justify-center gap-1 rounded-[10px] transition-colors ${
            item.isActive
              ? "bg-surface text-ink"
              : "text-muted hover:bg-surface hover:text-ink"
          }`}
        >
          <span className={item.isActive ? "text-accent" : undefined}>
            {item.icon}
          </span>
          <span className="font-mono text-[9px] tracking-wide uppercase">
            {item.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
