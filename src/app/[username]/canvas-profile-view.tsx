import Link from "next/link";
import type { ComponentProps, CSSProperties } from "react";

import { sortForMobile } from "~/app/(protected)/profile/canvas/canvas-math";
import { ProjectCard } from "~/app/project-card";
import { safeExternalUrl } from "~/app/safe-external-url";
import { CANVAS_MAX_HEIGHT, CANVAS_WIDTH } from "~/lib/canvas-constants";
import {
  AVATAR_OFFSET_DEFAULT,
  AVATAR_ZOOM_DEFAULT,
  avatarShapeRadius,
  fontStack,
} from "~/lib/canvas-style";
import { categoryLabels } from "~/server/categories";

export type ProfileLink = { label: string; url: string };

export type PublicCanvasElement = {
  id: string;
  type:
    | "ABOUT"
    | "LINKS"
    | "PROJECT"
    | "TEXT"
    | "IMAGE"
    | "LINK"
    | "AVATAR"
    | "NAME"
    | "USERNAME"
    | "CATEGORIES";
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  project: ComponentProps<typeof ProjectCard>["project"] | null;
  textContent: string | null;
  imageUrl: string | null;
  imageCaption: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  textColor: string | null;
  backgroundColor: string | null;
  fontFamily: string | null;
  avatarShape: string | null;
  avatarZoom: number | null;
  avatarOffsetX: number | null;
  avatarOffsetY: number | null;
};

// Identity values the canvas identity elements derive from (avatar, name,
// username/school, category badges). Passed alongside the element rows.
export type ProfileIdentity = {
  displayName: string;
  username: string;
  school: string | null;
  avatarUrl: string | null;
  categories: (keyof typeof categoryLabels)[];
};

// Maps an element's stored style columns to inline CSS applied only to that
// element's canvas rendering. Colors are validated to hex/"transparent" and
// fonts to an allowlisted stack before storage, so this can never inject CSS.
export function canvasElementStyle(
  element: PublicCanvasElement,
): CSSProperties {
  const style: CSSProperties = {};
  if (element.textColor) style.color = element.textColor;
  if (element.backgroundColor) style.backgroundColor = element.backgroundColor;
  const stack = fontStack(element.fontFamily);
  if (stack) style.fontFamily = stack;
  return style;
}

// Favicon comes from a third-party favicon-by-domain service via a plain
// client-rendered <img> request — the server never fetches the target URL.
function faviconUrl(linkUrl: string) {
  try {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
      new URL(linkUrl).hostname,
    )}`;
  } catch {
    return null;
  }
}

export function CanvasProfileLayout({
  elements,
  bio,
  links,
  identity,
}: {
  elements: PublicCanvasElement[];
  bio: string | null;
  links: ProfileLink[];
  identity: ProfileIdentity;
}) {
  if (elements.length === 0) {
    return (
      <div className="border-line-strong mt-12 rounded-lg border border-dashed px-6 py-14 text-center">
        <p className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
          No records yet
        </p>
        <p className="profile-muted text-muted mt-3">Nothing here yet.</p>
      </div>
    );
  }

  const height = Math.min(
    CANVAS_MAX_HEIGHT,
    Math.max(...elements.map((element) => element.y + element.height)),
  );

  return (
    <>
      {/* Desktop/tablet: published positions, sizes, and layers. */}
      <div className="mt-12 hidden md:block">
        <div className="relative" style={{ width: CANVAS_WIDTH, height }}>
          {elements.map((element) => (
            <div
              key={element.id}
              className="absolute overflow-auto"
              style={{
                left: element.x,
                top: element.y,
                width: element.width,
                height: element.height,
                zIndex: element.zIndex,
                ...canvasElementStyle(element),
              }}
            >
              <CanvasElementContent
                element={element}
                bio={bio}
                links={links}
                identity={identity}
              />
            </div>
          ))}
        </div>
      </div>
      {/* Mobile: linear fallback, stacked by y (x as tiebreaker). */}
      <div className="mt-12 space-y-10 md:hidden">
        {sortForMobile(elements).map((element) => (
          <div key={element.id} style={canvasElementStyle(element)}>
            <CanvasElementContent
              element={element}
              bio={bio}
              links={links}
              identity={identity}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function CanvasElementContent({
  element,
  bio,
  links,
  identity,
}: {
  element: PublicCanvasElement;
  bio: string | null;
  links: ProfileLink[];
  identity: ProfileIdentity;
}) {
  if (element.type === "AVATAR") {
    const radius = avatarShapeRadius(element.avatarShape);
    return identity.avatarUrl ? (
      <div
        className="border-line-strong h-full min-h-28 w-full border"
        style={{
          borderRadius: radius,
          backgroundImage: `url(${JSON.stringify(identity.avatarUrl)})`,
          backgroundSize: `${element.avatarZoom ?? AVATAR_ZOOM_DEFAULT}%`,
          backgroundPosition: `${
            element.avatarOffsetX ?? AVATAR_OFFSET_DEFAULT
          }% ${element.avatarOffsetY ?? AVATAR_OFFSET_DEFAULT}%`,
          backgroundRepeat: "no-repeat",
        }}
      />
    ) : (
      <div
        className="border-line-strong bg-raised font-display text-ink flex h-full min-h-28 w-full items-center justify-center border text-4xl font-semibold"
        style={{ borderRadius: radius }}
      >
        {identity.displayName.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  if (element.type === "NAME") {
    return (
      <h1 className="font-display text-4xl font-semibold tracking-tight break-words">
        {identity.displayName}
      </h1>
    );
  }
  if (element.type === "USERNAME") {
    return (
      <p className="profile-muted text-muted font-mono text-sm break-words">
        @{identity.username}
        {identity.school ? ` · ${identity.school}` : ""}
      </p>
    );
  }
  if (element.type === "CATEGORIES") {
    return identity.categories.length ? (
      <div className="flex flex-wrap gap-2">
        {identity.categories.map((category) => (
          <Link
            key={category}
            href={`/?category=${category}`}
            className="bg-raised text-muted hover:text-accent rounded-full px-3 py-1 text-sm transition-colors"
          >
            {categoryLabels[category]}
          </Link>
        ))}
      </div>
    ) : null;
  }
  if (element.type === "ABOUT") {
    return (
      <div>
        <h2 className="font-display text-2xl font-semibold">About</h2>
        <p className="profile-muted text-muted mt-4 leading-7 break-words whitespace-pre-wrap">
          {bio ?? "This person has not added a bio yet."}
        </p>
      </div>
    );
  }
  if (element.type === "LINKS") {
    return (
      <div>
        <h2 className="font-display text-2xl font-semibold">Links</h2>
        {links.length ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {links.map((link) => {
              const href = safeExternalUrl(link.url);
              return href ? (
                <a
                  key={`${link.label}-${link.url}`}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="border-line-strong hover:border-accent hover:text-accent max-w-full truncate rounded-md border px-4 py-2 font-medium transition-colors"
                >
                  {link.label}
                </a>
              ) : (
                <span
                  key={`${link.label}-${link.url}`}
                  className="border-line text-faint max-w-full truncate rounded-md border px-4 py-2"
                >
                  {link.label}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="profile-muted text-muted mt-4">No links added.</p>
        )}
      </div>
    );
  }
  if (element.type === "TEXT") {
    return (
      <div
        className="leading-7 break-words [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        // Safe: textContent is sanitized server-side (allowlisted tags,
        // http/https-only hrefs) before it is ever stored — see
        // sanitizeCanvasText in src/server/canvas.ts.
        dangerouslySetInnerHTML={{ __html: element.textContent ?? "" }}
      />
    );
  }
  if (element.type === "IMAGE") {
    return (
      <figure>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={element.imageUrl ?? ""}
          alt={element.imageCaption ?? ""}
          className="w-full rounded-lg object-cover"
        />
        {element.imageCaption ? (
          <figcaption className="text-muted mt-2 text-sm">
            {element.imageCaption}
          </figcaption>
        ) : null}
      </figure>
    );
  }
  if (element.type === "LINK") {
    const href = element.linkUrl ? safeExternalUrl(element.linkUrl) : null;
    const favicon = element.linkUrl ? faviconUrl(element.linkUrl) : null;
    const content = (
      <>
        {favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={favicon} alt="" className="h-4 w-4 shrink-0 rounded" />
        ) : null}
        <span className="max-w-full truncate">{element.linkLabel}</span>
      </>
    );
    return href ? (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="border-line-strong hover:border-accent hover:text-accent flex items-center gap-2 rounded-md border px-4 py-2 font-medium transition-colors"
      >
        {content}
      </a>
    ) : (
      <span className="border-line text-faint flex items-center gap-2 rounded-md border px-4 py-2">
        {content}
      </span>
    );
  }
  return element.project ? <ProjectCard project={element.project} /> : null;
}
