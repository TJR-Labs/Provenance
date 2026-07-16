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

const themeClasses = {
  default: "bg-slate-950 text-slate-100",
  paper: "bg-stone-100 text-stone-900 [&_.profile-muted]:text-stone-600",
  studio: "bg-indigo-950 text-indigo-50 [&_.profile-muted]:text-indigo-200",
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
      className={`${scope} ${theme} min-h-full flex-1`}
      style={{ contain: "layout" }}
    >
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <section className="mx-auto w-full max-w-6xl px-6 py-14">
        {query.reported ? (
          <p className="mb-8 rounded-md border border-emerald-700 bg-emerald-950/60 px-4 py-3 text-sm text-emerald-100">
            Thank you. Your report was submitted for review.
          </p>
        ) : null}
        <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt=""
              className="h-28 w-28 rounded-full border-4 border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-sky-400 text-4xl font-bold text-slate-950">
              {profile.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-4xl font-bold tracking-tight">
              {profile.displayName}
            </h1>
            <p className="profile-muted mt-1 text-slate-400">
              @{profile.username}
              {profile.school ? ` · ${profile.school}` : ""}
            </p>
            {session?.user.id === profile.id ? (
              <Link
                href="/profile/edit"
                className="mt-3 inline-block text-sm font-semibold text-sky-300 hover:text-sky-200"
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
                className="rounded-full bg-white/10 px-3 py-1 text-sm"
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
                <h2 className="text-2xl font-semibold">About</h2>
                <p className="profile-muted mt-4 leading-7 whitespace-pre-wrap text-slate-300">
                  {profile.bio ?? "This person has not added a bio yet."}
                </p>
              </div>
            );
          }
          if (section === "links") {
            return (
              <div key={section} className="mt-12">
                <h2 className="text-2xl font-semibold">Links</h2>
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
                          className="rounded-md border border-white/20 px-4 py-2 hover:bg-white/10"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <span
                          key={`${link.label}-${link.url}`}
                          className="rounded-md border border-white/20 px-4 py-2 text-slate-400"
                        >
                          {link.label}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="profile-muted mt-4 text-slate-400">
                    No links added.
                  </p>
                )}
              </div>
            );
          }
          return (
            <div key={section} className="mt-12">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-2xl font-semibold">Projects</h2>
                {session?.user.id === profile.id ? (
                  <Link
                    href="/projects/new"
                    className="text-sm font-semibold text-sky-300"
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
                <p className="profile-muted mt-6 rounded-xl border border-dashed border-white/20 px-6 py-12 text-center text-slate-400">
                  No projects yet.
                </p>
              )}
            </div>
          );
        })}

        <div className="mt-16 border-t border-white/10 pt-8">
          {session ? (
            <form action={reportAction} className="flex max-w-xl gap-3">
              <input
                name="reason"
                placeholder="Why are you reporting this profile? (optional)"
                className="min-w-0 flex-1 rounded-md border border-white/20 bg-black/20 px-3 py-2"
              />
              <button className="text-sm text-red-300 hover:text-red-200">
                Report
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="text-sm text-red-300 hover:text-red-200"
            >
              Log in to report this profile
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
