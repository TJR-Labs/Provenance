"use client";

import type { BlockKind, EditorProject, EditorSection } from "./site-editor";

const ABOUT_BLOCKS: { type: BlockKind; label: string; glyph: string }[] = [
  { type: "TEXT", label: "Text", glyph: "T" },
  { type: "IMAGE", label: "Image", glyph: "▧" },
  { type: "GALLERY", label: "Gallery", glyph: "▦" },
  { type: "EMBED", label: "Embed", glyph: "↗" },
  { type: "CODE", label: "Code", glyph: "</>" },
  { type: "QUOTE", label: "Quote", glyph: "“”" },
  { type: "LINK", label: "Link", glyph: "⌁" },
];

type InspectorBlocksProps = {
  selectedSection: EditorSection | null;
  projects: EditorProject[];
  onAddBlock: (
    type: BlockKind,
    anchor: { left: number; top: number; bottom: number },
  ) => void;
  onAddProject: (projectId: string) => void;
};

function AutomaticContent({ kind }: { kind: EditorSection["kind"] }) {
  const detail =
    kind === "HERO"
      ? "profile bio and name"
      : kind === "BUILD_LOG"
        ? "latest 5 build-log entries"
        : "profile links";
  return (
    <div className="border-line bg-raised rounded-lg border border-dashed p-5">
      <p className="text-ink text-sm font-medium">Automatic content</p>
      <p className="text-muted mt-2 text-sm leading-6">
        This section&apos;s content is automatic — it always shows your {detail}
        .
      </p>
    </div>
  );
}

export function InspectorBlocks({
  selectedSection,
  projects,
  onAddBlock,
  onAddProject,
}: InspectorBlocksProps) {
  if (!selectedSection) {
    return (
      <div className="p-5">
        <p className="text-muted text-sm">
          Select a section in the sheet to manage its content.
        </p>
      </div>
    );
  }

  if (
    selectedSection.kind === "HERO" ||
    selectedSection.kind === "BUILD_LOG" ||
    selectedSection.kind === "LINKS"
  ) {
    return (
      <div className="p-4">
        <AutomaticContent kind={selectedSection.kind} />
      </div>
    );
  }

  if (selectedSection.kind === "ABOUT") {
    return (
      <div className="p-4">
        <h2 className="text-ink font-semibold">Add a block</h2>
        <p className="text-muted mt-1 text-sm">
          Blocks are appended to the About section.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {ABOUT_BLOCKS.map((block) => (
            <button
              key={block.type}
              type="button"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onAddBlock(block.type, {
                  left: rect.left,
                  top: rect.top,
                  bottom: rect.bottom,
                });
              }}
              className="border-line bg-surface hover:border-accent hover:bg-raised flex min-h-20 flex-col items-start justify-between rounded-lg border p-3 text-left transition-colors"
            >
              <span
                aria-hidden="true"
                className="text-accent font-mono text-sm"
              >
                {block.glyph}
              </span>
              <span className="text-ink text-sm font-medium">
                {block.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const placedIds = new Set(
    selectedSection.blocks.flatMap((block) =>
      block.type === "PROJECT" && block.projectId ? [block.projectId] : [],
    ),
  );
  const available = projects.filter((project) => !placedIds.has(project.id));

  return (
    <div className="p-4">
      <h2 className="text-ink font-semibold">Add project</h2>
      <p className="text-muted mt-1 text-sm">
        Choose a project that is not already placed.
      </p>
      {available.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {available.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                onClick={() => onAddProject(project.id)}
                className="border-line bg-surface hover:border-accent hover:bg-raised w-full rounded-lg border p-3 text-left transition-colors"
              >
                <span className="text-ink block truncate text-sm font-medium">
                  {project.title}
                </span>
                <span className="text-muted mt-1 line-clamp-2 block text-xs">
                  {project.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-line bg-raised text-muted mt-4 rounded-lg border border-dashed p-4 text-sm">
          Every available project is already placed.
        </div>
      )}
    </div>
  );
}
