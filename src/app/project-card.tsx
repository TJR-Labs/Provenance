import Link from "next/link";

import type { Category } from "../../generated/prisma";
import {
  DEFAULT_CARD_LAYOUT,
  type CardLayout,
} from "~/lib/canvas-project-card";
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
  // Canvas card layout preset. Defaults to today's media-top/description-below
  // rendering; only canvas placements pass a different value.
  layout?: CardLayout;
};

const articleClass =
  "border-line bg-surface hover:border-line-strong flex flex-col overflow-hidden rounded-lg border transition-colors";

export function ProjectCard({
  project,
  layout = DEFAULT_CARD_LAYOUT,
}: ProjectCardProps) {
  // Media block: the record's first media, or the standing "No media" tile.
  // `borderClass` positions its divider so the block reads correctly whether it
  // sits above, below, or beside the text body.
  function media(borderClass: string) {
    return project.media[0] ? (
      <div className={`border-line bg-raised h-52 ${borderClass}`}>
        <ProjectMedia media={project.media[0]} title={project.title} />
      </div>
    ) : (
      <div
        className={`border-line bg-raised text-muted flex h-32 items-center justify-center font-mono text-xs tracking-[0.14em] uppercase ${borderClass}`}
      >
        No media on record
      </div>
    );
  }

  const body = (
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
  );

  if (layout === "text-only") {
    // Media hidden regardless of whether the project has any.
    return <article className={articleClass}>{body}</article>;
  }

  if (layout === "desc-top") {
    return (
      <article className={articleClass}>
        {body}
        {media("border-t")}
      </article>
    );
  }

  if (layout === "media-left") {
    // Side by side on sm+; stacks on mobile. The "No media" placeholder still
    // occupies the media side so the layout never collapses.
    return (
      <article className={`${articleClass} sm:flex-row`}>
        <div className="border-line border-b sm:w-2/5 sm:shrink-0 sm:border-r sm:border-b-0">
          {media("")}
        </div>
        <div className="min-w-0 flex-1">{body}</div>
      </article>
    );
  }

  // media-top (default): identical to the pre-override rendering.
  return (
    <article className={articleClass}>
      {media("border-b")}
      {body}
    </article>
  );
}
