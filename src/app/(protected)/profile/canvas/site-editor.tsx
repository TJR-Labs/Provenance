"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { safeExternalUrl } from "~/app/safe-external-url";
import { useUnsavedNavigationWarning } from "~/app/use-unsaved-navigation-warning";
import { BODY_FONTS, HEADING_FONTS, isAllowedEmbedUrl } from "~/lib/site-style";
import { api, type RouterInputs, type RouterOutputs } from "~/trpc/react";
import { AUTOSAVE_INTERVAL_MS, createAutosaveController } from "./autosave";
import { BlockEditorPopup } from "./block-editor-popup";
import { InspectorBlocks } from "./inspector-blocks";
import { InspectorSections } from "./inspector-sections";
import { InspectorStyles } from "./inspector-styles";

export type EditorStateData = RouterOutputs["site"]["getEditorState"];
export type SiteSnapshot = RouterInputs["site"]["saveDraft"];
export type EditorSection = SiteSnapshot["sections"][number];
export type EditorBlock = EditorSection["blocks"][number];
export type EditorStyle = SiteSnapshot["style"];
export type SectionKind = EditorSection["kind"];
export type BlockKind = EditorBlock["type"];
export type EditorProject = EditorStateData["projects"][number];

type EditableState = {
  sections: EditorSection[];
  style: EditorStyle;
};

type PopupState = {
  blockKey: string;
  anchor: { left: number; top: number; bottom: number };
  isNew: boolean;
  wasDirty: boolean;
};

type InspectorTab = "sections" | "blocks" | "styles";
type DeviceMode = "desktop" | "mobile";
type PublishStatus = "idle" | "pending" | "success" | "error";

const SECTION_ORDER: SectionKind[] = [
  "HERO",
  "PROJECT_GRID",
  "ABOUT",
  "BUILD_LOG",
  "LINKS",
];

const SECTION_LABELS: Record<SectionKind, string> = {
  HERO: "Hero",
  PROJECT_GRID: "Project grid",
  ABOUT: "About",
  BUILD_LOG: "Build log",
  LINKS: "Links",
};

function cloneState(state: EditableState): EditableState {
  return {
    style: { ...state.style },
    sections: state.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => ({
        ...block,
        galleryImages: block.galleryImages?.map((image) => ({ ...image })),
      })),
    })),
  };
}

function galleryImages(
  value: unknown,
): NonNullable<EditorBlock["galleryImages"]> {
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
        resourceId:
          typeof image.resourceId === "string" ? image.resourceId : null,
        caption: typeof image.caption === "string" ? image.caption : null,
      },
    ];
  });
}

function normalizeBlock(
  block: EditorStateData["sections"][number]["blocks"][number],
): EditorBlock {
  const base = {
    type: block.type,
    key: block.key,
    order: block.order,
  };
  switch (block.type) {
    case "TEXT":
      return { ...base, textContent: block.textContent ?? "" };
    case "IMAGE":
      return {
        ...base,
        imageUrl: block.imageUrl ?? "",
        imageResourceId: block.imageResourceId ?? "",
        imageCaption: block.imageCaption ?? "",
      };
    case "GALLERY":
      return { ...base, galleryImages: galleryImages(block.galleryImages) };
    case "EMBED":
      return { ...base, embedUrl: block.embedUrl ?? "" };
    case "CODE":
      return {
        ...base,
        codeContent: block.codeContent ?? "",
        codeLanguage: block.codeLanguage ?? "",
      };
    case "QUOTE":
      return {
        ...base,
        quoteText: block.quoteText ?? "",
        quoteAttribution: block.quoteAttribution ?? "",
      };
    case "PROJECT":
      return { ...base, projectId: block.projectId ?? "" };
    case "LINK":
      return {
        ...base,
        linkLabel: block.linkLabel ?? "",
        linkUrl: block.linkUrl ?? "",
      };
  }
}

function initialEditableState(data: EditorStateData): EditableState {
  return {
    style: { ...data.style },
    sections: data.sections.map((section) => ({
      kind: section.kind,
      order: section.order,
      visible: section.visible,
      blocks: section.blocks.map(normalizeBlock),
    })),
  };
}

function createBlock(type: BlockKind, key: string, order: number): EditorBlock {
  const base = { type, key, order };
  switch (type) {
    case "TEXT":
      return { ...base, textContent: "" };
    case "IMAGE":
      return {
        ...base,
        imageUrl: "",
        imageResourceId: "",
        imageCaption: "",
      };
    case "GALLERY":
      return { ...base, galleryImages: [] };
    case "EMBED":
      return { ...base, embedUrl: "" };
    case "CODE":
      return { ...base, codeContent: "", codeLanguage: "" };
    case "QUOTE":
      return { ...base, quoteText: "", quoteAttribution: "" };
    case "PROJECT":
      return { ...base, projectId: "" };
    case "LINK":
      return { ...base, linkLabel: "", linkUrl: "" };
  }
}

function blockIsComplete(block: EditorBlock) {
  switch (block.type) {
    case "TEXT":
      return Boolean(block.textContent?.trim());
    case "IMAGE":
      return Boolean(block.imageUrl && block.imageResourceId);
    case "GALLERY":
      return Array.isArray(block.galleryImages);
    case "EMBED":
      return Boolean(block.embedUrl && isAllowedEmbedUrl(block.embedUrl));
    case "CODE":
      return Boolean(block.codeContent?.trim());
    case "QUOTE":
      return Boolean(block.quoteText?.trim());
    case "PROJECT":
      return Boolean(block.projectId);
    case "LINK":
      return Boolean(
        block.linkLabel?.trim() &&
        block.linkUrl &&
        safeExternalUrl(block.linkUrl),
      );
  }
}

function buildSections(sections: EditorSection[]) {
  return [...sections]
    .sort((a, b) => a.order - b.order)
    .map((section, sectionIndex) => ({
      ...section,
      order: sectionIndex,
      blocks: [...section.blocks]
        .sort((a, b) => a.order - b.order)
        .map((block, blockIndex) => ({ ...block, order: blockIndex })),
    }));
}

function profileLinks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return [];
    }
    const link = item as Record<string, unknown>;
    return typeof link.label === "string" && typeof link.url === "string"
      ? [{ label: link.label, url: link.url }]
      : [];
  });
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="border-line bg-canvas flex rounded-lg border p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === option.value
              ? "bg-raised text-ink shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SectionHeading({
  children,
  style,
}: {
  children: React.ReactNode;
  style: EditorStyle;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <h3
        className="text-xs font-semibold tracking-[0.14em] uppercase"
        style={{ color: style.colorAccent }}
      >
        {children}
      </h3>
      <span
        className="h-px flex-1"
        style={{ backgroundColor: style.colorLine }}
      />
    </div>
  );
}

function ProjectPreview({
  project,
  style,
}: {
  project: EditorProject;
  style: EditorStyle;
}) {
  const media = project.media[0];
  return (
    <article
      className="overflow-hidden border"
      style={{
        borderColor: style.colorLine,
        borderRadius: style.cornerRadius,
      }}
    >
      {media?.mimeType?.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.url}
          alt=""
          className="aspect-[3/2] w-full object-cover"
        />
      ) : (
        <div
          className="flex aspect-[3/2] items-center justify-center text-xs uppercase"
          style={{
            backgroundColor: style.colorLine,
            color: style.colorText,
          }}
        >
          {media ? media.kind : "No media"}
        </div>
      )}
      <div className="p-4">
        <h4
          className="text-lg font-semibold"
          style={{ fontFamily: HEADING_FONTS[style.typefacePairing] }}
        >
          {project.title}
        </h4>
        <p className="mt-2 line-clamp-3 text-sm opacity-70">
          {project.description}
        </p>
      </div>
    </article>
  );
}

function BlockPreview({
  block,
  style,
}: {
  block: EditorBlock;
  style: EditorStyle;
}) {
  switch (block.type) {
    case "TEXT":
      return (
        <p className="text-sm leading-7 whitespace-pre-wrap">
          {block.textContent?.trim() ? block.textContent : "Empty text block"}
        </p>
      );
    case "IMAGE":
      return block.imageUrl ? (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.imageUrl}
            alt={block.imageCaption ?? ""}
            className="max-h-[32rem] w-full object-cover"
            style={{ borderRadius: style.cornerRadius }}
          />
          {block.imageCaption ? (
            <figcaption className="mt-2 text-xs opacity-65">
              {block.imageCaption}
            </figcaption>
          ) : null}
        </figure>
      ) : (
        <p className="text-sm opacity-60">Upload an image.</p>
      );
    case "GALLERY":
      return block.galleryImages?.length ? (
        <div className="grid grid-cols-2 gap-2">
          {block.galleryImages.map((image, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${image.resourceId ?? image.url}-${index}`}
              src={image.url}
              alt={image.caption ?? ""}
              className="aspect-square w-full object-cover"
              style={{ borderRadius: style.cornerRadius }}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm opacity-60">Add images to this gallery.</p>
      );
    case "EMBED":
      return block.embedUrl && isAllowedEmbedUrl(block.embedUrl) ? (
        <iframe
          src={block.embedUrl}
          title="Embedded content"
          loading="lazy"
          className="aspect-video w-full border"
          style={{
            borderColor: style.colorLine,
            borderRadius: style.cornerRadius,
          }}
        />
      ) : (
        <p className="text-sm opacity-60">Add an allowed embed URL.</p>
      );
    case "CODE":
      return (
        <div>
          {block.codeLanguage ? (
            <p
              className="mb-2 font-mono text-[10px] tracking-[0.12em] uppercase"
              style={{ color: style.colorAccent }}
            >
              {block.codeLanguage}
            </p>
          ) : null}
          <pre
            className="overflow-x-auto border p-4 font-mono text-xs"
            style={{
              borderColor: style.colorLine,
              borderRadius: style.cornerRadius,
            }}
          >
            <code>
              {block.codeContent?.trim() ? block.codeContent : "Add code."}
            </code>
          </pre>
        </div>
      );
    case "QUOTE":
      return (
        <blockquote
          className="border-l-2 pl-5 text-xl leading-8"
          style={{
            borderColor: style.colorAccent,
            fontFamily: HEADING_FONTS[style.typefacePairing],
          }}
        >
          {block.quoteText?.trim() ? block.quoteText : "Add a quote."}
          {block.quoteAttribution ? (
            <footer className="mt-3 text-sm opacity-65">
              — {block.quoteAttribution}
            </footer>
          ) : null}
        </blockquote>
      );
    case "LINK": {
      const href = block.linkUrl ? safeExternalUrl(block.linkUrl) : null;
      return href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex border px-4 py-2 text-sm font-medium"
          style={{
            borderColor: style.colorLine,
            borderRadius: style.cornerRadius,
            color: style.colorAccent,
          }}
        >
          {block.linkLabel}
        </a>
      ) : (
        <p className="text-sm opacity-60">Add a valid link.</p>
      );
    }
    case "PROJECT":
      return null;
  }
}

type SiteEditorProps = {
  initialState: EditorStateData;
};

export function SiteEditor({ initialState }: SiteEditorProps) {
  const router = useRouter();
  const saveDraft = api.site.saveDraft.useMutation();
  const publish = api.site.publish.useMutation();
  const [editable, setEditable] = useState<EditableState>(() =>
    initialEditableState(initialState),
  );
  const [revision, setRevision] = useState(initialState.revision);
  const [dirty, setDirty] = useState(false);
  const [selectedKind, setSelectedKind] = useState<SectionKind | null>(
    initialState.sections.find((section) => section.visible)?.kind ?? "HERO",
  );
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("sections");
  const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");
  const [publishStatus, setPublishStatus] = useState<PublishStatus>("idle");
  const [publishError, setPublishError] = useState("");
  const [autosaveError, setAutosaveError] = useState("");
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [historyAvailability, setHistoryAvailability] = useState({
    canUndo: false,
    canRedo: false,
  });

  const stateRef = useRef(editable);
  stateRef.current = editable;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const changeVersionRef = useRef(0);
  const keyCounterRef = useRef(
    initialState.sections.reduce(
      (count, section) => count + section.blocks.length,
      0,
    ),
  );
  const historyRef = useRef<{
    past: EditableState[];
    future: EditableState[];
  }>({ past: [], future: [] });
  const controllerRef = useRef<ReturnType<
    typeof createAutosaveController
  > | null>(null);
  const saveDraftRef = useRef(saveDraft.mutateAsync);
  saveDraftRef.current = saveDraft.mutateAsync;
  const popupTriggerRef = useRef<HTMLElement | null>(null);

  const syncHistory = useCallback(() => {
    setHistoryAvailability({
      canUndo: historyRef.current.past.length > 0,
      canRedo: historyRef.current.future.length > 0,
    });
  }, []);

  const commitHistory = useCallback(() => {
    historyRef.current.past.push(cloneState(stateRef.current));
    historyRef.current.future = [];
    syncHistory();
  }, [syncHistory]);

  const markDirty = useCallback(() => {
    changeVersionRef.current += 1;
    dirtyRef.current = true;
    setDirty(true);
    controllerRef.current?.notifyChange();
  }, []);

  const applyChange = useCallback(
    (
      update: (current: EditableState) => EditableState,
      options: { history?: boolean; dirty?: boolean } = {},
    ) => {
      if (options.history !== false) commitHistory();
      const next = update(stateRef.current);
      stateRef.current = next;
      setEditable(next);
      if (options.dirty !== false) markDirty();
    },
    [commitHistory, markDirty],
  );

  const buildSnapshot = useCallback((): SiteSnapshot | null => {
    const current = stateRef.current;
    if (
      current.sections.some((section) =>
        section.blocks.some((block) => !blockIsComplete(block)),
      )
    ) {
      return null;
    }
    return {
      revision: revisionRef.current + 1,
      sections: buildSections(current.sections),
      style: { ...current.style },
    };
  }, []);

  const runSave = useCallback(async () => {
    const payload = buildSnapshot();
    if (!payload) {
      setAutosaveError("Finish the open block before this draft can save.");
      return;
    }
    const version = changeVersionRef.current;
    try {
      const result = await saveDraftRef.current(payload);
      revisionRef.current = Math.max(revisionRef.current, result.revision);
      setRevision(revisionRef.current);
      setAutosaveError("");
      if (changeVersionRef.current === version) {
        dirtyRef.current = false;
        setDirty(false);
      } else {
        controllerRef.current?.notifyChange();
      }
    } catch {
      setAutosaveError("Autosave failed. Your changes are still local.");
      controllerRef.current?.notifyChange();
    }
  }, [buildSnapshot]);

  const startAutosave = useCallback(() => {
    controllerRef.current?.stop();
    controllerRef.current = createAutosaveController({
      intervalMs: AUTOSAVE_INTERVAL_MS,
      save: runSave,
    });
  }, [runSave]);

  useEffect(() => {
    startAutosave();
    return () => {
      controllerRef.current?.flush();
      controllerRef.current = null;
    };
  }, [startAutosave]);

  useUnsavedNavigationWarning(dirty);

  const restoreHistory = useCallback(
    (snapshot: EditableState) => {
      const restored = cloneState(snapshot);
      stateRef.current = restored;
      setEditable(restored);
      setPopup(null);
      markDirty();
    },
    [markDirty],
  );

  const undo = useCallback(() => {
    const previous = historyRef.current.past.pop();
    if (!previous) return false;
    historyRef.current.future.push(cloneState(stateRef.current));
    restoreHistory(previous);
    syncHistory();
    return true;
  }, [restoreHistory, syncHistory]);

  const redo = useCallback(() => {
    const next = historyRef.current.future.pop();
    if (!next) return false;
    historyRef.current.past.push(cloneState(stateRef.current));
    restoreHistory(next);
    syncHistory();
    return true;
  }, [restoreHistory, syncHistory]);

  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      const handled =
        key === "z" && !event.shiftKey
          ? undo()
          : key === "y" || (key === "z" && event.shiftKey)
            ? redo()
            : false;
      if (handled) event.preventDefault();
    }
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [redo, undo]);

  const orderedSections = useMemo(
    () => [...editable.sections].sort((a, b) => a.order - b.order),
    [editable.sections],
  );
  const selectedSection =
    orderedSections.find((section) => section.kind === selectedKind) ?? null;
  const projectsById = useMemo(
    () =>
      new Map(initialState.projects.map((project) => [project.id, project])),
    [initialState.projects],
  );
  const links = useMemo(
    () => profileLinks(initialState.profile.links),
    [initialState.profile.links],
  );

  function selectSection(kind: SectionKind) {
    setSelectedKind(kind);
    setInspectorTab("blocks");
  }

  function moveSection(kind: SectionKind, direction: -1 | 1) {
    applyChange((current) => {
      const sections = buildSections(current.sections);
      const index = sections.findIndex((section) => section.kind === kind);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= sections.length) return current;
      [sections[index], sections[target]] = [
        sections[target]!,
        sections[index]!,
      ];
      return { ...current, sections: buildSections(sections) };
    });
  }

  function toggleSection(kind: SectionKind) {
    applyChange((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.kind === kind
          ? { ...section, visible: !section.visible }
          : section,
      ),
    }));
  }

  function revealSection(kind: SectionKind) {
    applyChange((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.kind === kind ? { ...section, visible: true } : section,
      ),
    }));
    setSelectedKind(kind);
  }

  function addBlock(
    type: BlockKind,
    anchor: { left: number; top: number; bottom: number },
  ) {
    const about = stateRef.current.sections.find(
      (section) => section.kind === "ABOUT",
    );
    if (!about) return;
    keyCounterRef.current += 1;
    const key = `new-${keyCounterRef.current}`;
    const block = createBlock(type, key, about.blocks.length);
    const wasDirty = dirtyRef.current;
    applyChange((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.kind === "ABOUT"
          ? { ...section, blocks: [...section.blocks, block] }
          : section,
      ),
    }));
    setPopup({ blockKey: key, anchor, isNew: true, wasDirty });
  }

  function addProject(projectId: string) {
    applyChange((current) => ({
      ...current,
      sections: current.sections.map((section) => {
        if (section.kind !== "PROJECT_GRID") return section;
        keyCounterRef.current += 1;
        return {
          ...section,
          blocks: [
            ...section.blocks,
            {
              type: "PROJECT",
              key: `new-${keyCounterRef.current}`,
              order: section.blocks.length,
              projectId,
            },
          ],
        };
      }),
    }));
  }

  function patchBlock(
    key: string,
    patch: Partial<EditorBlock>,
    recordHistory: boolean,
  ) {
    applyChange(
      (current) => ({
        ...current,
        sections: current.sections.map((section) => ({
          ...section,
          blocks: section.blocks.map((block) =>
            block.key === key ? { ...block, ...patch } : block,
          ),
        })),
      }),
      { history: recordHistory },
    );
  }

  function removeBlock(key: string) {
    applyChange((current) => ({
      ...current,
      sections: current.sections.map((section) => ({
        ...section,
        blocks: section.blocks
          .filter((block) => block.key !== key)
          .map((block, index) => ({ ...block, order: index })),
      })),
    }));
  }

  function openBlockEditor(blockKey: string, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    popupTriggerRef.current = element;
    setPopup({
      blockKey,
      anchor: { left: rect.left, top: rect.top, bottom: rect.bottom },
      isNew: false,
      wasDirty: dirtyRef.current,
    });
  }

  function cancelPopup() {
    if (!popup) return;
    if (popup.isNew) {
      const next = {
        ...stateRef.current,
        sections: stateRef.current.sections.map((section) => ({
          ...section,
          blocks: section.blocks
            .filter((block) => block.key !== popup.blockKey)
            .map((block, index) => ({ ...block, order: index })),
        })),
      };
      stateRef.current = next;
      setEditable(next);
      historyRef.current.past.pop();
      syncHistory();
      dirtyRef.current = popup.wasDirty;
      setDirty(popup.wasDirty);
    }
    setPopup(null);
    popupTriggerRef.current?.focus();
    popupTriggerRef.current = null;
  }

  function savePopup(patch: Partial<EditorBlock>) {
    if (!popup) return;
    patchBlock(popup.blockKey, patch, !popup.isNew);
    setPopup(null);
    setAutosaveError("");
    popupTriggerRef.current?.focus();
    popupTriggerRef.current = null;
  }

  async function handlePublish() {
    if (publishStatus === "pending") return;
    const payload = buildSnapshot();
    if (!payload) {
      setPublishStatus("error");
      setPublishError("Finish every new block before publishing.");
      return;
    }
    controllerRef.current?.stop();
    setPublishStatus("pending");
    setPublishError("");
    try {
      const result = await publish.mutateAsync(payload);
      revisionRef.current = result.revision;
      setRevision(result.revision);
      dirtyRef.current = false;
      setDirty(false);
      setPublishStatus("success");
      router.refresh();
      window.setTimeout(
        () =>
          setPublishStatus((status) =>
            status === "success" ? "idle" : status,
          ),
        2500,
      );
    } catch (caught) {
      setPublishStatus("error");
      setPublishError(
        caught instanceof Error ? caught.message : "Publish failed.",
      );
    } finally {
      startAutosave();
    }
  }

  const popupBlock = popup
    ? editable.sections
        .flatMap((section) => section.blocks)
        .find((block) => block.key === popup.blockKey)
    : null;
  const nextHiddenKind = SECTION_ORDER.find(
    (kind) =>
      !editable.sections.find((section) => section.kind === kind)?.visible,
  );
  const headingStyle: CSSProperties = {
    fontFamily: HEADING_FONTS[editable.style.typefacePairing],
  };
  const sheetTransition =
    editable.style.motionLevel === "none"
      ? ""
      : editable.style.motionLevel === "subtle"
        ? "transition-[width,background-color,color] duration-200"
        : "transition-all duration-500";

  return (
    <div
      data-theme="dark"
      className="bg-canvas text-ink flex min-h-0 flex-1 flex-col"
    >
      <header className="border-line bg-surface flex h-14 shrink-0 items-center gap-3 border-b px-5">
        <div className="min-w-0">
          <h1 className="text-ink text-sm font-bold">Editor</h1>
          <p className="text-muted truncate font-mono text-[10px] tracking-[0.14em] uppercase">
            {initialState.profile.displayName} · SITE
          </p>
        </div>
        <button
          type="button"
          disabled={!historyAvailability.canUndo}
          onClick={undo}
          className="text-muted hover:bg-raised hover:text-ink rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-30"
        >
          Undo
        </button>
        <div className="flex-1" />
        <SegmentedControl
          label="Preview width"
          value={deviceMode}
          options={[
            { value: "desktop", label: "Desktop" },
            { value: "mobile", label: "Mobile" },
          ]}
          onChange={setDeviceMode}
        />
        <button
          type="button"
          onClick={() =>
            window.open(`/${initialState.username}`, "_blank", "noopener")
          }
          className="text-muted hover:bg-raised hover:text-ink rounded-md px-3 py-1.5 text-sm font-medium"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={publishStatus === "pending"}
          onClick={() => void handlePublish()}
          className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-3.5 py-1.5 text-sm font-semibold disabled:opacity-50"
        >
          {publishStatus === "pending"
            ? "Publishing…"
            : publishStatus === "success"
              ? "Published"
              : "Publish"}
        </button>
      </header>

      {(publishStatus === "error" || autosaveError) && (
        <div
          role="alert"
          className="border-danger-line bg-danger-surface text-danger border-b px-5 py-2 text-xs"
        >
          {publishStatus === "error" ? publishError : autosaveError}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="bg-raised min-w-0 flex-1 overflow-y-auto p-5 sm:p-8">
          <div
            aria-label={`${deviceMode} site preview`}
            className={`mx-auto min-h-full w-full overflow-hidden shadow-2xl ${sheetTransition} ${
              deviceMode === "mobile" ? "max-w-[390px]" : "max-w-[780px]"
            }`}
            style={{
              backgroundColor: editable.style.colorBg,
              color: editable.style.colorText,
              borderRadius: editable.style.cornerRadius,
              fontFamily: BODY_FONTS[editable.style.typefacePairing],
            }}
          >
            {orderedSections
              .filter((section) => section.visible)
              .map((section) => (
                <section
                  key={section.kind}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${SECTION_LABELS[section.kind]} section`}
                  onClick={() => selectSection(section.kind)}
                  onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectSection(section.kind);
                    }
                  }}
                  className="relative border-2 border-transparent px-6 py-10 outline-none sm:px-10 sm:py-14"
                  style={
                    selectedKind === section.kind
                      ? {
                          borderColor: editable.style.colorAccent,
                          boxShadow: `inset 0 0 0 1px ${editable.style.colorAccent}`,
                        }
                      : undefined
                  }
                >
                  {section.kind === "HERO" ? (
                    <div className="flex flex-col gap-5">
                      {initialState.profile.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={initialState.profile.avatarUrl}
                          alt=""
                          className="size-20 object-cover"
                          style={{ borderRadius: editable.style.cornerRadius }}
                        />
                      ) : null}
                      <div>
                        <h2
                          className="text-4xl font-semibold tracking-tight sm:text-6xl"
                          style={headingStyle}
                        >
                          {initialState.profile.displayName}
                        </h2>
                        <p className="mt-4 max-w-2xl text-base leading-7 opacity-70">
                          {initialState.profile.bio}
                        </p>
                      </div>
                    </div>
                  ) : section.kind === "PROJECT_GRID" ? (
                    <>
                      <SectionHeading style={editable.style}>
                        Projects
                      </SectionHeading>
                      {section.blocks.length > 0 ? (
                        <div className="grid gap-5 sm:grid-cols-2">
                          {section.blocks.map((block) => {
                            const project = block.projectId
                              ? projectsById.get(block.projectId)
                              : undefined;
                            return (
                              <div key={block.key} className="group relative">
                                {project ? (
                                  <ProjectPreview
                                    project={project}
                                    style={editable.style}
                                  />
                                ) : (
                                  <div
                                    className="border border-dashed p-5 text-sm opacity-60"
                                    style={{
                                      borderColor: editable.style.colorLine,
                                      borderRadius: editable.style.cornerRadius,
                                    }}
                                  >
                                    Project unavailable
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removeBlock(block.key);
                                  }}
                                  className="bg-surface text-danger absolute top-2 right-2 rounded px-2 py-1 text-xs opacity-0 shadow group-hover:opacity-100 focus:opacity-100"
                                >
                                  Remove
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm opacity-60">
                          Add projects from the Blocks tab.
                        </p>
                      )}
                    </>
                  ) : section.kind === "ABOUT" ? (
                    <>
                      <SectionHeading style={editable.style}>
                        About
                      </SectionHeading>
                      <div className="space-y-6">
                        {section.blocks.map((block) => (
                          <div
                            key={block.key}
                            className="group relative border border-transparent p-1"
                          >
                            <BlockPreview
                              block={block}
                              style={editable.style}
                            />
                            <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openBlockEditor(
                                    block.key,
                                    event.currentTarget,
                                  );
                                }}
                                className="bg-surface text-ink rounded px-2 py-1 text-xs shadow"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeBlock(block.key);
                                }}
                                className="bg-surface text-danger rounded px-2 py-1 text-xs shadow"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                        {section.blocks.length === 0 ? (
                          <p className="text-sm opacity-60">
                            Add content from the Blocks tab.
                          </p>
                        ) : null}
                      </div>
                    </>
                  ) : section.kind === "BUILD_LOG" ? (
                    <>
                      <SectionHeading style={editable.style}>
                        Build log
                      </SectionHeading>
                      <div className="space-y-5">
                        {initialState.devlogEntries.map((entry) => (
                          <article
                            key={entry.id}
                            className="border-l-2 pl-4"
                            style={{
                              borderColor: editable.style.colorAccent,
                            }}
                          >
                            <p className="font-mono text-[10px] tracking-[0.12em] uppercase opacity-60">
                              {entry.createdAt.toLocaleDateString()} ·{" "}
                              {entry.label}
                            </p>
                            <p className="mt-2 text-sm leading-6">
                              {entry.body}
                            </p>
                          </article>
                        ))}
                        {initialState.devlogEntries.length === 0 ? (
                          <p className="text-sm opacity-60">
                            No build-log entries yet.
                          </p>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <>
                      <SectionHeading style={editable.style}>
                        Links
                      </SectionHeading>
                      <div className="flex flex-wrap gap-3">
                        {links.map((link) => {
                          const href = safeExternalUrl(link.url);
                          return href ? (
                            <a
                              key={`${link.label}-${link.url}`}
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="border px-4 py-2 text-sm font-medium"
                              style={{
                                borderColor: editable.style.colorLine,
                                borderRadius: editable.style.cornerRadius,
                                color: editable.style.colorAccent,
                              }}
                            >
                              {link.label}
                            </a>
                          ) : null;
                        })}
                        {links.length === 0 ? (
                          <p className="text-sm opacity-60">
                            Add links from Edit profile.
                          </p>
                        ) : null}
                      </div>
                    </>
                  )}
                </section>
              ))}

            {nextHiddenKind ? (
              <div className="flex justify-center px-6 py-8">
                <button
                  type="button"
                  onClick={() => revealSection(nextHiddenKind)}
                  className="rounded-full border border-dashed px-4 py-2 text-sm opacity-60 transition-opacity hover:opacity-100"
                  style={{ borderColor: editable.style.colorLine }}
                >
                  + Add {SECTION_LABELS[nextHiddenKind]}
                </button>
              </div>
            ) : null}
          </div>
        </main>

        <aside className="border-line bg-surface flex w-[324px] shrink-0 flex-col border-l">
          <div className="border-line border-b p-3">
            <SegmentedControl
              label="Inspector tab"
              value={inspectorTab}
              options={[
                { value: "sections", label: "Sections" },
                { value: "blocks", label: "Blocks" },
                { value: "styles", label: "Styles" },
              ]}
              onChange={setInspectorTab}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {inspectorTab === "sections" ? (
              <InspectorSections
                sections={orderedSections}
                selectedKind={selectedKind}
                onSelect={(kind) => setSelectedKind(kind)}
                onMove={moveSection}
                onToggleVisible={toggleSection}
                onReveal={revealSection}
              />
            ) : inspectorTab === "blocks" ? (
              <InspectorBlocks
                selectedSection={selectedSection}
                projects={initialState.projects}
                onAddBlock={addBlock}
                onAddProject={addProject}
              />
            ) : (
              <InspectorStyles
                style={editable.style}
                onChange={(patch) =>
                  applyChange((current) => ({
                    ...current,
                    style: { ...current.style, ...patch },
                  }))
                }
              />
            )}
          </div>
        </aside>
      </div>

      {popup && popupBlock ? (
        <BlockEditorPopup
          key={popup.blockKey}
          block={popupBlock}
          anchor={popup.anchor}
          onSave={savePopup}
          onCancel={cancelPopup}
        />
      ) : null}
    </div>
  );
}
