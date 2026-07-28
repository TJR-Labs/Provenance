"use client";

import type { EditorSection, SectionKind } from "./site-editor";

const SECTION_LABELS: Record<SectionKind, string> = {
  HERO: "Hero",
  PROJECT_GRID: "Project grid",
  ABOUT: "About",
  BUILD_LOG: "Build log",
  LINKS: "Links",
};

const SECTION_DESCRIPTORS: Record<SectionKind, string> = {
  HERO: "FULL BLEED · HEADLINE",
  PROJECT_GRID: "CURATED · TWO COLUMN",
  ABOUT: "FLEXIBLE · CONTENT BLOCKS",
  BUILD_LOG: "AUTOMATIC · LATEST 5",
  LINKS: "AUTOMATIC · INLINE ROW",
};

type InspectorSectionsProps = {
  sections: EditorSection[];
  selectedKind: SectionKind | null;
  onSelect: (kind: SectionKind) => void;
  onMove: (kind: SectionKind, direction: -1 | 1) => void;
  onToggleVisible: (kind: SectionKind) => void;
  onReveal: (kind: SectionKind) => void;
};

export function InspectorSections({
  sections,
  selectedKind,
  onSelect,
  onMove,
  onToggleVisible,
  onReveal,
}: InspectorSectionsProps) {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const hidden = ordered.filter((section) => !section.visible);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-ink font-semibold">Page sections</h2>
        <p className="text-muted mt-1 text-sm">
          Select, reorder, and show the parts of your site.
        </p>
      </div>

      <ol className="space-y-2">
        {ordered.map((section, index) => {
          const selected = section.kind === selectedKind;
          return (
            <li
              key={section.kind}
              className={`border-line flex items-center gap-2 rounded-lg border p-2 transition-colors ${
                selected ? "bg-raised ring-accent ring-1" : "bg-surface"
              } ${section.visible ? "" : "opacity-55"}`}
            >
              <button
                type="button"
                aria-label={`Select ${SECTION_LABELS[section.kind]} section`}
                onClick={() => onSelect(section.kind)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="text-faint mt-0.5 font-mono text-sm"
                  >
                    ⋮⋮
                  </span>
                  <span className="min-w-0">
                    <span className="text-ink block truncate text-sm font-medium">
                      {SECTION_LABELS[section.kind]}
                    </span>
                    <span className="text-muted mt-0.5 block truncate font-mono text-[9px] tracking-[0.12em] uppercase">
                      {SECTION_DESCRIPTORS[section.kind]}
                    </span>
                  </span>
                </span>
              </button>

              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  aria-label={`Move ${SECTION_LABELS[section.kind]} up`}
                  disabled={index === 0}
                  onClick={() => onMove(section.kind, -1)}
                  className="text-muted hover:bg-raised hover:text-ink rounded px-1.5 py-1 disabled:opacity-25"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${SECTION_LABELS[section.kind]} down`}
                  disabled={index === ordered.length - 1}
                  onClick={() => onMove(section.kind, 1)}
                  className="text-muted hover:bg-raised hover:text-ink rounded px-1.5 py-1 disabled:opacity-25"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`${section.visible ? "Hide" : "Show"} ${SECTION_LABELS[section.kind]}`}
                  aria-pressed={section.visible}
                  onClick={() => onToggleVisible(section.kind)}
                  className="text-muted hover:bg-raised hover:text-ink rounded px-1.5 py-1"
                >
                  <span aria-hidden="true">{section.visible ? "◉" : "○"}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {hidden.length > 0 ? (
        <div className="border-line border-t pt-4">
          <p className="text-muted font-mono text-[10px] tracking-[0.14em] uppercase">
            Add section
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {hidden.map((section) => (
              <button
                key={section.kind}
                type="button"
                onClick={() => onReveal(section.kind)}
                className="border-line-strong text-muted hover:border-accent hover:text-ink rounded-full border border-dashed px-3 py-1.5 text-xs transition-colors"
              >
                + {SECTION_LABELS[section.kind]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
