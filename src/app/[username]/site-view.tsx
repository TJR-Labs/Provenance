import type { ComponentProps, CSSProperties, ReactNode } from "react";

import type { BlockKind, SectionKind } from "../../../generated/prisma";
import { ProjectCard } from "~/app/project-card";
import { safeExternalUrl } from "~/app/safe-external-url";
import { faviconUrl } from "~/lib/link-favicon";
import {
  BODY_FONTS,
  HEADING_FONTS,
  isAllowedEmbedUrl,
  type SiteStyle,
} from "~/lib/site-style";

export type SiteLink = { label: string; url: string };

// Hero + Links render straight from the user's identity fields — neither
// section holds authored blocks.
export type SiteIdentity = {
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  links: SiteLink[];
};

export type SiteProject = ComponentProps<typeof ProjectCard>["project"];

export type SiteDevlogEntry = {
  id: string;
  label: string;
  body: string;
};

// Mirrors a published `Block` row. `galleryImages` stays `unknown` because it
// is a free-form Json column; it is coerced at render time.
export type SiteBlock = {
  id: string;
  key: string;
  order: number;
  type: BlockKind;
  projectId: string | null;
  textContent: string | null;
  imageUrl: string | null;
  imageCaption: string | null;
  galleryImages: unknown;
  embedUrl: string | null;
  codeContent: string | null;
  codeLanguage: string | null;
  quoteText: string | null;
  quoteAttribution: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
};

export type SiteSection = {
  id: string;
  kind: SectionKind;
  order: number;
  visible: boolean;
  blocks: SiteBlock[];
};

type SiteViewProps = {
  sections: SiteSection[];
  style: SiteStyle;
  identity: SiteIdentity;
  // Already visibility-filtered server-side: a visitor never receives a
  // private project, and the matching PROJECT block is dropped with it.
  projects: SiteProject[];
  devlogEntries: SiteDevlogEntry[];
  ownerView: boolean;
};

// ABOUT accepts every block kind except PROJECT (enforced by the section
// schema), so the content switch narrows the union first — that keeps the
// switch exhaustive and makes a future BlockKind a compile error.
type AboutBlockKind = Exclude<BlockKind, "PROJECT">;
type AboutBlock = SiteBlock & { type: AboutBlockKind };

// The Build log is never curated — it always shows the newest entries.
const BUILD_LOG_ENTRY_LIMIT = 5;

const HEADING_STYLE: CSSProperties = { fontFamily: "var(--font-heading)" };
const RADIUS_STYLE: CSSProperties = { borderRadius: "var(--site-radius)" };

const SECTION_HEADINGS: Record<SectionKind, string> = {
  HERO: "Hero",
  PROJECT_GRID: "Projects",
  ABOUT: "About",
  BUILD_LOG: "Build log",
  LINKS: "Links",
};

function galleryImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return [];
    }
    const image = item as Record<string, unknown>;
    if (typeof image.url !== "string") return [];
    return [
      {
        url: image.url,
        caption: typeof image.caption === "string" ? image.caption : null,
      },
    ];
  });
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <h2 className="text-accent text-xs font-semibold tracking-[0.14em] uppercase">
        {children}
      </h2>
      <span className="bg-line-strong h-px flex-1" />
    </div>
  );
}

function UnavailableProject() {
  return (
    <div
      className="border-line bg-raised text-muted flex h-full min-h-32 items-center justify-center border p-6 text-center font-mono text-xs tracking-[0.14em] uppercase"
      style={RADIUS_STYLE}
    >
      Project unavailable
    </div>
  );
}

// A safe-URL-gated external link with the favicon-by-domain treatment. Falls
// back to a plain, unlinked label whenever the stored URL fails the gate.
function SiteLinkChip({
  label,
  url,
  transition,
}: {
  label: string;
  url: string;
  transition: string;
}) {
  const href = safeExternalUrl(url);
  const favicon = faviconUrl(url);
  const content = (
    <>
      {favicon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={favicon} alt="" className="h-4 w-4 shrink-0 rounded" />
      ) : null}
      <span className="max-w-full truncate">{label}</span>
    </>
  );
  if (!href) {
    return (
      <span
        className="border-line text-faint flex items-center gap-2 border px-4 py-2"
        style={RADIUS_STYLE}
      >
        {content}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`border-line-strong hover:border-accent hover:text-accent flex items-center gap-2 border px-4 py-2 font-medium ${transition}`}
      style={RADIUS_STYLE}
    >
      {content}
    </a>
  );
}

function AboutBlockContent({
  block,
  transition,
}: {
  block: AboutBlock;
  transition: string;
}) {
  switch (block.type) {
    case "TEXT":
      return (
        <div
          className="leading-7 break-words [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
          // Safe: textContent is sanitized server-side (allowlisted tags,
          // http/https-only hrefs) before it is ever stored — see
          // sanitizeSiteText in src/server/site-editor.ts.
          dangerouslySetInnerHTML={{ __html: block.textContent ?? "" }}
        />
      );
    case "IMAGE":
      return block.imageUrl ? (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.imageUrl}
            alt={block.imageCaption ?? ""}
            className="max-h-[32rem] w-full object-cover"
            style={RADIUS_STYLE}
          />
          {block.imageCaption ? (
            <figcaption className="text-muted mt-2 text-sm">
              {block.imageCaption}
            </figcaption>
          ) : null}
        </figure>
      ) : null;
    case "GALLERY": {
      const images = galleryImages(block.galleryImages);
      return images.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${image.url}-${index}`}
              src={image.url}
              alt={image.caption ?? ""}
              className="aspect-square w-full object-cover"
              style={RADIUS_STYLE}
            />
          ))}
        </div>
      ) : null;
    }
    case "EMBED":
      // Defense in depth: the host allowlist is already enforced at write time
      // and by the CSP's frame-src, and re-checked here before rendering.
      return block.embedUrl && isAllowedEmbedUrl(block.embedUrl) ? (
        <iframe
          src={block.embedUrl}
          title="Embedded content"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          allowFullScreen
          className="border-line aspect-video w-full border"
          style={RADIUS_STYLE}
        />
      ) : null;
    case "CODE":
      return block.codeContent ? (
        <div>
          {block.codeLanguage ? (
            <p className="text-accent mb-2 font-mono text-[10px] tracking-[0.12em] uppercase">
              {block.codeLanguage}
            </p>
          ) : null}
          <pre
            className="border-line overflow-x-auto border p-4 font-mono text-xs"
            style={RADIUS_STYLE}
          >
            <code>{block.codeContent}</code>
          </pre>
        </div>
      ) : null;
    case "QUOTE":
      return block.quoteText ? (
        <blockquote
          className="border-accent border-l-2 pl-5 text-xl leading-8"
          style={HEADING_STYLE}
        >
          {block.quoteText}
          {block.quoteAttribution ? (
            <footer className="text-muted mt-3 text-sm">
              — {block.quoteAttribution}
            </footer>
          ) : null}
        </blockquote>
      ) : null;
    case "LINK":
      return block.linkUrl ? (
        <div className="flex">
          <SiteLinkChip
            label={block.linkLabel ?? block.linkUrl}
            url={block.linkUrl}
            transition={transition}
          />
        </div>
      ) : null;
    default: {
      const exhaustive: never = block.type;
      return exhaustive;
    }
  }
}

function SectionContent({
  section,
  identity,
  projectById,
  devlogEntries,
  ownerView,
  transition,
}: {
  section: SiteSection;
  identity: SiteIdentity;
  projectById: Map<string, SiteProject>;
  devlogEntries: SiteDevlogEntry[];
  ownerView: boolean;
  transition: string;
}) {
  if (section.kind === "HERO") {
    return (
      <div className="flex flex-col gap-6">
        {identity.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={identity.avatarUrl}
            alt=""
            className="border-line-strong bg-raised size-24 border object-cover"
            style={RADIUS_STYLE}
          />
        ) : (
          <div
            className="border-line-strong bg-raised text-ink flex size-24 items-center justify-center border text-4xl font-semibold"
            style={{ ...RADIUS_STYLE, ...HEADING_STYLE }}
          >
            {identity.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <h1
            className="text-4xl font-semibold tracking-tight break-words sm:text-6xl"
            style={HEADING_STYLE}
          >
            {identity.displayName}
          </h1>
          {identity.bio ? (
            <p className="text-muted mt-4 max-w-2xl text-base leading-7 break-words">
              {identity.bio}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (section.kind === "PROJECT_GRID") {
    return (
      <>
        <SectionHeading>{SECTION_HEADINGS.PROJECT_GRID}</SectionHeading>
        <div className="grid gap-6 sm:grid-cols-2">
          {section.blocks.map((block) => {
            const project = block.projectId
              ? projectById.get(block.projectId)
              : undefined;
            if (!project) {
              return ownerView ? <UnavailableProject key={block.id} /> : null;
            }
            return (
              <div
                key={block.id}
                className="overflow-hidden"
                style={RADIUS_STYLE}
              >
                <ProjectCard project={project} />
              </div>
            );
          })}
        </div>
      </>
    );
  }

  if (section.kind === "ABOUT") {
    return (
      <>
        <SectionHeading>{SECTION_HEADINGS.ABOUT}</SectionHeading>
        <div className="space-y-8">
          {section.blocks
            .filter((block): block is AboutBlock => block.type !== "PROJECT")
            .map((block) => (
              <AboutBlockContent
                key={block.id}
                block={block}
                transition={transition}
              />
            ))}
        </div>
      </>
    );
  }

  if (section.kind === "BUILD_LOG") {
    return (
      <>
        <SectionHeading>{SECTION_HEADINGS.BUILD_LOG}</SectionHeading>
        <p className="text-faint mb-5 font-mono text-[10px] tracking-[0.14em] uppercase">
          Latest {devlogEntries.length}{" "}
          {devlogEntries.length === 1 ? "entry" : "entries"}
        </p>
        <div className="space-y-6">
          {devlogEntries.map((entry) => (
            <article key={entry.id} className="border-accent border-l-2 pl-4">
              <p className="text-faint font-mono text-[10px] tracking-[0.12em] uppercase">
                {entry.label}
              </p>
              <p className="mt-2 text-sm leading-6 break-words whitespace-pre-wrap">
                {entry.body}
              </p>
            </article>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <SectionHeading>{SECTION_HEADINGS.LINKS}</SectionHeading>
      <div className="flex flex-wrap gap-3">
        {identity.links.map((link) => (
          <SiteLinkChip
            key={`${link.label}-${link.url}`}
            label={link.label}
            url={link.url}
            transition={transition}
          />
        ))}
      </div>
    </>
  );
}

// A section with nothing to show is skipped entirely rather than rendering an
// empty heading — the editor can leave a section visible before it has content.
function sectionHasContent(
  section: SiteSection,
  identity: SiteIdentity,
  devlogEntries: SiteDevlogEntry[],
) {
  switch (section.kind) {
    case "HERO":
      return true;
    case "PROJECT_GRID":
    case "ABOUT":
      return section.blocks.length > 0;
    case "BUILD_LOG":
      return devlogEntries.length > 0;
    case "LINKS":
      return identity.links.length > 0;
  }
}

export function SiteView({
  sections,
  style,
  identity,
  projects,
  devlogEntries,
  ownerView,
}: SiteViewProps) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const entries = devlogEntries.slice(0, BUILD_LOG_ENTRY_LIMIT);
  const visibleSections = sections
    .filter(
      (section) =>
        section.visible && sectionHasContent(section, identity, entries),
    )
    .sort((a, b) => a.order - b.order);
  // "none" opts out of every transition/animation in this subtree; "subtle" is
  // the app's standard hover transition; "full" additionally fades each section
  // in on entrance (driven by CSS in globals.css, keyed off data-motion).
  const transition = style.motionLevel === "none" ? "" : "transition-colors";

  const rootStyle = {
    "--site-bg": style.colorBg,
    "--site-text": style.colorText,
    "--site-accent": style.colorAccent,
    "--site-line": style.colorLine,
    "--site-radius": `${style.cornerRadius}px`,
    "--font-heading": HEADING_FONTS[style.typefacePairing],
    "--font-body": BODY_FONTS[style.typefacePairing],
    backgroundColor: style.colorBg,
    color: style.colorText,
    fontFamily: "var(--font-body)",
    borderRadius: `${style.cornerRadius}px`,
  } as CSSProperties;

  if (visibleSections.length === 0) {
    return (
      <div className="border-line-strong mt-12 rounded-lg border border-dashed px-6 py-14 text-center">
        <p className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
          No records yet
        </p>
        <p className="text-muted mt-3">Nothing here yet.</p>
      </div>
    );
  }

  return (
    <div
      className="site-view mt-12 overflow-hidden"
      data-motion={style.motionLevel}
      style={rootStyle}
    >
      {visibleSections.map((section, index) => (
        <section
          key={section.id}
          className="site-section px-6 py-10 sm:px-10 sm:py-14"
          style={{ "--site-section-index": index } as CSSProperties}
        >
          <SectionContent
            section={section}
            identity={identity}
            projectById={projectById}
            devlogEntries={entries}
            ownerView={ownerView}
            transition={transition}
          />
        </section>
      ))}
    </div>
  );
}
