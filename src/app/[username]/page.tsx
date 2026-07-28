import Link from "next/link";
import { notFound } from "next/navigation";

import { reportProfileAction } from "~/app/report-actions";
import { getServerCaller } from "~/server/api/caller";
import { auth } from "~/server/auth";
import { categoryLabels } from "~/server/categories";
import { profileScopeClass, sanitizeCustomCss } from "~/server/sanitize-css";
import { OnboardingChecklist } from "./onboarding-checklist";
import { SavedConfirmation } from "./saved-confirmation";
import { SiteView, type SiteLink } from "./site-view";

type ProfilePageProps = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ reported?: string; saved?: string }>;
};

function readLinks(value: unknown): SiteLink[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SiteLink =>
      isRecord(item) &&
      typeof item.label === "string" &&
      typeof item.url === "string",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function PrivateProfileNotice({ username }: { username: string }) {
  return (
    <div className="bg-canvas text-ink min-h-full flex-1">
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-24 text-center">
        <p className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
          Private profile
        </p>
        <h1 className="font-display mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          @{username} keeps this profile private
        </h1>
        <p className="text-muted mt-4">
          This profile isn&apos;t publicly visible right now.
        </p>
      </section>
    </div>
  );
}

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
  if ("isPrivate" in profile) {
    return <PrivateProfileNotice username={username} />;
  }

  const links = readLinks(profile.links);
  const scope = profileScopeClass(profile.username);
  const css = profile.customCss
    ? sanitizeCustomCss(profile.customCss, profile.username)
    : "";
  const reportAction = reportProfileAction.bind(null, profile.username);
  const onboarding =
    session?.user.id === profile.id
      ? await (await getServerCaller()).profile.onboardingChecklist()
      : null;

  return (
    <div
      className={`${scope} bg-canvas text-ink min-h-full flex-1`}
      style={{ contain: "layout" }}
    >
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <section className="mx-auto w-full max-w-6xl px-6 py-14">
        {query.reported ? (
          <p className="border-success-line bg-success-surface text-success mb-8 rounded-md border px-4 py-3 text-sm">
            Thank you. Your report was submitted for review.
          </p>
        ) : null}
        {query.saved && session?.user.id === profile.id ? (
          <SavedConfirmation />
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
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/profile/edit"
                  className="border-line-strong text-ink hover:border-accent hover:text-accent rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors"
                >
                  Edit Profile
                </Link>
                <Link
                  href="/profile/canvas"
                  className="border-line-strong text-ink hover:border-accent hover:text-accent rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors"
                >
                  Edit Layout
                </Link>
              </div>
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

        <SiteView
          sections={profile.sections}
          style={profile.siteStyle}
          identity={{
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            bio: profile.bio,
            links,
          }}
          projects={profile.siteProjects}
          devlogEntries={profile.devlogEntries}
          ownerView={session?.user.id === profile.id}
        />

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
