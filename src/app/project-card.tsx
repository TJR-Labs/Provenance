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
    <article className="border-line bg-surface hover:border-line-strong flex flex-col overflow-hidden rounded-lg border transition-colors">
      {project.media[0] ? (
        <div className="border-line bg-raised h-52 border-b">
          <ProjectMedia media={project.media[0]} title={project.title} />
        </div>
      ) : (
        <div className="border-line bg-raised text-muted flex h-32 items-center justify-center border-b font-mono text-xs tracking-[0.14em] uppercase">
          No media on record
        </div>
      )}
      <div className="p-5">
        <p className="text-brass font-mono text-xs tracking-[0.14em] uppercase">
          {categoryLabels[project.category]}
        </p>
        <h2 className="font-display text-ink mt-2 line-clamp-2 text-xl font-semibold break-words">
          <Link
            href={`/projects/${project.id}`}
            className="hover:text-accent transition-colors"
          >
            {project.title}
          </Link>
        </h2>
        {project.user ? (
          <p className="text-muted mt-1 truncate text-sm">
            by{" "}
            <Link
              href={`/${project.user.username}`}
              className="hover:text-ink transition-colors"
            >
              {project.user.displayName}
            </Link>
          </p>
        ) : null}
        <p className="text-muted mt-3 line-clamp-3 text-sm leading-6 break-words">
          {project.description}
        </p>
        {project.hashtags.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {project.hashtags.map((tag) => (
              <Link
                key={tag}
                href={`/?hashtag=${encodeURIComponent(tag)}`}
                className="bg-raised text-muted hover:text-accent max-w-full truncate rounded-full px-2.5 py-1 font-mono text-xs transition-colors"
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
