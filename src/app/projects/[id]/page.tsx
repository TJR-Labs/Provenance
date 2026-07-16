import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectMedia } from "~/app/project-media";
import { reportProjectAction } from "~/app/report-actions";
import { safeExternalUrl } from "~/app/safe-external-url";
import { getServerCaller } from "~/server/api/caller";
import { auth } from "~/server/auth";
import { categoryLabels } from "~/server/categories";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reported?: string }>;
};

export default async function ProjectPage({
  params,
  searchParams,
}: ProjectPageProps) {
  const { id } = await params;
  const [project, session, query] = await Promise.all([
    (await getServerCaller()).project.getById({ id }),
    auth(),
    searchParams,
  ]);
  if (!project) notFound();

  const returnTo = `/projects/${project.id}`;
  const reportAction = reportProjectAction.bind(null, project.id, returnTo);
  const gridClass =
    project.layout === "gallery"
      ? "grid gap-4 sm:grid-cols-2"
      : project.layout === "writeup"
        ? "space-y-8"
        : "grid gap-5 sm:grid-cols-2";

  return (
    <article className="mx-auto w-full max-w-5xl px-6 py-14">
      {query.reported ? (
        <p className="border-success-line bg-success-surface text-success mb-8 rounded-md border px-4 py-3 text-sm">
          Thank you. Your report was submitted for review.
        </p>
      ) : null}
      <p className="text-brass font-mono text-xs tracking-[0.14em] uppercase">
        {categoryLabels[project.category]}
      </p>
      <h1 className="font-display text-ink mt-3 text-4xl font-semibold tracking-tight break-words sm:text-5xl">
        {project.title}
      </h1>
      <p className="text-muted mt-3 truncate">
        by{" "}
        <Link
          href={`/${project.user.username}`}
          className="text-ink hover:text-accent font-medium transition-colors"
        >
          {project.user.displayName}
        </Link>
      </p>
      {session?.user.id === project.user.id ? (
        <Link
          href={`/projects/${project.id}/edit`}
          className="border-line-strong text-ink hover:bg-raised mt-5 inline-block rounded-md border px-4 py-2 text-sm font-semibold transition-colors"
        >
          Edit project
        </Link>
      ) : null}

      <p className="text-ink mt-10 text-lg leading-8 break-words whitespace-pre-wrap">
        {project.description}
      </p>

      {project.media.length ? (
        <div className={`mt-10 ${gridClass}`}>
          {project.media.map((media) => (
            <div
              key={media.id}
              className="border-line bg-surface min-h-56 overflow-hidden rounded-lg border"
            >
              <ProjectMedia media={media} title={project.title} />
            </div>
          ))}
        </div>
      ) : (
        <div className="border-line-strong mt-10 rounded-lg border border-dashed px-6 py-12 text-center">
          <p className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
            No media on record
          </p>
          <p className="text-muted mt-3">
            This project tells its story without media.
          </p>
        </div>
      )}

      {project.links.length ? (
        <div className="mt-10 flex flex-wrap gap-3">
          {project.links.map((link) => {
            const href = safeExternalUrl(link);
            return href ? (
              <a
                key={link}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-4 py-2 font-semibold transition-colors"
              >
                Open project link
              </a>
            ) : (
              <span key={link} className="text-faint break-all">
                {link}
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-x-4 gap-y-2">
        {project.hashtags.map((tag) => (
          <Link
            key={tag}
            href={`/?hashtag=${encodeURIComponent(tag)}`}
            className="text-accent hover:text-accent-strong font-mono text-sm break-all transition-colors"
          >
            #{tag}
          </Link>
        ))}
      </div>

      <div className="rule-double mt-16 pt-8">
        {session ? (
          <form action={reportAction} className="flex max-w-xl gap-3">
            <input
              name="reason"
              placeholder="Why are you reporting this project? (optional)"
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
            Log in to report this project
          </Link>
        )}
      </div>
    </article>
  );
}
