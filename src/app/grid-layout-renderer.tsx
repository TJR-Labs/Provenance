import Link from "next/link";

import { ProjectMedia } from "~/app/project-media";
import { safeExternalUrl } from "~/app/safe-external-url";
import {
  GRID_ROW_HEIGHT_PX,
  isEmptyGridBlock,
  sortGridBlocksForMobile,
  type GridBlock,
} from "~/lib/grid-layout";

export type GridProjectView = {
  id: string;
  title: string;
  description: string;
  private: boolean;
  media: { url: string; mimeType: string | null }[];
};

type RendererProps = {
  blocks: GridBlock[];
  projects: GridProjectView[];
  mode: "responsive" | "desktop" | "mobile";
  ownerView: boolean;
  showEmpty?: boolean;
};

function EmptyLayout() {
  return (
    <div className="border-line-strong mt-12 rounded-lg border border-dashed px-6 py-14 text-center">
      <p className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
        No records yet
      </p>
      <p className="profile-muted text-muted mt-3">Nothing here yet.</p>
    </div>
  );
}

function EmptyBlock() {
  return (
    <div className="border-line text-faint flex h-full min-h-20 items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm">
      Empty block
    </div>
  );
}

function UnavailableProject() {
  return (
    <div className="border-line bg-raised text-muted flex h-full min-h-32 items-center justify-center rounded-lg border p-6 text-center font-mono text-xs tracking-[0.14em] uppercase">
      Project unavailable
    </div>
  );
}

function ProjectBlock({ project }: { project: GridProjectView }) {
  return (
    <article className="border-line bg-surface hover:border-line-strong flex h-full flex-col overflow-hidden rounded-lg border transition-colors">
      {project.media[0] ? (
        <div className="border-line bg-raised h-52 shrink-0 border-b">
          <ProjectMedia media={project.media[0]} title={project.title} />
        </div>
      ) : (
        <div className="border-line bg-raised text-muted flex h-32 shrink-0 items-center justify-center border-b font-mono text-xs tracking-[0.14em] uppercase">
          No media on record
        </div>
      )}
      <div className="p-5">
        <h2 className="font-display text-ink line-clamp-2 text-xl font-semibold break-words">
          <Link
            href={`/projects/${project.id}`}
            className="hover:text-accent transition-colors"
          >
            {project.title}
          </Link>
        </h2>
        <p className="text-muted mt-3 line-clamp-3 text-sm leading-6 break-words">
          {project.description}
        </p>
      </div>
    </article>
  );
}

function canRenderMediaUrl(value: string) {
  return (
    (value.startsWith("/") && !value.startsWith("//")) || safeExternalUrl(value)
  );
}

function UnsafeLegacyValue({ value }: { value: string }) {
  return (
    <span className="border-line bg-raised text-muted flex h-full min-h-32 items-center justify-center rounded-lg border p-6 text-center break-all">
      {value}
    </span>
  );
}

function BlockContent({
  block,
  project,
  ownerView,
  showEmpty,
}: {
  block: GridBlock;
  project: GridProjectView | undefined;
  ownerView: boolean;
  showEmpty: boolean;
}) {
  if (isEmptyGridBlock(block)) return showEmpty ? <EmptyBlock /> : null;

  if (block.type === "TEXT") {
    return (
      <p className="text-ink leading-7 break-words whitespace-pre-wrap">
        {block.textContent}
      </p>
    );
  }

  if (block.type === "IMAGE") {
    const imageUrl = block.imageUrl!;
    if (!canRenderMediaUrl(imageUrl)) {
      return <UnsafeLegacyValue value={imageUrl} />;
    }
    return (
      <div className="border-line bg-surface h-full min-h-32 overflow-hidden rounded-lg border">
        <ProjectMedia
          media={{ url: imageUrl, mimeType: block.imageMimeType }}
          title={block.imageAlt ?? ""}
        />
      </div>
    );
  }

  if (block.type === "LINK") {
    const linkUrl = block.linkUrl!;
    const label = block.linkLabel?.trim() || linkUrl;
    const href = safeExternalUrl(linkUrl);
    if (!href) {
      return (
        <span className="border-line text-faint flex h-full min-h-20 flex-col items-center justify-center rounded-md border px-4 py-2 text-center">
          <span className="max-w-full break-words">{label}</span>
          {label !== linkUrl ? (
            <span className="mt-1 max-w-full text-xs break-all">{linkUrl}</span>
          ) : null}
        </span>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="border-line-strong hover:border-accent hover:text-accent flex h-full min-h-20 items-center justify-center rounded-md border px-4 py-2 text-center font-medium break-words transition-colors"
      >
        {label}
      </a>
    );
  }

  if (!project) {
    return ownerView ? <UnavailableProject /> : null;
  }
  if (project.private && !ownerView) return null;
  return <ProjectBlock project={project} />;
}

function DesktopLayout({
  blocks,
  projectById,
  ownerView,
  showEmpty,
  responsive,
}: {
  blocks: GridBlock[];
  projectById: Map<string, GridProjectView>;
  ownerView: boolean;
  showEmpty: boolean;
  responsive: boolean;
}) {
  return (
    <div
      className={responsive ? "mt-12 hidden gap-4 md:grid" : "mt-12 grid gap-4"}
      style={{
        gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
        gridAutoRows: `${GRID_ROW_HEIGHT_PX}px`,
      }}
    >
      {blocks.map((block) => (
        <div
          key={block.key}
          className="min-w-0 overflow-auto"
          style={{
            gridColumn: `${block.x + 1} / span ${block.width}`,
            gridRow: `${block.y + 1} / span ${block.height}`,
          }}
        >
          <BlockContent
            block={block}
            project={
              block.projectId ? projectById.get(block.projectId) : undefined
            }
            ownerView={ownerView}
            showEmpty={showEmpty}
          />
        </div>
      ))}
    </div>
  );
}

function MobileLayout({
  blocks,
  projectById,
  ownerView,
  showEmpty,
  responsive,
}: {
  blocks: GridBlock[];
  projectById: Map<string, GridProjectView>;
  ownerView: boolean;
  showEmpty: boolean;
  responsive: boolean;
}) {
  return (
    <div
      className={responsive ? "mt-12 grid gap-6 md:hidden" : "mt-12 grid gap-6"}
      style={{ gridTemplateColumns: "minmax(0, 1fr)" }}
    >
      {sortGridBlocksForMobile(blocks).map((block) => (
        <div key={block.key} className="min-w-0">
          <BlockContent
            block={block}
            project={
              block.projectId ? projectById.get(block.projectId) : undefined
            }
            ownerView={ownerView}
            showEmpty={showEmpty}
          />
        </div>
      ))}
    </div>
  );
}

export function GridLayoutRenderer({
  blocks,
  projects,
  mode,
  ownerView,
  showEmpty = false,
}: RendererProps): React.ReactNode {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const visibleBlocks = blocks.filter((block) => {
    if (!showEmpty && isEmptyGridBlock(block)) return false;
    if (block.type !== "PROJECT" || ownerView) return true;
    const project = block.projectId
      ? projectById.get(block.projectId)
      : undefined;
    return Boolean(project && !project.private);
  });

  if (visibleBlocks.length === 0) return <EmptyLayout />;

  if (mode === "desktop") {
    return (
      <DesktopLayout
        blocks={visibleBlocks}
        projectById={projectById}
        ownerView={ownerView}
        showEmpty={showEmpty}
        responsive={false}
      />
    );
  }
  if (mode === "mobile") {
    return (
      <MobileLayout
        blocks={visibleBlocks}
        projectById={projectById}
        ownerView={ownerView}
        showEmpty={showEmpty}
        responsive={false}
      />
    );
  }
  return (
    <>
      <DesktopLayout
        blocks={visibleBlocks}
        projectById={projectById}
        ownerView={ownerView}
        showEmpty={showEmpty}
        responsive
      />
      <MobileLayout
        blocks={visibleBlocks}
        projectById={projectById}
        ownerView={ownerView}
        showEmpty={showEmpty}
        responsive
      />
    </>
  );
}
