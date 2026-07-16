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
        <p className="mb-8 rounded-md border border-emerald-800 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-100">
          Thank you. Your report was submitted for review.
        </p>
      ) : null}
      <p className="text-sm font-semibold tracking-wide text-sky-300 uppercase">
        {categoryLabels[project.category]}
      </p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
        {project.title}
      </h1>
      <p className="mt-3 text-slate-400">
        by{" "}
        <Link
          href={`/${project.user.username}`}
          className="text-slate-200 hover:text-white"
        >
          {project.user.displayName}
        </Link>
      </p>
      {session?.user.id === project.user.id ? (
        <Link
          href={`/projects/${project.id}/edit`}
          className="mt-5 inline-block rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Edit project
        </Link>
      ) : null}

      <p className="mt-10 text-lg leading-8 whitespace-pre-wrap text-slate-300">
        {project.description}
      </p>

      {project.media.length ? (
        <div className={`mt-10 ${gridClass}`}>
          {project.media.map((media) => (
            <div
              key={media.id}
              className="min-h-56 overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
            >
              <ProjectMedia media={media} title={project.title} />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-10 rounded-xl border border-dashed border-slate-700 px-6 py-12 text-center text-slate-400">
          This project tells its story without media.
        </p>
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
                className="rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-300"
              >
                Open project link
              </a>
            ) : (
              <span key={link} className="break-all text-slate-400">
                {link}
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-2">
        {project.hashtags.map((tag) => (
          <Link
            key={tag}
            href={`/?hashtag=${encodeURIComponent(tag)}`}
            className="text-sky-300"
          >
            #{tag}
          </Link>
        ))}
      </div>

      <div className="mt-16 border-t border-slate-800 pt-8">
        {session ? (
          <form action={reportAction} className="flex max-w-xl gap-3">
            <input
              name="reason"
              placeholder="Why are you reporting this project? (optional)"
              className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-white"
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
            Log in to report this project
          </Link>
        )}
      </div>
    </article>
  );
}
