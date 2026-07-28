import Link from "next/link";

import { SITE_STYLE_PRESET_OPTIONS } from "~/lib/site-style";
import { getServerCaller } from "~/server/api/caller";
import { categoryLabels } from "~/server/categories";
import { DevlogQuickAdd, ProjectsFlyoutTrigger } from "./site-interactive";

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1_000;

function formatRelativeTime(date: Date): string {
  const elapsedMs = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(elapsedMs / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  return `${Math.floor(hours / 24)} days ago`;
}

function PreviewSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h3 className="font-mono text-[11px] tracking-[0.14em] text-[#5c564d] uppercase">
        {children}
      </h3>
      <span className="h-px flex-1 bg-[#dcd7cb]" />
    </div>
  );
}

function publishedStyle(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const style = value as Record<string, unknown>;
  return typeof style.colorBg === "string" &&
    typeof style.colorText === "string" &&
    typeof style.colorAccent === "string"
    ? {
        colorBg: style.colorBg,
        colorText: style.colorText,
        colorAccent: style.colorAccent,
      }
    : null;
}

export default async function SitePage() {
  const caller = await getServerCaller();
  const [profile, projectPage, devlogEntries] = await Promise.all([
    caller.profile.me(),
    caller.project.listMine(),
    caller.devlog.listMine(),
  ]);

  const projects = projectPage.items;
  const bio = profile.bio ?? "";
  const displayName = profile.displayName ?? profile.username;
  const savedAt = profile.sitePublishedAt ?? profile.siteDraftSavedAt ?? null;
  const style = publishedStyle(profile.siteStylePublished);
  const theme = style
    ? SITE_STYLE_PRESET_OPTIONS.find(
        (option) =>
          option.background.toLowerCase() === style.colorBg.toLowerCase() &&
          option.ink.toLowerCase() === style.colorText.toLowerCase(),
      )
    : null;
  const weekStartedAt = Date.now() - WEEK_IN_MS;
  const weeklyDevlogCount = devlogEntries.filter(
    (entry) => entry.createdAt.getTime() >= weekStartedAt,
  ).length;

  return (
    <div data-theme="dark" className="bg-canvas flex h-full flex-1 flex-col">
      <div className="border-line bg-surface flex h-14 items-center gap-3.5 border-b px-5">
        <div className="min-w-0">
          <h1 className="text-ink font-bold">My site</h1>
          <p className="text-muted truncate font-mono text-[11px] tracking-[0.14em] uppercase">
            {profile.username}.provenance.site · LIVE PREVIEW
          </p>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          className="text-muted hover:text-ink rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
        >
          Share
        </button>
        <ProjectsFlyoutTrigger
          projects={projects.map((project) => ({
            id: project.id,
            title: project.title,
            status: project.status,
            category: project.category,
          }))}
        />
        <Link
          href="/profile/canvas"
          className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-3 py-1.5 text-sm font-semibold transition-colors"
        >
          Edit site
        </Link>
      </div>

      <div className="flex flex-1 gap-5.5 overflow-auto p-5.5">
        <section
          aria-label="Site preview"
          className="border-line bg-surface flex min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border"
        >
          <div className="border-line flex h-[42px] shrink-0 items-center gap-2.5 border-b bg-[#1d1d1b] px-4">
            <span
              aria-hidden="true"
              className="size-[7px] rounded-full bg-[#3ecf5f]"
            />
            <p className="text-muted font-mono text-[11px] tracking-[0.14em] uppercase">
              {savedAt
                ? `LIVE · LAST SAVED ${formatRelativeTime(savedAt)}`
                : "NOT PUBLISHED YET"}
            </p>
            <div className="flex-1" />
            <p className="text-muted font-mono text-[11px] tracking-[0.14em] uppercase">
              {(theme?.label ?? "Custom style").toUpperCase()}
            </p>
          </div>

          <div className="flex-1 overflow-auto bg-[#f1eee6] p-4">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-6 sm:px-7 sm:py-9">
              <header>
                <h2 className="font-display text-4xl font-bold text-[#17150f]">
                  {displayName}
                </h2>
                <p className="mt-2 max-w-2xl text-[#5c564d]">{bio}</p>
              </header>

              <section className="flex flex-col gap-4">
                <PreviewSectionLabel>Projects</PreviewSectionLabel>
                {projects.length > 0 ? (
                  <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                    {projects.slice(0, 4).map((project) => (
                      <article key={project.id}>
                        <div
                          aria-hidden="true"
                          className="aspect-[3/2] bg-[#dcd7cb]"
                        />
                        <h3 className="mt-2 font-bold text-[#17150f]">
                          {project.title}
                        </h3>
                        <p className="mt-0.5 font-mono text-[10px] tracking-[0.14em] text-[#5c564d] uppercase">
                          {categoryLabels[project.category]}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#5c564d]">No projects yet.</p>
                )}
              </section>

              <section className="flex flex-col gap-4">
                <PreviewSectionLabel>About</PreviewSectionLabel>
                <p className="font-display max-w-3xl text-lg leading-relaxed text-[#17150f]">
                  {bio}
                </p>
              </section>
            </div>
          </div>
        </section>

        <aside className="flex w-[284px] shrink-0 flex-col gap-4">
          <section className="border-line bg-surface flex flex-col gap-3.5 rounded-[14px] border p-4.5">
            <h2 className="text-ink font-semibold">Currently building</h2>
            {devlogEntries.length > 0 ? (
              <div className="flex flex-col gap-3">
                {devlogEntries.map((entry) => (
                  <article
                    key={entry.id}
                    className="border-line flex flex-col gap-1 border-l-2 pl-3"
                  >
                    <p className="text-accent font-mono text-[11px] tracking-[0.14em] uppercase">
                      {entry.createdAt.toISOString().slice(0, 10)} ·{" "}
                      {entry.label}
                    </p>
                    <p className="text-muted text-[13px]">{entry.body}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-muted text-[13px]">
                No entries yet — add one below.
              </p>
            )}
            <DevlogQuickAdd />
          </section>

          <section className="border-line bg-surface flex flex-col gap-3 rounded-[14px] border p-4.5">
            <h2 className="text-muted font-mono text-[11px] tracking-[0.14em] uppercase">
              This week
            </h2>
            <dl className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted text-[13px]">Visitors</dt>
                <dd className="text-ink text-xl font-semibold">—</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted text-[13px]">Log entries</dt>
                <dd className="text-ink text-xl font-semibold">
                  {weeklyDevlogCount}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
