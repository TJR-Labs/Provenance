"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";

import { ProjectCard } from "~/app/project-card";
import { safeExternalUrl } from "~/app/safe-external-url";
import { uploadFileDirect } from "~/lib/direct-upload";
import {
  applyProjectCardOverrides,
  CARD_LAYOUTS,
  CARD_LAYOUT_LABELS,
  coerceHashtagsOverride,
  DEFAULT_CARD_LAYOUT,
  normalizeHashtags,
  resolveCardLayout,
  type CardLayout,
} from "~/lib/canvas-project-card";
import {
  CANVAS_MAX_HEIGHT,
  CANVAS_MIN_HEIGHT,
  CANVAS_MIN_WIDTH,
  CANVAS_WIDTH,
} from "~/lib/canvas-constants";
import {
  AVATAR_OFFSET_DEFAULT,
  AVATAR_OFFSET_MAX,
  AVATAR_OFFSET_MIN,
  AVATAR_SHAPES,
  AVATAR_ZOOM_DEFAULT,
  AVATAR_ZOOM_MAX,
  AVATAR_ZOOM_MIN,
  avatarShapeRadius,
  CANVAS_FONTS,
  fontStack,
  STYLEABLE_TYPES,
  type AvatarShape,
  type CanvasFontId,
} from "~/lib/canvas-style";
import {
  PROFILE_THEME_OPTIONS,
  profileBackgroundStyle,
  profileThemeClass,
  resolveProfileTheme,
} from "~/lib/profile-theme";
import { api, type RouterInputs, type RouterOutputs } from "~/trpc/react";
import { AUTOSAVE_INTERVAL_MS, createAutosaveController } from "./autosave";
import {
  clampGroupDelta,
  duplicateSelection,
  groupOffset,
  intersectingKeys,
  isTypingTarget,
  layerSelection,
  type LayerAction,
} from "./canvas-editor-state";
import {
  clampElement,
  DEFAULT_ELEMENT_SIZE,
  resizeFromCorner,
  type CanvasBounds,
  type Corner,
} from "./canvas-math";

type EditorProject = ComponentProps<typeof ProjectCard>["project"];
type ProfileLink = { label: string; url: string };
type ElementType =
  | "ABOUT"
  | "LINKS"
  | "PROJECT"
  | "TEXT"
  | "IMAGE"
  | "LINK"
  | "AVATAR"
  | "NAME"
  | "USERNAME"
  | "CATEGORIES";

type ElementStyle = {
  textColor: string | null;
  backgroundColor: string | null;
  fontFamily: string | null;
  avatarShape: string | null;
  avatarZoom: number | null;
  avatarOffsetX: number | null;
  avatarOffsetY: number | null;
};

type EditorElement = {
  key: string;
  type: ElementType;
  projectId: string | null;
  textContent: string | null;
  imageUrl: string | null;
  imageCaption: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  // Canvas-only PROJECT card overrides. Null = unset (fall back to the real
  // project value); projectHashtagsOverride === null is unset while [] is an
  // explicit "no hashtags" override.
  projectTitleOverride: string | null;
  projectDescriptionOverride: string | null;
  projectHashtagsOverride: string[] | null;
  cardLayout: string | null;
  // Only meaningful for IMAGE elements: the ImageResource this card renders.
  resourceId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  locked: boolean;
} & ElementStyle;

type SnapshotInput = RouterInputs["canvas"]["saveDraft"];
type ElementPayload = SnapshotInput["elements"][number];
type SaveResult = RouterOutputs["canvas"]["saveDraft"];
// Server-validated, re-sanitized card returned by canvas.validateClipboard.
type ValidatedCard = NonNullable<
  RouterOutputs["canvas"]["validateClipboard"]
>[number];

type HistorySnapshot = {
  elements: EditorElement[];
  theme: SnapshotInput["theme"];
  backgroundColor: string | null;
  backgroundImageUrl: string | null;
  backgroundImageResourceId: string | null;
  profile: SnapshotInput["profile"];
  projects: SnapshotInput["projects"];
};

type HistoryCheckpoint = {
  pastLength: number;
  future: HistorySnapshot[];
};

const STYLEABLE_TYPE_SET = new Set<ElementType>(STYLEABLE_TYPES);

type DragState = {
  key: string;
  mode: "move" | "resize";
  corner: Corner | null;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  origin: { x: number; y: number; width: number; height: number };
  origins: Map<string, { x: number; y: number; width: number; height: number }>;
  movementBlocked: boolean;
  collapseOnEnd: boolean;
  moved: boolean;
  changed: boolean;
  historyCheckpoint: HistoryCheckpoint | null;
};

type MarqueeState = {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additiveSelection: Set<string>;
};

type ContextMenuState = {
  key: string;
  x: number;
  y: number;
  targetSelection: Set<string>;
  layerOpen: boolean;
};

type EditPopupAnchor = {
  left: number;
  top: number;
  bottom: number;
};

type EditPopupPosition = {
  left: number;
  top: number;
  ready: boolean;
};

// Add Component keeps its unanchored inline forms. Existing cards use the one
// EDIT state so only one merged content/appearance popup can exist at a time.
type PanelState =
  | { kind: "TEXT"; initialHtml: string }
  | {
      kind: "IMAGE";
      initialImageUrl: string;
      initialCaption: string;
    }
  | {
      kind: "LINK";
      initialLabel: string;
      initialUrl: string;
    }
  | { kind: "EDIT"; editKey: string; anchor: EditPopupAnchor };

// Freeform elements are created via Add Component, can appear any number of
// times, and have no unplaced Library state.
const FREEFORM_TYPES = new Set<ElementType>(["TEXT", "IMAGE", "LINK"]);

const RESIZE_HANDLES: { corner: Corner; className: string }[] = [
  {
    corner: "top-left",
    className: "top-0 left-0 cursor-nwse-resize",
  },
  {
    corner: "top-right",
    className: "top-0 right-0 cursor-nesw-resize",
  },
  {
    corner: "bottom-left",
    className: "bottom-0 left-0 cursor-nesw-resize",
  },
  {
    corner: "bottom-right",
    className: "right-0 bottom-0 cursor-nwse-resize",
  },
];

// Favicon comes from a third-party favicon-by-domain service via a plain
// client-side <img> request — the app never fetches the target URL itself.
function faviconUrl(linkUrl: string) {
  try {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
      new URL(linkUrl).hostname,
    )}`;
  } catch {
    return null;
  }
}

// A short human label for a stored image resource, taken from its URL's file
// name (query string stripped). Falls back to "Image" when there is no usable
// segment. Used for the thumbnail label and the Remove control's accessible
// name.
function resourceName(url: string) {
  const segment = url.split("?")[0]?.split("/").pop();
  return segment && segment.length > 0 ? segment : "Image";
}

type CanvasEditorProps = {
  bio: string | null;
  links: ProfileLink[];
  projects: EditorProject[];
  displayName: string;
  username: string;
  school: string | null;
  avatarUrl: string | null;
  // Pre-resolved category display labels (derived from the user's projects).
  categories: string[];
};

const FALLBACK_BOUNDS: CanvasBounds = {
  width: CANVAS_WIDTH,
  maxHeight: CANVAS_MAX_HEIGHT,
  minWidth: CANVAS_MIN_WIDTH,
  minHeight: CANVAS_MIN_HEIGHT,
};

const DRAG_MIME = "application/x-canvas-item";

const elementLabels: Record<ElementType, string> = {
  ABOUT: "About",
  LINKS: "Links",
  PROJECT: "Project",
  TEXT: "Text",
  IMAGE: "Image",
  LINK: "Link",
  AVATAR: "Avatar",
  NAME: "Name",
  USERNAME: "Username",
  CATEGORIES: "Categories",
};

// Inline style applied to a styled element's rendered content in the editor
// preview. Mirrors the public-profile renderer so the editor shows what will
// publish. Background "transparent" is honored; unset falls through to the
// element chrome's default surface.
function contentStyle(element: EditorElement): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (element.textColor) style.color = element.textColor;
  if (element.backgroundColor) style.backgroundColor = element.backgroundColor;
  const stack = fontStack(element.fontFamily);
  if (stack) style.fontFamily = stack;
  return style;
}

function toPayload(elements: EditorElement[]): ElementPayload[] {
  return elements.map((element) => {
    const styleable = STYLEABLE_TYPE_SET.has(element.type);
    return {
      type: element.type,
      ...(element.type === "PROJECT" && element.projectId
        ? { projectId: element.projectId }
        : {}),
      ...(element.type === "PROJECT" && element.projectTitleOverride?.trim()
        ? { projectTitleOverride: element.projectTitleOverride }
        : {}),
      ...(element.type === "PROJECT" &&
      element.projectDescriptionOverride?.trim()
        ? { projectDescriptionOverride: element.projectDescriptionOverride }
        : {}),
      // Send even an empty array — presence is the unset-vs-empty distinction.
      ...(element.type === "PROJECT" && element.projectHashtagsOverride !== null
        ? { projectHashtagsOverride: element.projectHashtagsOverride }
        : {}),
      ...(element.type === "PROJECT" && element.cardLayout
        ? { cardLayout: element.cardLayout as CardLayout }
        : {}),
      ...(element.type === "TEXT" && element.textContent
        ? { textContent: element.textContent }
        : {}),
      ...(element.type === "IMAGE" && element.imageUrl
        ? {
            imageUrl: element.imageUrl,
            ...(element.imageCaption
              ? { imageCaption: element.imageCaption }
              : {}),
          }
        : {}),
      ...(element.type === "LINK" && element.linkLabel && element.linkUrl
        ? { linkLabel: element.linkLabel, linkUrl: element.linkUrl }
        : {}),
      ...(styleable && element.textColor
        ? { textColor: element.textColor }
        : {}),
      ...(styleable && element.backgroundColor
        ? { backgroundColor: element.backgroundColor }
        : {}),
      ...(styleable && element.fontFamily
        ? { fontFamily: element.fontFamily as CanvasFontId }
        : {}),
      ...(element.type === "AVATAR" && element.avatarShape
        ? { avatarShape: element.avatarShape as AvatarShape }
        : {}),
      ...(element.type === "AVATAR" && element.avatarZoom !== null
        ? { avatarZoom: element.avatarZoom }
        : {}),
      ...(element.type === "AVATAR" && element.avatarOffsetX !== null
        ? { avatarOffsetX: element.avatarOffsetX }
        : {}),
      ...(element.type === "AVATAR" && element.avatarOffsetY !== null
        ? { avatarOffsetY: element.avatarOffsetY }
        : {}),
      // Server re-validates that resourceId is only kept for IMAGE elements.
      ...(element.type === "IMAGE" && element.resourceId
        ? { resourceId: element.resourceId }
        : {}),
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      zIndex: element.zIndex,
      locked: element.locked,
    };
  });
}

function maxZIndex(elements: EditorElement[]) {
  return elements.reduce((max, element) => Math.max(max, element.zIndex), 0);
}

// Clipboard payload marker + non-blocking messages.
const CLIPBOARD_KIND = "provenance.canvas.cards";
const CLIPBOARD_WRITE_ERROR =
  "Clipboard access was blocked. Check your browser permissions and try again.";
const CLIPBOARD_REJECT_ERROR =
  "That clipboard data cannot be pasted here.";
const CLIPBOARD_IMAGE_ERROR =
  "We couldn't add that image. Check the file and try again.";
const CLIPBOARD_EMPTY_ERROR = "There's nothing on the clipboard to paste here.";

// Build a full EditorElement from a server-validated (or freshly built) card,
// forcing a fresh key, an explicit geometry, a new layer, and unlocked state
// (pasted/duplicated copies always start unlocked — spec 41/49).
function payloadToEditorElement(
  card: Pick<ElementPayload, "type"> & Partial<ElementPayload>,
  geometry: { x: number; y: number; width: number; height: number },
  key: string,
  zIndex: number,
): EditorElement {
  return {
    key,
    type: card.type,
    projectId: card.projectId ?? null,
    textContent: card.textContent ?? null,
    imageUrl: card.imageUrl ?? null,
    imageCaption: card.imageCaption ?? null,
    linkLabel: card.linkLabel ?? null,
    linkUrl: card.linkUrl ?? null,
    projectTitleOverride: card.projectTitleOverride ?? null,
    projectDescriptionOverride: card.projectDescriptionOverride ?? null,
    projectHashtagsOverride: card.projectHashtagsOverride ?? null,
    cardLayout: card.cardLayout ?? null,
    resourceId: card.resourceId ?? null,
    textColor: card.textColor ?? null,
    backgroundColor: card.backgroundColor ?? null,
    fontFamily: card.fontFamily ?? null,
    avatarShape: card.avatarShape ?? null,
    avatarZoom: card.avatarZoom ?? null,
    avatarOffsetX: card.avatarOffsetX ?? null,
    avatarOffsetY: card.avatarOffsetY ?? null,
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    zIndex,
    locked: false,
  };
}

function cloneHistorySnapshot(snapshot: HistorySnapshot): HistorySnapshot {
  return structuredClone(snapshot);
}

export function CanvasEditor({
  projects: projectCards,
  username,
  categories,
}: CanvasEditorProps) {
  const router = useRouter();
  const editorState = api.canvas.getEditorState.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const saveDraft = api.canvas.saveDraft.useMutation();
  const publish = api.canvas.publish.useMutation();
  const dismissHint = api.canvas.dismissHint.useMutation();
  const validateClipboard = api.canvas.validateClipboard.useMutation();
  const setResourceRemoved = api.canvas.setResourceRemoved.useMutation();

  // Local in-editor state is the source of truth once loaded; the server is
  // only consulted for the initial snapshot and for clamp reconciliation.
  const [elements, setElements] = useState<EditorElement[] | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [theme, setTheme] = useState<SnapshotInput["theme"] | null>(null);
  const [backgroundColor, setBackgroundColor] = useState<string | null>(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(
    null,
  );
  const [backgroundImageResourceId, setBackgroundImageResourceId] = useState<
    string | null
  >(null);
  const [profile, setProfile] = useState<SnapshotInput["profile"] | null>(null);
  const [projects, setProjects] = useState<SnapshotInput["projects"] | null>(
    null,
  );
  const [publishStatus, setPublishStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  // A single state slot means only one context menu can be open at a time;
  // opening a new one replaces the previous.
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // Non-blocking clipboard feedback (permission denied, foreign/malformed
  // payload, failed image upload). Cleared on the next successful action.
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState | null>(null);
  // Whether the Custom full-page background panel is open (spec 2/3). "Custom"
  // is a customization entry point, not a stored theme value, so this is pure
  // UI state and never enters the draft snapshot.
  const [customBackgroundOpen, setCustomBackgroundOpen] = useState(false);
  const [backgroundUploading, setBackgroundUploading] = useState(false);
  // Inline error for a failed background upload/paste; a failure leaves the
  // prior background untouched (spec 8 edge case).
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const [editPopupPosition, setEditPopupPosition] =
    useState<EditPopupPosition | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [selectMultiple, setSelectMultiple] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [historyAvailability, setHistoryAvailability] = useState({
    canUndo: false,
    canRedo: false,
  });
  // Optimistic local dismissal of the first-run hint; the server persists it
  // via dismissHint so it stays gone across devices.
  const [hintHidden, setHintHidden] = useState(false);
  // Resources removed this session are hidden from the list optimistically;
  // setResourceRemoved persists the removedAt flag server-side (spec 56). The
  // underlying file and any card/background already referencing it are left
  // intact — this only stops offering the image for new placements.
  const [removedResourceIds, setRemovedResourceIds] = useState<Set<string>>(
    new Set(),
  );

  const elementsRef = useRef<EditorElement[] | null>(null);
  elementsRef.current = elements;
  const themeRef = useRef<SnapshotInput["theme"] | null>(null);
  themeRef.current = theme;
  const backgroundColorRef = useRef<string | null>(null);
  backgroundColorRef.current = backgroundColor;
  const backgroundImageUrlRef = useRef<string | null>(null);
  backgroundImageUrlRef.current = backgroundImageUrl;
  const backgroundImageResourceIdRef = useRef<string | null>(null);
  backgroundImageResourceIdRef.current = backgroundImageResourceId;
  const profileRef = useRef<SnapshotInput["profile"] | null>(null);
  profileRef.current = profile;
  const projectsRef = useRef<SnapshotInput["projects"] | null>(null);
  projectsRef.current = projects;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const revisionRef = useRef<number | null>(null);
  revisionRef.current = revision;
  const hasTrackedFirstSaveRef = useRef(false);
  const saveDraftRef = useRef(saveDraft.mutateAsync);
  saveDraftRef.current = saveDraft.mutateAsync;
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const marqueeRef = useRef<MarqueeState | null>(null);
  const historyRef = useRef<{
    past: HistorySnapshot[];
    future: HistorySnapshot[];
  }>({ past: [], future: [] });
  const panelHistorySnapshotRef = useRef<HistorySnapshot | null>(null);
  const panelHistoryChangedRef = useRef(false);
  const keyCounter = useRef(0);
  // The "⋯" button that opened the current context menu (null when the menu
  // was opened by right-click), so Escape can restore focus to it.
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const editPopupTriggerRef = useRef<HTMLButtonElement | null>(null);
  const editPopupRef = useRef<HTMLDivElement | null>(null);

  const bounds = editorState.data?.bounds ?? FALLBACK_BOUNDS;
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  useEffect(() => {
    if (elementsRef.current === null && editorState.data) {
      const snapshot = editorState.data.snapshot;
      setRevision(snapshot.revision);
      setTheme(snapshot.theme);
      setBackgroundColor(snapshot.backgroundColor);
      setBackgroundImageUrl(snapshot.backgroundImageUrl);
      setBackgroundImageResourceId(snapshot.backgroundImageResourceId);
      setProfile(snapshot.profile);
      setProjects(snapshot.projects as SnapshotInput["projects"]);
      setElements(
        editorState.data.elements.map((element) => ({
          key: element.id,
          type: element.type,
          projectId: element.projectId,
          textContent: element.textContent,
          imageUrl: element.imageUrl,
          imageCaption: element.imageCaption,
          linkLabel: element.linkLabel,
          linkUrl: element.linkUrl,
          textColor: element.textColor,
          backgroundColor: element.backgroundColor,
          fontFamily: element.fontFamily,
          avatarShape: element.avatarShape,
          avatarZoom: element.avatarZoom,
          avatarOffsetX: element.avatarOffsetX,
          avatarOffsetY: element.avatarOffsetY,
          projectTitleOverride: element.projectTitleOverride,
          projectDescriptionOverride: element.projectDescriptionOverride,
          projectHashtagsOverride: coerceHashtagsOverride(
            element.projectHashtagsOverride,
          ),
          cardLayout: element.cardLayout,
          resourceId: element.resourceId ?? null,
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
          zIndex: element.zIndex,
          locked: element.locked,
        })),
      );
    }
  }, [editorState.data]);

  const buildSnapshot = useCallback(
    (snapshotElements: EditorElement[]): SnapshotInput | null => {
      const currentRevision = revisionRef.current;
      const currentTheme = themeRef.current;
      const currentProfile = profileRef.current;
      const currentProjects = projectsRef.current;
      if (
        currentRevision === null ||
        currentTheme === null ||
        currentProfile === null ||
        currentProjects === null
      ) {
        return null;
      }
      return {
        revision: currentRevision + 1,
        elements: toPayload(snapshotElements),
        theme: currentTheme,
        backgroundColor: backgroundColorRef.current,
        backgroundImageUrl: backgroundImageUrlRef.current,
        backgroundImageResourceId: backgroundImageResourceIdRef.current,
        profile: currentProfile,
        projects: currentProjects,
      };
    },
    [],
  );

  const projectsById = useMemo(
    () => new Map(projectCards.map((project) => [project.id, project])),
    [projectCards],
  );

  // Reconcile local state with the clamped array the server returned. Only
  // elements whose geometry is unchanged since the snapshot are updated, so
  // an in-progress drag is never clobbered by a slow response.
  const reconcile = useCallback(
    (sent: EditorElement[], result: SaveResult | undefined) => {
      if (!result) return;
      revisionRef.current = Math.max(revisionRef.current ?? 0, result.revision);
      setRevision(revisionRef.current);
      setElements((current) => {
        if (!current) return current;
        return current.map((element) => {
          const index = sent.findIndex((item) => item.key === element.key);
          const snapshot = sent[index];
          const clamped = result.elements[index];
          if (!snapshot || !clamped) return element;
          if (
            element.x === snapshot.x &&
            element.y === snapshot.y &&
            element.width === snapshot.width &&
            element.height === snapshot.height
          ) {
            return {
              ...element,
              x: clamped.x,
              y: clamped.y,
              width: clamped.width,
              height: clamped.height,
            };
          }
          return element;
        });
      });
    },
    [],
  );

  const runSave = useCallback(async () => {
    const snapshot = elementsRef.current;
    if (!snapshot) return;
    const payload = buildSnapshot(snapshot);
    if (!payload) return;
    try {
      const result = await saveDraftRef.current(payload);
      if (posthog.__loaded && !hasTrackedFirstSaveRef.current) {
        posthog.capture("canvas_edited");
        hasTrackedFirstSaveRef.current = true;
      }
      reconcile(snapshot, result);
    } catch {
      // Surfaced via saveDraft.isError; the next change re-marks dirty.
    }
  }, [buildSnapshot, reconcile]);

  const controllerRef = useRef<ReturnType<
    typeof createAutosaveController
  > | null>(null);

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
      // Persist unsaved changes on in-app navigation away from the editor.
      controllerRef.current?.flush();
      controllerRef.current = null;
    };
  }, [startAutosave]);

  const markDirty = useCallback(() => {
    controllerRef.current?.notifyChange();
  }, []);

  const syncHistoryAvailability = useCallback(() => {
    setHistoryAvailability({
      canUndo: historyRef.current.past.length > 0,
      canRedo: historyRef.current.future.length > 0,
    });
  }, []);

  const captureHistorySnapshot = useCallback((): HistorySnapshot | null => {
    const currentElements = elementsRef.current;
    const currentTheme = themeRef.current;
    const currentProfile = profileRef.current;
    const currentProjects = projectsRef.current;
    if (
      currentElements === null ||
      currentTheme === null ||
      currentProfile === null ||
      currentProjects === null
    ) {
      return null;
    }
    return cloneHistorySnapshot({
      elements: currentElements,
      theme: currentTheme,
      backgroundColor: backgroundColorRef.current,
      backgroundImageUrl: backgroundImageUrlRef.current,
      backgroundImageResourceId: backgroundImageResourceIdRef.current,
      profile: currentProfile,
      projects: currentProjects,
    });
  }, []);

  const commitHistory = useCallback(
    (snapshot?: HistorySnapshot | null): HistoryCheckpoint | null => {
      const committedSnapshot =
        snapshot === undefined ? captureHistorySnapshot() : snapshot;
      if (!committedSnapshot) return null;
      const history = historyRef.current;
      const checkpoint = {
        pastLength: history.past.length,
        future: history.future,
      };
      history.past.push(cloneHistorySnapshot(committedSnapshot));
      history.future = [];
      syncHistoryAvailability();
      return checkpoint;
    },
    [captureHistorySnapshot, syncHistoryAvailability],
  );

  const rollbackHistoryCommit = useCallback(
    (checkpoint: HistoryCheckpoint | null) => {
      if (!checkpoint) return;
      const history = historyRef.current;
      if (history.past.length !== checkpoint.pastLength + 1) return;
      history.past.pop();
      history.future = checkpoint.future;
      syncHistoryAvailability();
    },
    [syncHistoryAvailability],
  );

  const commitPanelHistory = useCallback(() => {
    if (panelHistoryChangedRef.current) {
      commitHistory(panelHistorySnapshotRef.current);
    }
    panelHistorySnapshotRef.current = null;
    panelHistoryChangedRef.current = false;
  }, [commitHistory]);

  const closeEditPopup = useCallback(() => {
    commitPanelHistory();
    setPanel((current) => (current?.kind === "EDIT" ? null : current));
    setEditPopupPosition(null);
    editPopupTriggerRef.current?.focus();
    editPopupTriggerRef.current = null;
  }, [commitPanelHistory]);

  useLayoutEffect(() => {
    if (panel?.kind !== "EDIT" || !editPopupRef.current) return;
    const popupRect = editPopupRef.current.getBoundingClientRect();
    const margin = 8;
    const gap = 8;
    const maxLeft = Math.max(
      margin,
      window.innerWidth - popupRect.width - margin,
    );
    const left = Math.min(Math.max(panel.anchor.left, margin), maxLeft);
    const above = panel.anchor.top - popupRect.height - gap;
    const below = panel.anchor.bottom + gap;
    const maxTop = Math.max(
      margin,
      window.innerHeight - popupRect.height - margin,
    );
    const top = Math.min(
      Math.max(above >= margin ? above : below, margin),
      maxTop,
    );
    setEditPopupPosition({ left, top, ready: true });
  }, [panel]);

  useEffect(() => {
    if (panel?.kind !== "EDIT") return;
    const popup = editPopupRef.current;
    const initialFocus =
      popup?.querySelector<HTMLElement>("[data-popup-initial-focus]") ??
      popup?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"], button:not([disabled])',
      );
    initialFocus?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeEditPopup();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeEditPopup, panel]);

  const restoreHistorySnapshot = useCallback((snapshot: HistorySnapshot) => {
    const restored = cloneHistorySnapshot(snapshot);
    elementsRef.current = restored.elements;
    themeRef.current = restored.theme;
    backgroundColorRef.current = restored.backgroundColor;
    backgroundImageUrlRef.current = restored.backgroundImageUrl;
    backgroundImageResourceIdRef.current = restored.backgroundImageResourceId;
    profileRef.current = restored.profile;
    projectsRef.current = restored.projects;
    selectionRef.current = new Set();
    setElements(restored.elements);
    setTheme(restored.theme);
    setBackgroundColor(restored.backgroundColor);
    setBackgroundImageUrl(restored.backgroundImageUrl);
    setBackgroundImageResourceId(restored.backgroundImageResourceId);
    setProfile(restored.profile);
    setProjects(restored.projects);
    setSelection(new Set());
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.past.length === 0) return false;
    const current = captureHistorySnapshot();
    if (!current) return false;
    const previous = historyRef.current.past.pop()!;
    historyRef.current.future.push(current);
    restoreHistorySnapshot(previous);
    syncHistoryAvailability();
    markDirty();
    return true;
  }, [
    captureHistorySnapshot,
    markDirty,
    restoreHistorySnapshot,
    syncHistoryAvailability,
  ]);

  const redo = useCallback(() => {
    if (historyRef.current.future.length === 0) return false;
    const current = captureHistorySnapshot();
    if (!current) return false;
    const next = historyRef.current.future.pop()!;
    historyRef.current.past.push(current);
    restoreHistorySnapshot(next);
    syncHistoryAvailability();
    markDirty();
    return true;
  }, [
    captureHistorySnapshot,
    markDirty,
    restoreHistorySnapshot,
    syncHistoryAvailability,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      const didHandle =
        key === "z" && !event.shiftKey
          ? undo()
          : key === "y" || (key === "z" && event.shiftKey)
            ? redo()
            : false;
      if (didHandle) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  // Close the context menu on any outside click or Escape. The menu itself
  // stops pointerdown propagation so its own actions still fire.
  useEffect(() => {
    if (!contextMenu) return;
    const onPointerDown = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
        // Keyboard-opened menus return focus to the "⋯" button that opened
        // them; right-click opens have no trigger to restore (ref is null).
        menuTriggerRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  async function handlePublish() {
    const snapshot = elementsRef.current;
    if (!snapshot || publishStatus === "pending") return;
    const payload = buildSnapshot(snapshot);
    if (!payload) return;
    // Pause autosave so a stale draft save can't land after the publish.
    controllerRef.current?.stop();
    setPublishStatus("pending");
    try {
      const result = await publish.mutateAsync(payload);
      reconcile(snapshot, result);
      setPublishStatus("success");
      router.push(`/${username}`);
      window.setTimeout(
        () =>
          setPublishStatus((status) =>
            status === "success" ? "idle" : status,
          ),
        2500,
      );
    } catch {
      setPublishStatus("error");
    } finally {
      // Fresh controller: clean dirty flag, timer restarted.
      startAutosave();
    }
  }

  function updateSelection(next: Set<string>) {
    selectionRef.current = next;
    setSelection(next);
  }

  function removeElement(key: string) {
    const selected = selectionRef.current.has(key)
      ? selectionRef.current
      : new Set([key]);
    commitHistory();
    setElements((current) =>
      current
        ? current.filter((element) => !selected.has(element.key))
        : current,
    );
    updateSelection(new Set());
    markDirty();
  }

  function duplicateSelectedElements() {
    const current = elementsRef.current;
    if (!current || selectionRef.current.size === 0) return;
    commitHistory();
    const result = duplicateSelection(
      current,
      selectionRef.current,
      boundsRef.current,
      () => {
        keyCounter.current += 1;
        return `new-${keyCounter.current}`;
      },
    );
    setElements(result.elements);
    updateSelection(result.selected);
    markDirty();
  }

  function deleteSelectedElements() {
    if (selectionRef.current.size === 0) return;
    const selected = selectionRef.current;
    commitHistory();
    setElements((current) =>
      current
        ? current.filter((element) => !selected.has(element.key))
        : current,
    );
    updateSelection(new Set());
    markDirty();
  }

  function toggleSelectedElementsLock() {
    const current = elementsRef.current;
    const selected = selectionRef.current;
    if (!current || selected.size === 0) return;
    const allLocked = current
      .filter((element) => selected.has(element.key))
      .every((element) => element.locked);
    commitHistory();
    setElements(
      current.map((element) =>
        selected.has(element.key)
          ? { ...element, locked: !allLocked }
          : element,
      ),
    );
    markDirty();
  }

  function createKey() {
    keyCounter.current += 1;
    return `new-${keyCounter.current}`;
  }

  // Append freshly created cards (paste/image) as one undoable action and
  // make them the new selection, mirroring duplicateSelectedElements.
  function addPastedElements(created: EditorElement[]) {
    const current = elementsRef.current;
    if (!current || created.length === 0) return;
    commitHistory();
    const next = [...current, ...created];
    elementsRef.current = next;
    setElements(next);
    updateSelection(new Set(created.map((element) => element.key)));
    markDirty();
  }

  function buildClipboardPayload(selected: ReadonlySet<string>) {
    const current = elementsRef.current;
    const data = editorState.data;
    if (!current || !data) return null;
    const cards = current.filter((element) => selected.has(element.key));
    if (cards.length === 0) return null;
    return {
      kind: CLIPBOARD_KIND,
      version: 1 as const,
      ownerUserId: data.ownerUserId,
      profileUsername: data.username,
      cards: toPayload(cards),
    };
  }

  // Copy: serialize the selection to the OS clipboard. Returns whether the
  // write succeeded so Cut can gate its deletion on it (spec 47/48/52).
  async function copySelection(selected: ReadonlySet<string>) {
    const payload = buildClipboardPayload(selected);
    if (!payload) return false;
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
      setClipboardError(null);
      return true;
    } catch {
      setClipboardError(CLIPBOARD_WRITE_ERROR);
      return false;
    }
  }

  // Cut: only remove the cards when the clipboard write succeeds, as one
  // undoable action; a failed write leaves the document untouched (spec 48).
  async function cutSelection(selected: ReadonlySet<string>) {
    const target = new Set(selected);
    const before = elementsRef.current;
    if (!before?.some((element) => target.has(element.key))) return;
    if (!(await copySelection(target))) return;
    const current = elementsRef.current;
    if (!current) return;
    commitHistory();
    const next = current.filter((element) => !target.has(element.key));
    elementsRef.current = next;
    setElements(next);
    updateSelection(new Set());
    markDirty();
  }

  // Add server-validated cards, offset as a group so they don't land exactly
  // on top of existing content, preserving relative arrangement and layer
  // order and starting unlocked (spec 49).
  function pasteCards(cards: ValidatedCard[]) {
    const current = elementsRef.current;
    if (!current || cards.length === 0) return;
    const currentBounds = boundsRef.current;
    const offset = groupOffset(cards, currentBounds);
    const highest = maxZIndex(current);
    const created = [...cards]
      .sort((left, right) => left.zIndex - right.zIndex)
      .map((card, index) => {
        const geometry = clampElement(
          {
            x: card.x + offset.x,
            y: card.y + offset.y,
            width: card.width,
            height: card.height,
          },
          currentBounds,
        );
        return payloadToEditorElement(
          card,
          geometry,
          createKey(),
          highest + index + 1,
        );
      });
    addPastedElements(created);
    setClipboardError(null);
  }

  // Image path: upload the blob (which also creates an ImageResource) and
  // place a new Image card referencing the returned resource id. A failed
  // upload creates neither the resource nor the card (spec 51).
  async function pasteImage(blob: Blob) {
    const file =
      blob instanceof File
        ? blob
        : new File([blob], "pasted-image", {
            type: blob.type || "image/png",
          });
    try {
      const result = await uploadFileDirect(file, "canvas-resource");
      if (!result.resource) {
        throw new Error("Upload failed.");
      }
      const current = elementsRef.current;
      if (!current) return;
      const size = DEFAULT_ELEMENT_SIZE.IMAGE;
      const geometry = clampElement({ x: 24, y: 24, ...size }, boundsRef.current);
      const element = payloadToEditorElement(
        { type: "IMAGE", imageUrl: result.url, resourceId: result.resource.id },
        geometry,
        createKey(),
        maxZIndex(current) + 1,
      );
      addPastedElements([element]);
      setClipboardError(null);
    } catch {
      setClipboardError(CLIPBOARD_IMAGE_ERROR);
    }
  }

  // Shared paste core for both the native paste event and the menu button.
  // A structured card payload always wins over an image, even if both are
  // present (spec edge case). Structured payloads are re-validated on the
  // server before anything is added (spec 50).
  async function processPaste(input: {
    text: string | null;
    image: Blob | null;
  }) {
    if (input.text) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(input.text);
      } catch {
        parsed = null;
      }
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as { kind?: unknown }).kind === CLIPBOARD_KIND
      ) {
        try {
          const cards = await validateClipboard.mutateAsync(parsed);
          if (cards) pasteCards(cards);
        } catch {
          setClipboardError(CLIPBOARD_REJECT_ERROR);
        }
        return;
      }
    }
    if (input.image) {
      await pasteImage(input.image);
      return;
    }
    setClipboardError(CLIPBOARD_EMPTY_ERROR);
  }

  // Menu "Paste": no keystroke means no native paste event, so read the
  // clipboard explicitly and feed it into the same core (spec 47/52).
  async function pasteFromMenu() {
    setContextMenu(null);
    if (!navigator.clipboard?.read) {
      setClipboardError(CLIPBOARD_WRITE_ERROR);
      return;
    }
    let items: ClipboardItem[];
    try {
      items = await navigator.clipboard.read();
    } catch {
      setClipboardError(CLIPBOARD_WRITE_ERROR);
      return;
    }
    let text: string | null = null;
    let image: Blob | null = null;
    for (const item of items) {
      if (!text && item.types.includes("text/plain")) {
        try {
          text = await (await item.getType("text/plain")).text();
        } catch {
          // Ignore an unreadable text entry and fall back to any image.
        }
      }
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (!image && imageType) {
        try {
          image = await item.getType(imageType);
        } catch {
          // Ignore an unreadable image entry.
        }
      }
    }
    await processPaste({ text, image });
  }

  // Listeners are registered once; refs keep them pointed at the latest
  // closures (the same pattern as saveDraftRef) without re-binding on every
  // render.
  const copyRef = useRef(copySelection);
  copyRef.current = copySelection;
  const cutRef = useRef(cutSelection);
  cutRef.current = cutSelection;
  const processPasteRef = useRef(processPaste);
  processPasteRef.current = processPaste;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === "c") {
        if (selectionRef.current.size === 0) return;
        event.preventDefault();
        void copyRef.current(selectionRef.current);
      } else if (key === "x") {
        if (selectionRef.current.size === 0) return;
        event.preventDefault();
        void cutRef.current(selectionRef.current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      // Never hijack a paste into a text field / rich-text surface (spec 47).
      if (isTypingTarget(event.target)) return;
      const data = event.clipboardData;
      if (!data) return;
      const text = data.getData("text/plain") || null;
      let image: File | null = null;
      for (const item of Array.from(data.items ?? [])) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          image = item.getAsFile();
          break;
        }
      }
      // Only intercept when there is a canvas payload or an image; otherwise
      // let the browser handle an ordinary paste.
      const structured = text?.includes(CLIPBOARD_KIND) ?? false;
      if (!image && !structured) return;
      event.preventDefault();
      void processPasteRef.current({ text, image });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  function addElement(
    item: {
      type: ElementType;
      projectId?: string;
      textContent?: string;
      imageUrl?: string;
      imageCaption?: string;
      linkLabel?: string;
      linkUrl?: string;
      resourceId?: string;
    },
    dropX: number,
    dropY: number,
  ) {
    commitHistory();
    setElements((current) => {
      if (!current) return current;
      // Text/Image/Link are freeform: any number may coexist, so the
      // uniqueness gate only applies to About/Links/Project.
      const alreadyPlaced = FREEFORM_TYPES.has(item.type)
        ? false
        : item.type === "PROJECT"
          ? current.some((element) => element.projectId === item.projectId)
          : current.some((element) => element.type === item.type);
      if (alreadyPlaced) return current;
      if (item.type === "PROJECT" && !item.projectId) return current;

      const size = DEFAULT_ELEMENT_SIZE[item.type];
      const clamped = clampElement(
        { x: dropX, y: dropY, ...size },
        boundsRef.current,
      );
      keyCounter.current += 1;
      return [
        ...current,
        {
          key: `new-${keyCounter.current}`,
          type: item.type,
          projectId: item.projectId ?? null,
          textContent: item.textContent ?? null,
          imageUrl: item.imageUrl ?? null,
          imageCaption: item.imageCaption ?? null,
          linkLabel: item.linkLabel ?? null,
          linkUrl: item.linkUrl ?? null,
          textColor: null,
          backgroundColor: null,
          fontFamily: null,
          avatarShape: null,
          avatarZoom: null,
          avatarOffsetX: null,
          avatarOffsetY: null,
          projectTitleOverride: null,
          projectDescriptionOverride: null,
          projectHashtagsOverride: null,
          cardLayout: null,
          resourceId: item.resourceId ?? null,
          locked: false,
          ...clamped,
          zIndex: maxZIndex(current) + 1,
        },
      ];
    });
    markDirty();
  }

  function patchElement(key: string, patch: Partial<EditorElement>) {
    setElements((current) => {
      if (!current) return current;
      const next = current.map((element) =>
        element.key === key ? { ...element, ...patch } : element,
      );
      elementsRef.current = next;
      return next;
    });
    markDirty();
  }

  function patchProfile(patch: Partial<SnapshotInput["profile"]>) {
    const current = profileRef.current;
    if (!current) return;
    const next = { ...current, ...patch };
    profileRef.current = next;
    setProfile(next);
    panelHistoryChangedRef.current = true;
    markDirty();
  }

  // When the menu was opened from an element's "⋯" button, move focus onto
  // its first enabled item so Tab reaches menu actions instead of the rest of the
  // page. Right-click opens leave focus untouched (existing behavior).
  useEffect(() => {
    if (!contextMenu || !menuTriggerRef.current) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus();
  }, [contextMenu]);

  function targetSelectionForMenu(key: string) {
    if (selectionRef.current.has(key)) return new Set(selectionRef.current);
    const target = new Set([key]);
    updateSelection(target);
    return target;
  }

  function openContextMenu(
    event: React.MouseEvent<HTMLElement>,
    element: EditorElement,
  ) {
    event.preventDefault();
    // Ignore right-clicks while a pointer-captured drag is in progress.
    if (dragRef.current) return;
    menuTriggerRef.current = null;
    setContextMenu({
      key: element.key,
      x: event.clientX,
      y: event.clientY,
      targetSelection: targetSelectionForMenu(element.key),
      layerOpen: false,
    });
  }

  // Second entry point to the same menu: the element's "⋯" button. Uses the
  // button's own rect for position so keyboard activation (Enter/Space)
  // places the menu correctly with no mouse coordinates involved.
  function openMenuFromButton(
    event: React.MouseEvent<HTMLButtonElement>,
    element: EditorElement,
  ) {
    if (dragRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    menuTriggerRef.current = event.currentTarget;
    setContextMenu({
      key: element.key,
      x: rect.left,
      y: rect.bottom + 4,
      targetSelection: targetSelectionForMenu(element.key),
      layerOpen: false,
    });
  }

  function dismissHintNow() {
    // Hide immediately; if the mutation fails we keep it hidden this session
    // (the server will simply show it again on a future visit).
    setHintHidden(true);
    dismissHint.mutate();
  }

  function handleEdit(element: EditorElement) {
    if (selectionRef.current.size > 1) return;
    const card = surfaceRef.current?.querySelector<HTMLElement>(
      `[data-canvas-element-key="${element.key}"]`,
    );
    if (!card) return;
    commitPanelHistory();
    panelHistorySnapshotRef.current = captureHistorySnapshot();
    panelHistoryChangedRef.current = false;
    editPopupTriggerRef.current = menuTriggerRef.current;
    const rect = card.getBoundingClientRect();
    const anchor = { left: rect.left, top: rect.top, bottom: rect.bottom };
    setEditPopupPosition({ left: anchor.left, top: anchor.top, ready: false });
    setPanel({ kind: "EDIT", editKey: element.key, anchor });
  }

  function applyLayerAction(
    targetSelection: ReadonlySet<string>,
    action: LayerAction,
  ) {
    const current = elementsRef.current;
    if (!current) return;
    const next = layerSelection(current, targetSelection, action);
    const changed = current.some(
      (element, index) => element.zIndex !== next[index]?.zIndex,
    );
    setContextMenu(null);
    if (!changed) return;
    commitHistory();
    elementsRef.current = next;
    setElements(next);
    markDirty();
  }

  function startDrag(
    event: React.PointerEvent<HTMLElement>,
    element: EditorElement,
    mode: "move" | "resize",
    corner: Corner | null = null,
  ) {
    if (event.button !== 0 || isTypingTarget(event.target)) return;

    if (mode === "move" && (event.shiftKey || selectMultiple)) {
      const next = new Set(selectionRef.current);
      if (next.has(element.key)) next.delete(element.key);
      else next.add(element.key);
      updateSelection(next);
      return;
    }

    let draggedSelection = selectionRef.current;
    let collapseOnEnd = false;
    if (mode === "move") {
      if (draggedSelection.has(element.key) && draggedSelection.size > 1) {
        collapseOnEnd = true;
      } else {
        draggedSelection = new Set([element.key]);
        updateSelection(draggedSelection);
      }
    }

    const draggedElements =
      mode === "move"
        ? (elementsRef.current ?? []).filter((item) =>
            draggedSelection.has(item.key),
          )
        : [element];
    const movementBlocked =
      mode === "move" && draggedElements.some((item) => item.locked);
    if (movementBlocked && draggedSelection.size === 1) return;

    const historyCheckpoint = movementBlocked ? null : commitHistory();

    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      key: element.key,
      mode,
      corner,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origin: {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      },
      origins: new Map(
        draggedElements.map((item) => [
          item.key,
          {
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
          },
        ]),
      ),
      movementBlocked,
      collapseOnEnd,
      moved: false,
      changed: false,
      historyCheckpoint,
    };
  }

  function onDragPointerMove(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    const dx = Math.round(event.clientX - drag.startClientX);
    const dy = Math.round(event.clientY - drag.startClientY);
    if (dx === 0 && dy === 0) return;
    drag.moved = true;
    if (drag.movementBlocked) return;

    setElements((current) => {
      if (!current) return current;
      if (drag.mode === "move") {
        const delta = clampGroupDelta(
          [...drag.origins.values()],
          dx,
          dy,
          boundsRef.current,
        );
        if (delta.x !== 0 || delta.y !== 0) drag.changed = true;
        return current.map((element) => {
          const origin = drag.origins.get(element.key);
          return origin
            ? { ...element, x: origin.x + delta.x, y: origin.y + delta.y }
            : element;
        });
      }
      return current.map((element) => {
        if (element.key !== drag.key) return element;
        const next = resizeFromCorner(
          drag.origin,
          drag.corner ?? "bottom-right",
          dx,
          dy,
          boundsRef.current,
        );
        if (
          next.x !== element.x ||
          next.y !== element.y ||
          next.width !== element.width ||
          next.height !== element.height
        ) {
          drag.changed = true;
        }
        return { ...element, ...next };
      });
    });
  }

  function onDragPointerEnd(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.collapseOnEnd && !drag.moved) {
      updateSelection(new Set([drag.key]));
    }
    if (drag.changed) markDirty();
    else rollbackHistoryCommit(drag.historyCheckpoint);
  }

  function surfacePoint(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(event.clientX - rect.left),
      y: Math.round(event.clientY - rect.top),
    };
  }

  function marqueeBox(state: MarqueeState) {
    return {
      x: Math.min(state.startX, state.currentX),
      y: Math.min(state.startY, state.currentY),
      width: Math.abs(state.currentX - state.startX),
      height: Math.abs(state.currentY - state.startY),
    };
  }

  function onSurfacePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (
      event.button !== 0 ||
      event.target !== event.currentTarget ||
      isTypingTarget(event.target)
    ) {
      return;
    }
    // "Select multiple" is the touch equivalent of holding Shift (spec 19):
    // starting a marquee in that mode adds to the existing selection instead
    // of replacing it, matching per-card tapping in startDrag.
    const additive = event.shiftKey || selectMultiple;
    const point = surfacePoint(event);
    const next: MarqueeState = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
      additiveSelection: additive ? new Set(selectionRef.current) : new Set(),
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    marqueeRef.current = next;
    setMarquee(next);
    if (!additive) updateSelection(new Set());
  }

  function onSurfacePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = marqueeRef.current;
    if (current?.pointerId !== event.pointerId) return;
    // Suppress the browser's touch scroll/pan only while a marquee drag is
    // actually in progress (spec 19/57/58). The surface keeps its default
    // touch-action so ordinary page scrolling over the canvas still works when
    // no marquee is active; preventDefault on a mouse pointermove is a no-op.
    event.preventDefault();
    const point = surfacePoint(event);
    const next = { ...current, currentX: point.x, currentY: point.y };
    marqueeRef.current = next;
    setMarquee(next);
    const intersecting = intersectingKeys(
      elementsRef.current ?? [],
      marqueeBox(next),
    );
    updateSelection(new Set([...next.additiveSelection, ...intersecting]));
  }

  function onSurfacePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (marqueeRef.current?.pointerId !== event.pointerId) return;
    marqueeRef.current = null;
    setMarquee(null);
  }

  function onSurfaceDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes(DRAG_MIME)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function onSurfaceDrop(event: React.DragEvent<HTMLDivElement>) {
    const raw = event.dataTransfer.getData(DRAG_MIME);
    const surface = surfaceRef.current;
    if (!raw || !surface) return;
    event.preventDefault();

    let item: {
      type?: string;
      projectId?: string;
      resourceId?: string;
      imageUrl?: string;
    };
    try {
      item = JSON.parse(raw) as {
        type?: string;
        projectId?: string;
        resourceId?: string;
        imageUrl?: string;
      };
    } catch {
      return;
    }
    // A Resources drag places a reusable Image card referencing the resource.
    // Resources are never "used up", so this can happen any number of times.
    if (item.type === "RESOURCE_IMAGE" && item.resourceId && item.imageUrl) {
      const rect = surface.getBoundingClientRect();
      const size = DEFAULT_ELEMENT_SIZE.IMAGE;
      addElement(
        { type: "IMAGE", imageUrl: item.imageUrl, resourceId: item.resourceId },
        Math.round(event.clientX - rect.left - size.width / 2),
        Math.round(event.clientY - rect.top - size.height / 2),
      );
      return;
    }
    const DROPPABLE: ElementType[] = [
      "ABOUT",
      "LINKS",
      "PROJECT",
      "AVATAR",
      "NAME",
      "USERNAME",
      "CATEGORIES",
    ];
    if (!DROPPABLE.includes(item.type as ElementType)) {
      return;
    }
    const droppedType = item.type as
      | "ABOUT"
      | "LINKS"
      | "PROJECT"
      | "AVATAR"
      | "NAME"
      | "USERNAME"
      | "CATEGORIES";

    const rect = surface.getBoundingClientRect();
    const size = DEFAULT_ELEMENT_SIZE[droppedType];
    addElement(
      { type: droppedType, projectId: item.projectId },
      Math.round(event.clientX - rect.left - size.width / 2),
      Math.round(event.clientY - rect.top - size.height / 2),
    );
  }

  // Tap-to-place path for touch devices, where native drag events never fire.
  // Uses the same default position as the Add Component buttons (24, 24) and
  // leaves the resource in the list so it can be placed again (spec 53).
  function placeResource(resource: { id: string; url: string }) {
    addElement(
      { type: "IMAGE", imageUrl: resource.url, resourceId: resource.id },
      24,
      24,
    );
  }

  function removeResource(id: string) {
    setRemovedResourceIds((current) => new Set(current).add(id));
    setResourceRemoved.mutate({ id, removed: true });
  }

  // Theme and background edits are private draft changes (spec 9): they only
  // touch local state + refs and ride along in buildSnapshot. Each discrete
  // action records one history entry (spec 45). commitHistory() captures the
  // pre-change state so undo restores it; the ref is updated imperatively (as
  // patchProfile does) so autosave/buildSnapshot see the new value immediately.
  function selectTheme(value: SnapshotInput["theme"]) {
    commitHistory();
    themeRef.current = value;
    setTheme(value);
    markDirty();
  }

  function applyBackgroundColor(color: string) {
    commitHistory();
    backgroundColorRef.current = color;
    setBackgroundColor(color);
    markDirty();
  }

  function removeBackgroundImage() {
    commitHistory();
    backgroundImageUrlRef.current = null;
    backgroundImageResourceIdRef.current = null;
    setBackgroundImageUrl(null);
    setBackgroundImageResourceId(null);
    setBackgroundError(null);
    markDirty();
  }

  // Reset both color and image so profileBackgroundStyle returns {} and the
  // selected theme's own default background shows through (spec 7).
  function resetBackgroundToThemeDefault() {
    commitHistory();
    backgroundColorRef.current = null;
    backgroundImageUrlRef.current = null;
    backgroundImageResourceIdRef.current = null;
    setBackgroundColor(null);
    setBackgroundImageUrl(null);
    setBackgroundImageResourceId(null);
    setBackgroundError(null);
    markDirty();
  }

  // Upload a custom background image. Finalization validates + stores the file
  // and creates an ImageResource, so the image is also added to the Resources
  // library (spec 55) for free. On failure the prior background is
  // left untouched and no resource/card is created (spec 8 edge case).
  async function uploadBackgroundImage(file: File) {
    setBackgroundUploading(true);
    setBackgroundError(null);
    try {
      const result = await uploadFileDirect(file, "canvas-resource");
      if (!result.resource) {
        throw new Error("Upload failed.");
      }
      commitHistory();
      backgroundImageUrlRef.current = result.url;
      backgroundImageResourceIdRef.current = result.resource.id;
      setBackgroundImageUrl(result.url);
      setBackgroundImageResourceId(result.resource.id);
      markDirty();
    } catch (caught) {
      setBackgroundError(
        caught instanceof Error ? caught.message : "Upload failed.",
      );
    } finally {
      setBackgroundUploading(false);
    }
  }

  // Menu-style paste: no keystroke means no native paste event, so read the
  // clipboard explicitly and upload the first image blob found. This mirrors
  // pasteFromMenu and deliberately does NOT hook the window paste event, which
  // the card clipboard feature already owns (spec 4 "paste").
  async function pasteBackgroundImage() {
    setBackgroundError(null);
    if (!navigator.clipboard?.read) {
      setBackgroundError(CLIPBOARD_WRITE_ERROR);
      return;
    }
    let items: ClipboardItem[];
    try {
      items = await navigator.clipboard.read();
    } catch {
      setBackgroundError(CLIPBOARD_WRITE_ERROR);
      return;
    }
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (imageType) {
        try {
          const blob = await item.getType(imageType);
          const file =
            blob instanceof File
              ? blob
              : new File([blob], "pasted-background", {
                  type: blob.type || "image/png",
                });
          await uploadBackgroundImage(file);
        } catch {
          setBackgroundError(CLIPBOARD_IMAGE_ERROR);
        }
        return;
      }
    }
    setBackgroundError(CLIPBOARD_EMPTY_ERROR);
  }

  const placedTypes = new Set((elements ?? []).map((element) => element.type));
  const placedProjectIds = new Set(
    (elements ?? []).flatMap((element) =>
      element.type === "PROJECT" && element.projectId
        ? [element.projectId]
        : [],
    ),
  );

  const library = (editorState.data?.library ?? []).map((item) =>
    item.type === "PROJECT"
      ? { ...item, placed: placedProjectIds.has(item.projectId) }
      : { ...item, placed: placedTypes.has(item.type) },
  );
  // Every stored ImageResource the server returns (pasted, uploaded, or added
  // via the future Custom background editor), minus any removed this session.
  const resources = (editorState.data?.resources ?? []).filter(
    (resource) => !removedResourceIds.has(resource.id),
  );
  const selectedElements = (elements ?? []).filter((element) =>
    selection.has(element.key),
  );
  const selectionAnchor = selectedElements.length
    ? {
        x: Math.min(...selectedElements.map((element) => element.x)),
        y: Math.min(...selectedElements.map((element) => element.y)),
      }
    : null;
  const allSelectedLocked =
    selectedElements.length > 0 &&
    selectedElements.every((element) => element.locked);
  const editorChromeZ = maxZIndex(elements ?? []) + 1000;

  if (
    editorState.isPending ||
    elements === null ||
    theme === null ||
    profile === null ||
    projects === null
  ) {
    return <p className="text-muted mt-8">Loading canvas…</p>;
  }

  if (editorState.data && editorState.data.mode !== "CANVAS") {
    return (
      <p className="text-muted mt-8">
        This profile is using the grid layout.{" "}
        <Link
          href="/profile/edit#layout-mode"
          className="text-accent hover:text-accent-strong font-semibold transition-colors"
        >
          Switch to the canvas layout
        </Link>{" "}
        to arrange it here.
      </p>
    );
  }

  const autosaveStatus = saveDraft.isPending
    ? "Saving draft…"
    : saveDraft.isError
      ? "Autosave failed — changes retry on your next edit."
      : "Draft autosaves every 30 seconds.";

  // Dismissal and having placed at least one element are each independently
  // sufficient to suppress the first-run hint.
  const showHint =
    !hintHidden &&
    (editorState.data?.shouldShowHint ?? false) &&
    elements.length === 0;

  return (
    <>
      <div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p
              className={`text-sm ${saveDraft.isError ? "text-danger" : "text-muted"}`}
            >
              {autosaveStatus}
            </p>
            <p className="text-faint mt-1 text-xs">
              Autosave keeps a private draft; “Save Layout” publishes your
              canvas to your public profile.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {publishStatus === "error" ? (
              <p role="alert" className="text-danger text-sm">
                Publish failed. Try again.
              </p>
            ) : null}
            {publishStatus === "success" ? (
              <p className="text-success text-sm">Layout published.</p>
            ) : null}
            {clipboardError ? (
              <p role="alert" className="text-danger text-sm">
                {clipboardError}
              </p>
            ) : null}
            <button
              type="button"
              aria-label="Undo"
              onClick={undo}
              disabled={!historyAvailability.canUndo}
              className="border-line-strong text-ink hover:bg-raised rounded-md border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Undo
            </button>
            <button
              type="button"
              aria-label="Redo"
              onClick={redo}
              disabled={!historyAvailability.canRedo}
              className="border-line-strong text-ink hover:bg-raised rounded-md border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Redo
            </button>
            <button
              type="button"
              aria-pressed={selectMultiple}
              onClick={() => setSelectMultiple((active) => !active)}
              className={`rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
                selectMultiple
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line-strong text-ink hover:bg-raised"
              }`}
            >
              Select multiple
            </button>
            <button
              type="button"
              onClick={() => void handlePublish()}
              disabled={publishStatus === "pending"}
              className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-5 py-2.5 font-semibold transition-colors disabled:opacity-50"
            >
              {publishStatus === "pending" ? "Saving…" : "Save Layout"}
            </button>
          </div>
        </div>

        {showHint ? (
          <div className="border-line bg-surface mt-4 flex items-start justify-between gap-4 rounded-lg border p-4">
            <p className="text-muted text-sm">
              <span className="text-ink font-medium">New to the canvas?</span>{" "}
              Drag items from the Library onto the canvas to place them. Click
              an element to select it, drag a corner to resize it, and use its ⋯
              button (or right-click) to edit or delete it.
            </p>
            <button
              type="button"
              onClick={dismissHintNow}
              className="border-line-strong text-ink hover:bg-raised shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
            >
              Got it
            </button>
          </div>
        ) : null}
      </div>

      {/* Add Component works at every viewport width: mobile users can create
          Text/Image/Link elements via the default position and clamping. */}
      <div className="border-line bg-surface mt-6 rounded-lg border p-4">
        <h2 className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
          Add component
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["TEXT", "Text"],
              ["IMAGE", "Image"],
              ["LINK", "Link"],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              onClick={() =>
                setPanel(
                  kind === "TEXT"
                    ? { kind, initialHtml: "" }
                    : kind === "IMAGE"
                      ? {
                          kind,
                          initialImageUrl: "",
                          initialCaption: "",
                        }
                      : {
                          kind,
                          initialLabel: "",
                          initialUrl: "",
                        },
                )
              }
              className="border-line-strong text-ink hover:bg-raised rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {panel && panel.kind !== "EDIT" ? (
        <div className="border-line bg-surface mt-4 rounded-lg border p-4">
          {panel.kind === "TEXT" ? (
            <TextPanel
              key="text-new"
              heading="Add text"
              initialHtml={panel.initialHtml}
              onCancel={() => setPanel(null)}
              onSave={(html) => {
                addElement({ type: "TEXT", textContent: html }, 24, 24);
                setPanel(null);
              }}
            />
          ) : panel.kind === "IMAGE" ? (
            <ImagePanel
              key="image-new"
              heading="Add image"
              initialImageUrl={panel.initialImageUrl}
              initialCaption={panel.initialCaption}
              onCancel={() => setPanel(null)}
              onSave={(imageUrl, imageCaption) => {
                addElement(
                  {
                    type: "IMAGE",
                    imageUrl,
                    ...(imageCaption ? { imageCaption } : {}),
                  },
                  24,
                  24,
                );
                setPanel(null);
              }}
            />
          ) : (
            <LinkPanel
              key="link-new"
              heading="Add link"
              initialLabel={panel.initialLabel}
              initialUrl={panel.initialUrl}
              onCancel={() => setPanel(null)}
              onSave={(linkLabel, linkUrl) => {
                addElement({ type: "LINK", linkLabel, linkUrl }, 24, 24);
                setPanel(null);
              }}
            />
          )}
        </div>
      ) : null}

      {/* Theme picker: the built-in swatches plus a Custom entry that opens the
          full-page background controls. Selecting a swatch updates the preview
          live without publishing (spec 2/3). */}
      <div className="border-line bg-surface mt-6 rounded-lg border p-4">
        <h2 className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
          Theme
        </h2>
        <p className="text-muted mt-2 text-xs">
          Preview updates instantly. Nothing publishes until you Save Layout.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PROFILE_THEME_OPTIONS.map((option) => {
            const selected = resolveProfileTheme(theme) === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                aria-label={`Theme ${option.label}`}
                onClick={() => selectTheme(option.value)}
                className={
                  selected
                    ? "border-accent bg-raised flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
                    : "border-line-strong hover:bg-raised flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
                }
              >
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                  style={{ backgroundColor: option.background }}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: option.accent }}
                  />
                </span>
                <span className="text-ink">{option.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={customBackgroundOpen}
            aria-label="Custom background"
            onClick={() => setCustomBackgroundOpen((open) => !open)}
            className={
              customBackgroundOpen
                ? "border-accent bg-raised text-ink rounded-md border px-3 py-2 text-sm font-medium transition-colors"
                : "border-line-strong text-ink hover:bg-raised rounded-md border px-3 py-2 text-sm font-medium transition-colors"
            }
          >
            Custom
          </button>
        </div>

        {customBackgroundOpen ? (
          <div className="border-line mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
            <label className="text-ink flex items-center justify-between gap-3 text-sm font-medium">
              Background color
              <input
                type="color"
                aria-label="Background color"
                value={backgroundColor ?? "#ffffff"}
                onChange={(event) => applyBackgroundColor(event.target.value)}
                className={swatchClass}
              />
            </label>
            <div className="text-ink text-sm font-medium">
              Background image
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={backgroundUploading}
                  aria-label="Upload background image"
                  className="text-muted file:bg-raised file:text-ink text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadBackgroundImage(file);
                    event.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={backgroundUploading}
                  onClick={() => void pasteBackgroundImage()}
                  className="border-line-strong text-ink hover:bg-raised rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Paste image
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                type="button"
                onClick={removeBackgroundImage}
                className="border-line-strong text-ink hover:bg-raised rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
              >
                Remove background image
              </button>
              <button
                type="button"
                onClick={resetBackgroundToThemeDefault}
                className="border-line-strong text-ink hover:bg-raised rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
              >
                Reset to theme default
              </button>
            </div>
            {backgroundError ? (
              <p
                role="alert"
                className="text-danger text-sm break-words sm:col-span-2"
              >
                {backgroundError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div>
        <div className="mt-6 flex items-start gap-6">
          <aside className="border-line bg-surface w-64 shrink-0 rounded-lg border p-4">
            <h2 className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
              Library
            </h2>
            <p className="text-muted mt-2 text-xs">
              Drag an unplaced item onto the canvas.
            </p>
            <ul className="mt-3 space-y-2">
              {library.map((item) => {
                const key =
                  item.type === "PROJECT" ? item.projectId : item.type;
                const title =
                  item.type === "PROJECT"
                    ? item.title
                    : elementLabels[item.type];
                return (
                  <li
                    key={key}
                    draggable={!item.placed}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        DRAG_MIME,
                        JSON.stringify({
                          type: item.type,
                          ...(item.type === "PROJECT"
                            ? { projectId: item.projectId }
                            : {}),
                        }),
                      );
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    // Tap-to-place fallback for touch devices, where native
                    // drag never fires (spec 57/58). Placed items stay
                    // non-interactive, matching their disabled visual state.
                    onClick={
                      item.placed
                        ? undefined
                        : () =>
                            addElement(
                              {
                                type: item.type,
                                ...(item.type === "PROJECT"
                                  ? { projectId: item.projectId }
                                  : {}),
                              },
                              24,
                              24,
                            )
                    }
                    className={`border-line bg-canvas flex items-center gap-3 rounded-md border px-3 py-2 ${
                      item.placed ? "opacity-60" : "cursor-grab"
                    }`}
                  >
                    {item.type === "PROJECT" && item.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.thumbnailUrl}
                        alt=""
                        className="bg-raised h-8 w-8 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="bg-raised text-faint flex h-8 w-8 shrink-0 items-center justify-center rounded font-mono text-[10px] uppercase">
                        {item.type.slice(0, 2)}
                      </span>
                    )}
                    <span className="text-ink min-w-0 flex-1 truncate text-sm">
                      {title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase ${
                        item.placed
                          ? "bg-raised text-muted"
                          : "bg-accent text-on-accent"
                      }`}
                    >
                      {item.placed ? "Placed" : "Unplaced"}
                    </span>
                  </li>
                );
              })}
              {library.some((item) => item.type === "PROJECT") ? null : (
                <li className="text-faint px-1 py-2 text-xs">
                  No projects yet — new projects appear here as unplaced.
                </li>
              )}
            </ul>

            <h2 className="text-faint mt-6 font-mono text-xs tracking-[0.14em] uppercase">
              Resources
            </h2>
            <p className="text-muted mt-2 text-xs">
              Drag or tap an image onto the canvas. Reuse it as often as you
              like.
            </p>
            <ul className="mt-3 space-y-2">
              {resources.map((resource) => {
                const name = resourceName(resource.url);
                return (
                  <li
                    key={resource.id}
                    // Resources never mark themselves "placed": they stay
                    // draggable and tappable indefinitely (spec 53).
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        DRAG_MIME,
                        JSON.stringify({
                          type: "RESOURCE_IMAGE",
                          resourceId: resource.id,
                          imageUrl: resource.url,
                        }),
                      );
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => placeResource(resource)}
                    className="border-line bg-canvas flex cursor-grab items-center gap-3 rounded-md border px-3 py-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resource.url}
                      alt=""
                      className="bg-raised h-8 w-8 shrink-0 rounded object-cover"
                    />
                    <span className="text-ink min-w-0 flex-1 truncate text-sm">
                      {name}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${name} from Resources`}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeResource(resource.id);
                      }}
                      className="text-muted hover:bg-raised hover:text-danger shrink-0 rounded px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase transition-colors"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
              {resources.length === 0 ? (
                <li className="text-faint px-1 py-2 text-xs">
                  No resources yet — paste or upload an image to add one.
                </li>
              ) : null}
            </ul>
          </aside>

          <div
            className="border-line bg-canvas relative min-w-0 flex-1 overflow-auto rounded-lg border"
            // Cap the scroll container at the placeable surface's width (+2
            // for its own borders, box-sizing: border-box) so the visible
            // right border sits flush with the surface's right edge on wide
            // viewports; flex-1/min-w-0 still let it shrink and scroll on
            // narrow ones.
            style={{ maxWidth: bounds.width + 2 }}
          >
            <div
              ref={surfaceRef}
              data-testid="canvas-surface"
              onDragOver={onSurfaceDragOver}
              onDrop={onSurfaceDrop}
              onPointerDown={onSurfacePointerDown}
              onPointerMove={onSurfacePointerMove}
              onPointerUp={onSurfacePointerEnd}
              onPointerCancel={onSurfacePointerEnd}
              // The preview surface renders with the draft theme's tokens and
              // full-page background so the editor matches /<username> live and
              // updates immediately as theme/background change (spec 1/3/6).
              // resolveProfileTheme guards a missing/invalid value (spec 60).
              className={`relative ${profileThemeClass(resolveProfileTheme(theme))}`}
              style={{
                width: bounds.width,
                height: bounds.maxHeight,
                ...profileBackgroundStyle(backgroundColor, backgroundImageUrl),
              }}
            >
              {selectionAnchor ? (
                <div
                  className="border-line-strong bg-surface absolute flex gap-1 rounded-md border p-1 shadow-lg"
                  style={{
                    left: selectionAnchor.x,
                    top: Math.max(4, selectionAnchor.y - 38),
                    zIndex: editorChromeZ,
                  }}
                >
                  <button
                    type="button"
                    aria-label="Duplicate selected cards"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={duplicateSelectedElements}
                    className="text-ink hover:bg-raised rounded px-2 py-1 text-xs font-medium transition-colors"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    aria-label="Delete selected cards"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={deleteSelectedElements}
                    className="text-danger hover:bg-raised rounded px-2 py-1 text-xs font-medium transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    aria-label={`${allSelectedLocked ? "Unlock" : "Lock"} selected cards`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={toggleSelectedElementsLock}
                    className="text-ink hover:bg-raised rounded px-2 py-1 text-xs font-medium transition-colors"
                  >
                    {allSelectedLocked ? "Unlock" : "Lock"}
                  </button>
                </div>
              ) : null}
              {elements
                .filter((element) => element.locked)
                .map((element) => (
                  <span
                    key={`lock-${element.key}`}
                    role="img"
                    aria-label={`${elementLabels[element.type]} locked`}
                    className="border-line-strong bg-surface pointer-events-none absolute flex h-6 w-6 items-center justify-center rounded-full border text-xs shadow-sm"
                    style={{
                      left: element.x + 4,
                      top: Math.max(2, element.y - 28),
                      zIndex: editorChromeZ,
                    }}
                  >
                    &#128274;
                  </span>
                ))}
              {elements.map((element) => (
                <div
                  key={element.key}
                  data-canvas-element-key={element.key}
                  onPointerDown={(event) => startDrag(event, element, "move")}
                  onPointerMove={onDragPointerMove}
                  onPointerUp={onDragPointerEnd}
                  onPointerCancel={onDragPointerEnd}
                  onContextMenu={(event) => openContextMenu(event, element)}
                  className={`group absolute cursor-move touch-none ${
                    selection.has(element.key)
                      ? "border-accent border-2"
                      : "border-0"
                  }`}
                  style={{
                    left: element.x,
                    top: element.y,
                    width: element.width,
                    height: element.height,
                    zIndex: element.zIndex,
                  }}
                >
                  {/* Content is inert while editing so drags never fight
                      links/buttons inside; dense content clips (spec allows
                      clip/scroll at small sizes). */}
                  <div
                    className="pointer-events-none h-full w-full overflow-hidden select-none"
                    style={contentStyle(element)}
                  >
                    <ElementContent
                      element={element}
                      bio={profile.bio ?? null}
                      links={profile.links}
                      projectsById={projectsById}
                      displayName={profile.displayName}
                      username={username}
                      school={profile.school ?? null}
                      avatarUrl={profile.avatarUrl ?? null}
                      categories={categories}
                    />
                  </div>
                  {/* Visible entry point to the same shared card menu that
                      right-click opens. Sits inset from the top-right corner
                      so it never overlaps the resize handles' hit areas.
                      Hidden until hover/focus on fine pointers; always
                      visible on touch, where hover does not exist. */}
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-label={`Open menu for ${elementLabels[element.type]}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => openMenuFromButton(event, element)}
                    className={`border-line-strong bg-surface/90 text-muted hover:text-ink absolute top-1 right-6 z-20 flex h-6 w-6 items-center justify-center rounded-md border text-sm leading-none transition-opacity focus:opacity-100 [@media(pointer:coarse)]:opacity-100 ${
                      selection.has(element.key)
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    ⋯
                  </button>
                  {selection.has(element.key)
                    ? RESIZE_HANDLES.map((handle) => (
                        <div
                          key={handle.corner}
                          role="presentation"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            startDrag(event, element, "resize", handle.corner);
                          }}
                          onPointerMove={onDragPointerMove}
                          onPointerUp={onDragPointerEnd}
                          onPointerCancel={onDragPointerEnd}
                          className={`bg-accent absolute z-10 h-2.5 w-2.5 touch-none rounded-full ${handle.className}`}
                        />
                      ))
                    : null}
                </div>
              ))}
              {marquee ? (
                <div
                  data-testid="selection-marquee"
                  className="border-accent bg-accent/15 pointer-events-none absolute border-2"
                  style={{ ...marqueeBox(marquee), zIndex: editorChromeZ + 1 }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {panel?.kind === "EDIT"
        ? (() => {
            const target = elements.find(
              (element) => element.key === panel.editKey,
            );
            if (!target) return null;
            const project = target.projectId
              ? projectsById.get(target.projectId)
              : undefined;
            const position = editPopupPosition ?? {
              left: panel.anchor.left,
              top: panel.anchor.top,
              ready: false,
            };
            const applyElementPatch = (patch: Partial<EditorElement>) => {
              panelHistoryChangedRef.current = true;
              patchElement(target.key, patch);
            };
            return (
              <div
                ref={editPopupRef}
                role="dialog"
                aria-label={`Edit ${elementLabels[target.type]}`}
                data-testid="edit-popup"
                onPointerDown={(event) => event.stopPropagation()}
                className="border-line-strong bg-surface fixed z-[60] max-h-[calc(100vh-1rem)] w-[min(32rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border p-4 shadow-xl"
                style={{
                  left: position.left,
                  top: position.top,
                  visibility: position.ready ? "visible" : "hidden",
                }}
              >
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-ink font-display text-lg font-semibold">
                    Edit {elementLabels[target.type]}
                  </h2>
                  <button
                    type="button"
                    aria-label="Close edit popup"
                    onClick={closeEditPopup}
                    className="text-muted hover:bg-raised hover:text-ink rounded px-2 py-1 text-sm font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4">
                  {target.type === "ABOUT" ? (
                    <BioProfileFields
                      bio={profile.bio ?? ""}
                      onApply={(bioValue) => patchProfile({ bio: bioValue })}
                    />
                  ) : target.type === "LINKS" ? (
                    <LinksProfileFields
                      links={profile.links}
                      onApply={(nextLinks) =>
                        patchProfile({ links: nextLinks })
                      }
                    />
                  ) : target.type === "AVATAR" ? (
                    <AvatarProfileFields
                      avatarUrl={profile.avatarUrl ?? ""}
                      onApply={(nextAvatarUrl) =>
                        patchProfile({ avatarUrl: nextAvatarUrl })
                      }
                    />
                  ) : target.type === "NAME" ? (
                    <NameProfileFields
                      displayName={profile.displayName}
                      school={profile.school ?? ""}
                      onApply={(nextDisplayName) =>
                        patchProfile({ displayName: nextDisplayName })
                      }
                      onApplySchool={(nextSchool) =>
                        patchProfile({ school: nextSchool })
                      }
                    />
                  ) : target.type === "PROJECT" && project ? (
                    <ProjectCardPanel
                      project={project}
                      element={target}
                      onCancel={closeEditPopup}
                      onSave={(patch) => {
                        applyElementPatch(patch);
                        closeEditPopup();
                      }}
                    />
                  ) : target.type === "TEXT" ? (
                    <TextPanel
                      heading="Content"
                      initialHtml={target.textContent ?? ""}
                      onCancel={closeEditPopup}
                      onSave={(html) => {
                        applyElementPatch({ textContent: html });
                        closeEditPopup();
                      }}
                    />
                  ) : target.type === "IMAGE" ? (
                    <ImagePanel
                      heading="Content"
                      initialImageUrl={target.imageUrl ?? ""}
                      initialCaption={target.imageCaption ?? ""}
                      onCancel={closeEditPopup}
                      onSave={(imageUrl, imageCaption) => {
                        applyElementPatch({
                          imageUrl,
                          imageCaption: imageCaption || null,
                        });
                        closeEditPopup();
                      }}
                    />
                  ) : target.type === "LINK" ? (
                    <LinkPanel
                      heading="Content"
                      initialLabel={target.linkLabel ?? ""}
                      initialUrl={target.linkUrl ?? ""}
                      onCancel={closeEditPopup}
                      onSave={(linkLabel, linkUrl) => {
                        applyElementPatch({ linkLabel, linkUrl });
                        closeEditPopup();
                      }}
                    />
                  ) : null}
                </div>

                {STYLEABLE_TYPE_SET.has(target.type) ? (
                  <div className="border-line mt-4 border-t pt-4">
                    <StyleControls
                      element={target}
                      onApply={applyElementPatch}
                    />
                  </div>
                ) : null}
              </div>
            );
          })()
        : null}

      {contextMenu
        ? (() => {
            const element = elements.find(
              (item) => item.key === contextMenu.key,
            );
            if (!element) return null;
            return (
              <div
                ref={menuRef}
                role="menu"
                // Keep the window pointerdown close-listener from firing so
                // the menu's own actions receive their click.
                onPointerDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
                className="border-line-strong bg-surface fixed z-50 w-36 rounded-md border py-1 shadow-lg"
                style={{ left: contextMenu.x, top: contextMenu.y }}
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={contextMenu.targetSelection.size > 1}
                  aria-disabled={contextMenu.targetSelection.size > 1}
                  onClick={() => {
                    setContextMenu(null);
                    handleEdit(element);
                  }}
                  className="text-ink hover:bg-raised block w-full px-3 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const target = contextMenu.targetSelection;
                    setContextMenu(null);
                    void cutSelection(target);
                  }}
                  className="text-ink hover:bg-raised block w-full px-3 py-1.5 text-left text-sm transition-colors"
                >
                  Cut
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const target = contextMenu.targetSelection;
                    setContextMenu(null);
                    void copySelection(target);
                  }}
                  className="text-ink hover:bg-raised block w-full px-3 py-1.5 text-left text-sm transition-colors"
                >
                  Copy
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void pasteFromMenu()}
                  className="text-ink hover:bg-raised block w-full px-3 py-1.5 text-left text-sm transition-colors"
                >
                  Paste
                </button>
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={contextMenu.layerOpen}
                  onClick={() =>
                    setContextMenu((current) =>
                      current
                        ? { ...current, layerOpen: !current.layerOpen }
                        : current,
                    )
                  }
                  className="text-ink hover:bg-raised flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition-colors"
                >
                  Layer
                  <span aria-hidden>{contextMenu.layerOpen ? "−" : "+"}</span>
                </button>
                {contextMenu.layerOpen ? (
                  <div
                    role="menu"
                    aria-label="Layer actions"
                    className="border-line mx-2 mb-1 border-l pl-1"
                  >
                    {(
                      [
                        ["front", "Bring to front"],
                        ["forward", "Bring forward"],
                        ["backward", "Send backward"],
                        ["back", "Send to back"],
                      ] as const
                    ).map(([action, label]) => (
                      <button
                        key={action}
                        type="button"
                        role="menuitem"
                        onClick={() =>
                          applyLayerAction(contextMenu.targetSelection, action)
                        }
                        className="text-ink hover:bg-raised block w-full px-2 py-1.5 text-left text-xs transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setContextMenu(null);
                    removeElement(element.key);
                  }}
                  className="text-danger hover:bg-raised block w-full px-3 py-1.5 text-left text-sm transition-colors"
                >
                  Delete
                </button>
              </div>
            );
          })()
        : null}
    </>
  );
}

function ElementContent({
  element,
  bio,
  links,
  projectsById,
  displayName,
  username,
  school,
  avatarUrl,
  categories,
}: {
  element: EditorElement;
  bio: string | null;
  links: ProfileLink[];
  projectsById: Map<string, EditorProject>;
  displayName: string;
  username: string;
  school: string | null;
  avatarUrl: string | null;
  categories: string[];
}) {
  if (element.type === "AVATAR") {
    return (
      <AvatarContent
        avatarUrl={avatarUrl}
        displayName={displayName}
        shape={element.avatarShape}
        zoom={element.avatarZoom}
        offsetX={element.avatarOffsetX}
        offsetY={element.avatarOffsetY}
      />
    );
  }
  if (element.type === "NAME") {
    return (
      <div className="flex h-full items-center p-4">
        <span className="font-display text-2xl font-semibold tracking-tight break-words">
          {displayName}
        </span>
      </div>
    );
  }
  if (element.type === "USERNAME") {
    return (
      <div className="flex h-full items-center p-4">
        <span className="font-mono text-sm break-words">
          @{username}
          {school ? ` · ${school}` : ""}
        </span>
      </div>
    );
  }
  if (element.type === "CATEGORIES") {
    return (
      <div className="p-4">
        {categories.length ? (
          <div className="flex flex-wrap gap-2">
            {categories.map((label) => (
              <span
                key={label}
                className="bg-raised rounded-full px-3 py-1 text-sm"
              >
                {label}
              </span>
            ))}
          </div>
        ) : (
          <p className="profile-muted text-muted text-sm">No categories yet.</p>
        )}
      </div>
    );
  }
  if (element.type === "ABOUT") {
    return (
      <div className="p-4">
        <h2 className="font-display text-xl font-semibold">About</h2>
        <p className="profile-muted text-muted mt-2 text-sm leading-6 break-words whitespace-pre-wrap">
          {bio ?? "This person has not added a bio yet."}
        </p>
      </div>
    );
  }
  if (element.type === "LINKS") {
    return (
      <div className="p-4">
        <h2 className="font-display text-xl font-semibold">Links</h2>
        {links.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {links.map((link) => (
              <span
                key={`${link.label}-${link.url}`}
                className="border-line-strong max-w-full truncate rounded-md border px-3 py-1.5 text-sm font-medium"
              >
                {link.label}
              </span>
            ))}
          </div>
        ) : (
          <p className="profile-muted text-muted mt-2 text-sm">
            No links added.
          </p>
        )}
      </div>
    );
  }
  if (element.type === "TEXT") {
    return (
      <div
        className="p-4 text-sm leading-6 break-words [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        // Author's own in-editor content (local state, pre-save); the server
        // sanitizes it against an allowlist before it is ever stored.
        dangerouslySetInnerHTML={{ __html: element.textContent ?? "" }}
      />
    );
  }
  if (element.type === "IMAGE") {
    return (
      <figure className="relative h-full w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={element.imageUrl ?? ""}
          alt={element.imageCaption ?? ""}
          className="h-full w-full object-cover"
        />
        {element.imageCaption ? (
          <figcaption className="bg-surface/85 text-ink absolute inset-x-0 bottom-0 truncate px-3 py-1.5 text-xs">
            {element.imageCaption}
          </figcaption>
        ) : null}
      </figure>
    );
  }
  if (element.type === "LINK") {
    const favicon = element.linkUrl ? faviconUrl(element.linkUrl) : null;
    return (
      <div className="flex h-full items-center gap-3 p-4">
        {favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={favicon} alt="" className="h-5 w-5 shrink-0 rounded" />
        ) : null}
        <span className="text-ink truncate text-sm font-medium">
          {element.linkLabel}
        </span>
      </div>
    );
  }
  const project = element.projectId
    ? projectsById.get(element.projectId)
    : undefined;
  if (!project) {
    return (
      <p className="text-faint p-4 font-mono text-xs uppercase">
        Project unavailable
      </p>
    );
  }
  const effective = applyProjectCardOverrides(project, {
    titleOverride: element.projectTitleOverride,
    descriptionOverride: element.projectDescriptionOverride,
    hashtagsOverride: element.projectHashtagsOverride,
  });
  return (
    <ProjectCard
      project={effective}
      layout={resolveCardLayout(element.cardLayout)}
    />
  );
}

// Avatar element preview: renders the uploaded/URL image within the chosen
// frame shape, honoring zoom (background-size) and position (background-
// position). Falls back to the initials tile when no avatar image is set.
function AvatarContent({
  avatarUrl,
  displayName,
  shape,
  zoom,
  offsetX,
  offsetY,
}: {
  avatarUrl: string | null;
  displayName: string;
  shape: string | null;
  zoom: number | null;
  offsetX: number | null;
  offsetY: number | null;
}) {
  const radius = avatarShapeRadius(shape);
  if (!avatarUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center p-2">
        <div
          className="border-line-strong bg-raised font-display text-ink flex h-full w-full items-center justify-center border text-4xl font-semibold"
          style={{ borderRadius: radius }}
        >
          {displayName.slice(0, 1).toUpperCase()}
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center p-2">
      <div
        className="border-line-strong h-full w-full border"
        style={{
          borderRadius: radius,
          backgroundImage: `url(${JSON.stringify(avatarUrl)})`,
          backgroundSize: `${zoom ?? AVATAR_ZOOM_DEFAULT}%`,
          backgroundPosition: `${offsetX ?? AVATAR_OFFSET_DEFAULT}% ${
            offsetY ?? AVATAR_OFFSET_DEFAULT
          }%`,
          backgroundRepeat: "no-repeat",
        }}
      />
    </div>
  );
}

function NameProfileFields({
  displayName,
  school,
  onApply,
  onApplySchool,
}: {
  displayName: string;
  school: string;
  onApply: (displayName: string) => void;
  onApplySchool: (school: string) => void;
}) {
  const [value, setValue] = useState(displayName);
  const [schoolValue, setSchoolValue] = useState(school);
  const [error, setError] = useState("");
  return (
    <div className="space-y-4">
      <label className="text-ink block text-sm font-medium">
        Display name
        <input
          data-popup-initial-focus
          required
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            setValue(next);
            if (!next.trim()) {
              setError("Display name is required.");
              return;
            }
            setError("");
            onApply(next);
          }}
          className={panelInputClass}
        />
        {error ? (
          <span role="alert" className="text-danger mt-2 block text-sm">
            {error}
          </span>
        ) : null}
      </label>
      <label className="text-ink block text-sm font-medium">
        School <span className="text-faint font-normal">(optional)</span>
        <input
          value={schoolValue}
          onChange={(event) => {
            const next = event.target.value;
            setSchoolValue(next);
            onApplySchool(next);
          }}
          className={panelInputClass}
        />
      </label>
    </div>
  );
}

function BioProfileFields({
  bio,
  onApply,
}: {
  bio: string;
  onApply: (bio: string) => void;
}) {
  return (
    <label className="text-ink block text-sm font-medium">
      Bio
      <textarea
        data-popup-initial-focus
        rows={6}
        value={bio}
        onChange={(event) => onApply(event.target.value)}
        className={panelInputClass}
      />
    </label>
  );
}

type PopupLinkRow = ProfileLink & { id: number };

function LinksProfileFields({
  links,
  onApply,
}: {
  links: ProfileLink[];
  onApply: (links: ProfileLink[]) => void;
}) {
  const [rows, setRows] = useState<PopupLinkRow[]>(() =>
    links.map((link, id) => ({ ...link, id })),
  );
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [applied, setApplied] = useState(false);
  const nextId = useRef(links.length);

  function updateRow(id: number, patch: Partial<ProfileLink>) {
    setApplied(false);
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function applyLinks() {
    const nextErrors: Record<number, string> = {};
    const nextLinks: ProfileLink[] = [];
    for (const row of rows) {
      const label = row.label.trim();
      const url = row.url.trim();
      if (!label && !url) continue;
      if (!label) {
        nextErrors[row.id] = "Add a label for the link.";
        continue;
      }
      const safeUrl = safeExternalUrl(url);
      if (!safeUrl) {
        nextErrors[row.id] = "Enter a valid http(s) URL.";
        continue;
      }
      nextLinks.push({ label, url: safeUrl });
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onApply(nextLinks);
    setApplied(true);
  }

  return (
    <fieldset>
      <legend className="text-ink text-sm font-medium">External links</legend>
      <p className="text-muted mt-1 text-xs">
        Each non-empty row needs a label and an http(s) URL.
      </p>
      <ul className="mt-3 space-y-3">
        {rows.map((row, index) => (
          <li key={row.id} className="border-line rounded-md border p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="text-ink block text-sm font-medium">
                Label
                <input
                  {...(index === 0 ? { "data-popup-initial-focus": true } : {})}
                  value={row.label}
                  maxLength={40}
                  onChange={(event) =>
                    updateRow(row.id, { label: event.target.value })
                  }
                  className={panelInputClass}
                />
              </label>
              <label className="text-ink block text-sm font-medium">
                URL
                <input
                  value={row.url}
                  placeholder="https://example.com"
                  onChange={(event) =>
                    updateRow(row.id, { url: event.target.value })
                  }
                  className={panelInputClass}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setApplied(false);
                  setRows((current) =>
                    current.filter((item) => item.id !== row.id),
                  );
                  setErrors((current) => {
                    const next = { ...current };
                    delete next[row.id];
                    return next;
                  });
                }}
                className="text-danger border-line-strong hover:bg-raised h-fit rounded-md border px-3 py-2 text-sm font-medium transition-colors"
              >
                Remove
              </button>
            </div>
            {errors[row.id] ? (
              <p role="alert" className="text-danger mt-2 text-sm">
                {errors[row.id]}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          {...(rows.length === 0 ? { "data-popup-initial-focus": true } : {})}
          onClick={() => {
            setApplied(false);
            setRows((current) => [
              ...current,
              { id: nextId.current++, label: "", url: "" },
            ]);
          }}
          className="border-line-strong text-muted hover:bg-raised hover:text-ink rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          Add link
        </button>
        <button
          type="button"
          onClick={applyLinks}
          className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-3 py-1.5 text-sm font-semibold transition-colors"
        >
          Apply links
        </button>
        {applied ? (
          <span className="text-success text-sm">Applied.</span>
        ) : null}
      </div>
    </fieldset>
  );
}

function AvatarProfileFields({
  avatarUrl,
  onApply,
}: {
  avatarUrl: string;
  onApply: (avatarUrl: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const result = await uploadFileDirect(file, "canvas-resource");
      onApply(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="text-ink block text-sm font-medium">
        Profile picture
        <input
          data-popup-initial-focus
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={uploading}
          className="text-muted file:bg-raised file:text-ink mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
      </label>
      {avatarUrl ? (
        <p className="text-muted mt-2 truncate font-mono text-xs">
          {avatarUrl}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger mt-2 text-sm break-words">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const swatchClass =
  "h-8 w-8 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0";

// Appearance section embedded in the merged Edit popup. Changes apply live so
// the canvas preview updates immediately; the popup owns close/history logic.
function StyleControls({
  element,
  onApply,
}: {
  element: EditorElement;
  onApply: (patch: Partial<EditorElement>) => void;
}) {
  const isAvatar = element.type === "AVATAR";
  return (
    <div>
      <h3 className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
        Appearance
      </h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <label className="text-ink flex items-center justify-between gap-3 text-sm font-medium">
          Text color
          <span className="flex items-center gap-2">
            <input
              data-popup-initial-focus
              type="color"
              aria-label="Text color"
              value={element.textColor ?? "#000000"}
              onChange={(event) => onApply({ textColor: event.target.value })}
              className={swatchClass}
            />
            <button
              type="button"
              onClick={() => onApply({ textColor: null })}
              className="text-muted hover:text-ink text-xs underline-offset-2 hover:underline"
            >
              Reset
            </button>
          </span>
        </label>
        <label className="text-ink flex items-center justify-between gap-3 text-sm font-medium">
          Background
          <span className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Background color"
              value={
                element.backgroundColor &&
                element.backgroundColor !== "transparent"
                  ? element.backgroundColor
                  : "#ffffff"
              }
              onChange={(event) =>
                onApply({ backgroundColor: event.target.value })
              }
              className={swatchClass}
            />
            <button
              type="button"
              onClick={() => onApply({ backgroundColor: "transparent" })}
              className="text-muted hover:text-ink text-xs underline-offset-2 hover:underline"
            >
              Transparent
            </button>
          </span>
        </label>
        <label className="text-ink block text-sm font-medium sm:col-span-2">
          Font
          <select
            aria-label="Font"
            value={element.fontFamily ?? ""}
            onChange={(event) =>
              onApply({ fontFamily: event.target.value || null })
            }
            className={panelInputClass}
          >
            <option value="">Default</option>
            {CANVAS_FONTS.map((font) => (
              <option key={font.id} value={font.id}>
                {font.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isAvatar ? (
        <div className="border-line mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
          <label className="text-ink block text-sm font-medium">
            Frame shape
            <select
              aria-label="Frame shape"
              value={element.avatarShape ?? "circle"}
              onChange={(event) => onApply({ avatarShape: event.target.value })}
              className={panelInputClass}
            >
              {AVATAR_SHAPES.map((shape) => (
                <option key={shape} value={shape}>
                  {shape[0]!.toUpperCase() + shape.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-ink block text-sm font-medium">
            Zoom
            <input
              type="range"
              aria-label="Zoom"
              min={AVATAR_ZOOM_MIN}
              max={AVATAR_ZOOM_MAX}
              value={element.avatarZoom ?? AVATAR_ZOOM_DEFAULT}
              onChange={(event) =>
                onApply({ avatarZoom: Number(event.target.value) })
              }
              className="mt-2 block w-full"
            />
          </label>
          <label className="text-ink block text-sm font-medium">
            Position X
            <input
              type="range"
              aria-label="Position X"
              min={AVATAR_OFFSET_MIN}
              max={AVATAR_OFFSET_MAX}
              value={element.avatarOffsetX ?? AVATAR_OFFSET_DEFAULT}
              onChange={(event) =>
                onApply({ avatarOffsetX: Number(event.target.value) })
              }
              className="mt-2 block w-full"
            />
          </label>
          <label className="text-ink block text-sm font-medium">
            Position Y
            <input
              type="range"
              aria-label="Position Y"
              min={AVATAR_OFFSET_MIN}
              max={AVATAR_OFFSET_MAX}
              value={element.avatarOffsetY ?? AVATAR_OFFSET_DEFAULT}
              onChange={(event) =>
                onApply({ avatarOffsetY: Number(event.target.value) })
              }
              className="mt-2 block w-full"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

const panelInputClass =
  "border-line-strong bg-canvas text-ink placeholder:text-faint focus:border-accent mt-2 block w-full rounded-md border px-3 py-2 text-sm";

function PanelActions({
  onCancel,
  saveLabel,
  disabled,
}: {
  onCancel: () => void;
  saveLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        type="submit"
        disabled={disabled}
        className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {saveLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="text-muted hover:text-ink text-sm font-medium transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

function TextPanel({
  heading,
  initialHtml,
  onSave,
  onCancel,
}: {
  heading: string;
  initialHtml: string;
  onSave: (html: string) => void;
  onCancel: () => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");

  // document.execCommand is deprecated but has no dependency-free
  // replacement for a minimal contentEditable toolbar; the server sanitizes
  // whatever HTML this produces before storing it.
  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function insertLink() {
    const url = window.prompt("Link URL (https://…)");
    if (!url) return;
    if (!safeExternalUrl(url)) {
      setError("Links must be valid http(s) URLs.");
      return;
    }
    setError("");
    exec("createLink", url);
  }

  const toolbar: { label: string; title: string; action: () => void }[] = [
    { label: "B", title: "Bold", action: () => exec("bold") },
    { label: "I", title: "Italic", action: () => exec("italic") },
    {
      label: "• List",
      title: "Bulleted list",
      action: () => exec("insertUnorderedList"),
    },
    {
      label: "1. List",
      title: "Numbered list",
      action: () => exec("insertOrderedList"),
    },
    { label: "Link", title: "Insert link", action: insertLink },
  ];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const editor = editorRef.current;
        if (!editor?.textContent?.trim()) {
          setError("Add some text before saving.");
          return;
        }
        onSave(editor.innerHTML);
      }}
    >
      <h3 className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
        {heading}
      </h3>
      <div className="mt-3 flex flex-wrap gap-1">
        {toolbar.map((button) => (
          <button
            key={button.title}
            type="button"
            title={button.title}
            // preventDefault keeps the contentEditable selection intact so
            // the command applies to the highlighted text.
            onMouseDown={(event) => event.preventDefault()}
            onClick={button.action}
            className="border-line-strong text-ink hover:bg-raised rounded border px-2 py-1 text-xs font-medium transition-colors"
          >
            {button.label}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        data-popup-initial-focus
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Text content"
        // The author's own draft HTML (already server-sanitized when it came
        // from a stored element).
        dangerouslySetInnerHTML={{ __html: initialHtml }}
        // Canvas text-entry surface: transparent background with a dotted
        // outline showing the fillable bounds (spec Requirement 8), so editing
        // matches how the text will render once published rather than looking
        // like a solid-bordered form control.
        className="border-line-strong focus:border-accent mt-2 min-h-32 rounded-md border border-dotted bg-transparent px-3 py-2 text-sm leading-6 break-words text-inherit outline-none [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      />
      {error ? (
        <p role="alert" className="text-danger mt-2 text-sm">
          {error}
        </p>
      ) : null}
      <PanelActions onCancel={onCancel} saveLabel="Save text" />
    </form>
  );
}

function ImagePanel({
  heading,
  initialImageUrl,
  initialCaption,
  onSave,
  onCancel,
}: {
  heading: string;
  initialImageUrl: string;
  initialCaption: string;
  onSave: (imageUrl: string, imageCaption: string) => void;
  onCancel: () => void;
}) {
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [caption, setCaption] = useState(initialCaption);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const result = await uploadFileDirect(file, "canvas-resource");
      setImageUrl(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!imageUrl) {
          setError("Upload an image first.");
          return;
        }
        onSave(imageUrl, caption.trim());
      }}
    >
      <h3 className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
        {heading}
      </h3>
      <label className="border-line-strong text-muted mt-3 block rounded-md border border-dashed p-4 text-sm font-medium">
        {uploading
          ? "Uploading…"
          : imageUrl
            ? "Replace the image"
            : "Upload an image"}
        <input
          data-popup-initial-focus
          type="file"
          accept="image/*"
          disabled={uploading}
          className="text-muted file:bg-raised file:text-ink mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
      </label>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="bg-raised mt-3 max-h-40 rounded-md object-contain"
        />
      ) : null}
      <label className="text-ink mt-3 block text-sm font-medium">
        Caption <span className="text-faint font-normal">(optional)</span>
        <input
          value={caption}
          maxLength={300}
          onChange={(event) => setCaption(event.target.value)}
          className={panelInputClass}
        />
      </label>
      {error ? (
        <p role="alert" className="text-danger mt-2 text-sm break-words">
          {error}
        </p>
      ) : null}
      <PanelActions
        onCancel={onCancel}
        saveLabel="Save image"
        disabled={uploading}
      />
    </form>
  );
}

function LinkPanel({
  heading,
  initialLabel,
  initialUrl,
  onSave,
  onCancel,
}: {
  heading: string;
  initialLabel: string;
  initialUrl: string;
  onSave: (linkLabel: string, linkUrl: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const trimmedLabel = label.trim();
        const safeUrl = safeExternalUrl(url.trim());
        if (!trimmedLabel) {
          setError("Add a label for the link.");
          return;
        }
        if (!safeUrl) {
          setError("Enter a valid http(s) URL.");
          return;
        }
        onSave(trimmedLabel, safeUrl);
      }}
    >
      <h3 className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
        {heading}
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-ink block text-sm font-medium">
          Label
          <input
            data-popup-initial-focus
            value={label}
            maxLength={160}
            onChange={(event) => setLabel(event.target.value)}
            className={panelInputClass}
          />
        </label>
        <label className="text-ink block text-sm font-medium">
          URL
          <input
            value={url}
            placeholder="https://example.com"
            onChange={(event) => setUrl(event.target.value)}
            className={panelInputClass}
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-danger mt-2 text-sm">
          {error}
        </p>
      ) : null}
      <PanelActions onCancel={onCancel} saveLabel="Save link" />
    </form>
  );
}

// Inline, canvas-only editor for a placed PROJECT card. Overrides the
// title/description/hashtags this one placement shows and its card layout —
// never the underlying Project. Blank title/description fall back to the real
// project; the hashtags checkbox distinguishes "unset" (fall back) from an
// explicit empty override (show no hashtags).
function ProjectCardPanel({
  project,
  element,
  onSave,
  onCancel,
}: {
  project: EditorProject;
  element: EditorElement;
  onSave: (patch: Partial<EditorElement>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(element.projectTitleOverride ?? "");
  const [description, setDescription] = useState(
    element.projectDescriptionOverride ?? "",
  );
  const [overrideHashtags, setOverrideHashtags] = useState(
    element.projectHashtagsOverride !== null,
  );
  const [hashtagsText, setHashtagsText] = useState(
    element.projectHashtagsOverride
      ? element.projectHashtagsOverride.join(" ")
      : "",
  );
  const [layout, setLayout] = useState<string>(
    element.cardLayout ?? DEFAULT_CARD_LAYOUT,
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const trimmedTitle = title.trim();
        const trimmedDescription = description.trim();
        onSave({
          projectTitleOverride: trimmedTitle ? trimmedTitle : null,
          projectDescriptionOverride: trimmedDescription
            ? trimmedDescription
            : null,
          projectHashtagsOverride: overrideHashtags
            ? normalizeHashtags(hashtagsText.split(/[\s,]+/))
            : null,
          cardLayout: layout === DEFAULT_CARD_LAYOUT ? null : layout,
        });
      }}
    >
      <h3 className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
        Edit project card
      </h3>
      <p className="text-muted mt-2 text-xs">
        These changes apply only to this canvas placement — your actual project
        is unchanged. Leave a field blank to show the project’s real value.
      </p>
      <label className="text-ink mt-3 block text-sm font-medium">
        Title override
        <input
          data-popup-initial-focus
          value={title}
          maxLength={160}
          placeholder={project.title}
          onChange={(event) => setTitle(event.target.value)}
          className={panelInputClass}
        />
      </label>
      <label className="text-ink mt-3 block text-sm font-medium">
        Description override
        <textarea
          value={description}
          maxLength={20_000}
          rows={3}
          placeholder={project.description}
          onChange={(event) => setDescription(event.target.value)}
          className={panelInputClass}
        />
      </label>
      <div className="mt-3">
        <label className="text-ink flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            aria-label="Override hashtags"
            checked={overrideHashtags}
            onChange={(event) => setOverrideHashtags(event.target.checked)}
          />
          Override hashtags
        </label>
        {overrideHashtags ? (
          <input
            aria-label="Hashtags override"
            value={hashtagsText}
            placeholder={project.hashtags.join(" ")}
            onChange={(event) => setHashtagsText(event.target.value)}
            className={panelInputClass}
          />
        ) : (
          <p className="text-faint mt-1 text-xs">
            Showing the project’s real hashtags. Check the box to override them
            (leave the field empty to show none).
          </p>
        )}
      </div>
      <label className="text-ink mt-3 block text-sm font-medium">
        Card layout
        <select
          aria-label="Card layout"
          value={layout}
          onChange={(event) => setLayout(event.target.value)}
          className={panelInputClass}
        >
          {CARD_LAYOUTS.map((option) => (
            <option key={option} value={option}>
              {CARD_LAYOUT_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-3 text-sm">
        <Link
          href={`/projects/${project.id}/edit`}
          className="text-accent hover:text-accent-strong font-semibold transition-colors"
        >
          Edit full project →
        </Link>
      </p>
      <PanelActions onCancel={onCancel} saveLabel="Save card" />
    </form>
  );
}
