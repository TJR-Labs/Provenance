import Link from "next/link";
import { notFound } from "next/navigation";
import type { ComponentProps } from "react";

import { sortForMobile } from "~/app/(protected)/profile/canvas/canvas-math";
import { ProjectCard } from "~/app/project-card";
import { reportProfileAction } from "~/app/report-actions";
import { safeExternalUrl } from "~/app/safe-external-url";
import { CANVAS_MAX_HEIGHT, CANVAS_WIDTH } from "~/lib/canvas-constants";
import { getServerCaller } from "~/server/api/caller";
import { auth } from "~/server/auth";
import { categoryLabels } from "~/server/categories";
import { profileScopeClass, sanitizeCustomCss } from "~/server/sanitize-css";
import { profileSections } from "~/server/users";
import { OnboardingChecklist } from "./onboarding-checklist";

type ProfilePageProps = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ reported?: string }>;
};

type ProfileLink = { label: string; url: string };

function readLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ProfileLink =>
      isRecord(item) &&
      typeof item.label === "string" &&
      typeof item.url === "string",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readSections(value: unknown) {
  if (!Array.isArray(value)) return [...profileSections];
  return value.filter((item): item is (typeof profileSections)[number] =>
    profileSections.includes(item as (typeof profileSections)[number]),
  );
}

// Profile skins override the design tokens for this subtree (see globals.css),
// so nested components follow the visitor-facing theme the owner picked.
const themeClasses = {
  default: "",
  paper: "profile-theme-paper",
  studio: "profile-theme-studio",
};

export default async function ProfilePage({
  params,
  searchParams,
}: ProfilePageProps) {
  const { username } = await params;
  const [profile, session, query] = await Promise.all([
    (await getServerCaller()).profile.getByUsername({ username }),
    auth(),
    searchParams,
  ]);
  if (!profile) notFound();

  const links = readLinks(profile.links);
  const sections = readSections(profile.layoutSections);
  const scope = profileScopeClass(profile.username);
  const css = profile.customCss
    ? sanitizeCustomCss(profile.customCss, profile.username)
    : "";
  const theme =
    themeClasses[profile.theme as keyof typeof themeClasses] ??
    themeClasses.default;
  const reportAction = reportProfileAction.bind(null, profile.username);
  const onboarding =
    session?.user.id === profile.id
      ? await (await getServerCaller()).profile.onboardingChecklist()
      : null;

  return (
    <div
      className={`${scope} ${theme} bg-canvas text-ink min-h-full flex-1`}
      style={{ contain: "layout" }}
    >
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <section className="mx-auto w-full max-w-6xl px-6 py-14">
        {query.reported ? (
          <p className="border-success-line bg-success-surface text-success mb-8 rounded-md border px-4 py-3 text-sm">
            Thank you. Your report was submitted for review.
          </p>
        ) : null}
        {onboarding?.shouldShow ? (
          <OnboardingChecklist items={onboarding.items} />
        ) : null}
        <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt=""
              className="border-line-strong bg-raised h-28 w-28 rounded-full border object-cover"
            />
          ) : (
            <div className="border-line-strong bg-raised font-display text-ink flex h-28 w-28 items-center justify-center rounded-full border text-4xl font-semibold">
              {profile.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-4xl font-semibold tracking-tight break-words">
              {profile.displayName}
            </h1>
            <p className="profile-muted text-muted mt-1 font-mono text-sm break-words">
              @{profile.username}
              {profile.school ? ` · ${profile.school}` : ""}
            </p>
            {session?.user.id === profile.id ? (
              <Link
                href="/profile/edit"
                className="text-accent hover:text-accent-strong mt-3 inline-block text-sm font-semibold transition-colors"
              >
                Edit profile
              </Link>
            ) : null}
          </div>
        </header>

        {profile.categories.length ? (
          <div className="mt-8 flex flex-wrap gap-2">
            {profile.categories.map((category) => (
              <Link
                key={category}
                href={`/?category=${category}`}
                className="bg-raised text-muted hover:text-accent rounded-full px-3 py-1 text-sm transition-colors"
              >
                {categoryLabels[category]}
              </Link>
            ))}
          </div>
        ) : null}

        {profile.layoutMode === "CANVAS" ? (
          <CanvasProfileLayout
            elements={profile.canvasElements}
            bio={profile.bio}
            links={links}
          />
        ) : (
          sections.map((section) => {
            if (section === "about") {
              return (
                <div key={section} className="mt-12 max-w-3xl">
                  <h2 className="font-display text-2xl font-semibold">About</h2>
                  <p className="profile-muted text-muted mt-4 leading-7 break-words whitespace-pre-wrap">
                    {profile.bio ?? "This person has not added a bio yet."}
                  </p>
                </div>
              );
            }
            if (section === "links") {
              return (
                <div key={section} className="mt-12">
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
                    <p className="profile-muted text-muted mt-4">
                      No links added.
                    </p>
                  )}
                </div>
              );
            }
            return (
              <div key={section} className="mt-12">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-display text-2xl font-semibold">
                    Projects
                  </h2>
                  {session?.user.id === profile.id ? (
                    <Link
                      href="/projects/new"
                      className="text-accent hover:text-accent-strong text-sm font-semibold transition-colors"
                    >
                      Add project
                    </Link>
                  ) : null}
                </div>
                {profile.projects.length ? (
                  <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {profile.projects.map((project) => (
                      <ProjectCard key={project.id} project={project} />
                    ))}
                  </div>
                ) : (
                  <div className="border-line-strong mt-6 rounded-lg border border-dashed px-6 py-14 text-center">
                    <p className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
                      No records yet
                    </p>
                    <p className="profile-muted text-muted mt-3">
                      No projects yet.
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}

        <div className="rule-double mt-16 pt-8">
          {session ? (
            <form action={reportAction} className="flex max-w-xl gap-3">
              <input
                name="reason"
                placeholder="Why are you reporting this profile? (optional)"
                className="border-line-strong bg-surface text-ink placeholder:text-faint focus:border-accent min-w-0 flex-1 rounded-md border px-3 py-2"
              />
              <button className="text-danger text-sm font-medium underline-offset-4 hover:underline">
                Report
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="text-danger text-sm font-medium underline-offset-4 hover:underline"
            >
              Log in to report this profile
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

type PublicCanvasElement = {
  id: string;
  type: "ABOUT" | "LINKS" | "PROJECT" | "TEXT" | "IMAGE" | "LINK";
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
};

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

function CanvasProfileLayout({
  elements,
  bio,
  links,
}: {
  elements: PublicCanvasElement[];
  bio: string | null;
  links: ProfileLink[];
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
              }}
            >
              <CanvasElementContent element={element} bio={bio} links={links} />
            </div>
          ))}
        </div>
      </div>
      {/* Mobile: linear fallback, stacked by y (x as tiebreaker). */}
      <div className="mt-12 space-y-10 md:hidden">
        {sortForMobile(elements).map((element) => (
          <div key={element.id}>
            <CanvasElementContent element={element} bio={bio} links={links} />
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
}: {
  element: PublicCanvasElement;
  bio: string | null;
  links: ProfileLink[];
}) {
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
