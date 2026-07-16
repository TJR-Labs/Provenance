import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectCard } from "~/app/project-card";
import { reportProfileAction } from "~/app/report-actions";
import { safeExternalUrl } from "~/app/safe-external-url";
import { getServerCaller } from "~/server/api/caller";
import { auth } from "~/server/auth";
import { categoryLabels } from "~/server/categories";
import { profileScopeClass, sanitizeCustomCss } from "~/server/sanitize-css";
import { profileSections } from "~/server/users";

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

        {sections.map((section) => {
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
        })}

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
