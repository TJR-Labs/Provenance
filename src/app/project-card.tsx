import Link from "next/link";

import type { Category } from "../../generated/prisma";
import { categoryLabels } from "~/server/categories";
import { ProjectMedia } from "./project-media";

type ProjectCardProps = {
  project: {
    id: string;
    title: string;
    description: string;
    category: Category;
    hashtags: string[];
    media: { url: string; mimeType: string | null }[];
    user?: { username: string; displayName: string };
  };
};

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      {project.media[0] ? (
        <div className="h-52 bg-slate-950">
          <ProjectMedia media={project.media[0]} title={project.title} />
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center bg-slate-950 text-sm text-slate-500">
          This project has no media
        </div>
      )}
      <div className="p-5">
        <p className="text-xs font-semibold tracking-wide text-sky-300 uppercase">
          {categoryLabels[project.category]}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">
          <Link href={`/projects/${project.id}`} className="hover:text-sky-300">
            {project.title}
          </Link>
        </h2>
        {project.user ? (
          <p className="mt-1 text-sm text-slate-400">
            by{" "}
            <Link
              href={`/${project.user.username}`}
              className="hover:text-white"
            >
              {project.user.displayName}
            </Link>
          </p>
        ) : null}
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-300">
          {project.description}
        </p>
        {project.hashtags.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {project.hashtags.map((tag) => (
              <Link
                key={tag}
                href={`/?hashtag=${encodeURIComponent(tag)}`}
                className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:text-white"
              >
                #{tag}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
