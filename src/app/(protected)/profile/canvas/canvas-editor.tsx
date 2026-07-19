"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";

import { ProjectCard } from "~/app/project-card";
import { safeExternalUrl } from "~/app/safe-external-url";
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
import { api } from "~/trpc/react";
import { AUTOSAVE_INTERVAL_MS, createAutosaveController } from "./autosave";
import {
  bringElementToFront,
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
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
} & ElementStyle;

type ElementPayload = {
  type: ElementType;
  projectId?: string;
  textContent?: string;
  imageUrl?: string;
  imageCaption?: string;
  linkLabel?: string;
  linkUrl?: string;
  textColor?: string;
  backgroundColor?: string;
  fontFamily?: CanvasFontId;
  avatarShape?: AvatarShape;
  avatarZoom?: number;
  avatarOffsetX?: number;
  avatarOffsetY?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
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
  moved: boolean;
};

type ContextMenuState = { key: string; x: number; y: number };

// Inline Add Component / edit panel. `editKey` is null when creating a new
// element and set to the element's key when editing an existing one.
type PanelState =
  | { kind: "TEXT"; editKey: string | null; initialHtml: string }
  | {
      kind: "IMAGE";
      editKey: string | null;
      initialImageUrl: string;
      initialCaption: string;
    }
  | {
      kind: "LINK";
      editKey: string | null;
      initialLabel: string;
      initialUrl: string;
    }
  // Style panel targets an already-placed element (editKey always set).
  | { kind: "STYLE"; editKey: string };

// Freeform elements are created via Add Component, can appear any number of
// times, and have no unplaced Library state.
const FREEFORM_TYPES = new Set<ElementType>(["TEXT", "IMAGE", "LINK"]);

const RESIZE_HANDLES: { corner: Corner; className: string }[] = [
  {
    corner: "top-left",
    className: "top-0 left-0 cursor-nwse-resize rounded-br border-r-2 border-b-2",
  },
  {
    corner: "top-right",
    className: "top-0 right-0 cursor-nesw-resize rounded-bl border-b-2 border-l-2",
  },
  {
    corner: "bottom-left",
    className:
      "bottom-0 left-0 cursor-nesw-resize rounded-tr border-t-2 border-r-2",
  },
  {
    corner: "bottom-right",
    className:
      "bottom-0 right-0 cursor-nwse-resize rounded-tl border-t-2 border-l-2",
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
      ...(styleable && element.textColor ? { textColor: element.textColor } : {}),
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
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      zIndex: element.zIndex,
    };
  });
}

function maxZIndex(elements: EditorElement[]) {
  return elements.reduce((max, element) => Math.max(max, element.zIndex), 0);
}

export function CanvasEditor({
  bio,
  links,
  projects,
  displayName,
  username,
  school,
  avatarUrl,
  categories,
}: CanvasEditorProps) {
  const router = useRouter();
  const editorState = api.canvas.getEditorState.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const saveDraft = api.canvas.saveDraft.useMutation();
  const publish = api.canvas.publish.useMutation();
  const dismissHint = api.canvas.dismissHint.useMutation();

  // Local in-editor state is the source of truth once loaded; the server is
  // only consulted for the initial snapshot and for clamp reconciliation.
  const [elements, setElements] = useState<EditorElement[] | null>(null);
  const [publishStatus, setPublishStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  // A single state slot means only one context menu can be open at a time;
  // opening a new one replaces the previous.
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [panel, setPanel] = useState<PanelState | null>(null);
  // Optimistic local dismissal of the first-run hint; the server persists it
  // via dismissHint so it stays gone across devices.
  const [hintHidden, setHintHidden] = useState(false);

  const elementsRef = useRef<EditorElement[] | null>(null);
  elementsRef.current = elements;
  const saveDraftRef = useRef(saveDraft.mutateAsync);
  saveDraftRef.current = saveDraft.mutateAsync;
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const keyCounter = useRef(0);
  // The "⋯" button that opened the current context menu (null when the menu
  // was opened by right-click), so Escape can restore focus to it.
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const bounds = editorState.data?.bounds ?? FALLBACK_BOUNDS;
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  useEffect(() => {
    if (elementsRef.current === null && editorState.data) {
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
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
          zIndex: element.zIndex,
        })),
      );
    }
  }, [editorState.data]);

  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  // Reconcile local state with the clamped array the server returned. Only
  // elements whose geometry is unchanged since the snapshot are updated, so
  // an in-progress drag is never clobbered by a slow response.
  const reconcile = useCallback(
    (sent: EditorElement[], result: readonly ElementPayload[] | undefined) => {
      if (!result) return;
      setElements((current) => {
        if (!current) return current;
        return current.map((element) => {
          const index = sent.findIndex((item) => item.key === element.key);
          const snapshot = sent[index];
          const clamped = result[index];
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
    try {
      const result = await saveDraftRef.current(toPayload(snapshot));
      reconcile(snapshot, result);
    } catch {
      // Surfaced via saveDraft.isError; the next change re-marks dirty.
    }
  }, [reconcile]);

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
    // Pause autosave so a stale draft save can't land after the publish.
    controllerRef.current?.stop();
    setPublishStatus("pending");
    try {
      const result = await publish.mutateAsync(toPayload(snapshot));
      reconcile(snapshot, result);
      setPublishStatus("success");
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

  function bringToFront(key: string) {
    setElements((current) =>
      current ? bringElementToFront(current, key) : current,
    );
  }

  function removeElement(key: string) {
    setElements((current) =>
      current ? current.filter((element) => element.key !== key) : current,
    );
    markDirty();
  }

  function addElement(
    item: {
      type: ElementType;
      projectId?: string;
      textContent?: string;
      imageUrl?: string;
      imageCaption?: string;
      linkLabel?: string;
      linkUrl?: string;
    },
    dropX: number,
    dropY: number,
  ) {
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
          ...clamped,
          zIndex: maxZIndex(current) + 1,
        },
      ];
    });
    markDirty();
  }

  function patchElement(key: string, patch: Partial<EditorElement>) {
    setElements((current) =>
      current
        ? current.map((element) =>
            element.key === key ? { ...element, ...patch } : element,
          )
        : current,
    );
    markDirty();
  }

  // When the menu was opened from an element's "⋯" button, move focus onto
  // its first item so Tab reaches Edit/Delete instead of the rest of the
  // page. Right-click opens leave focus untouched (existing behavior).
  useEffect(() => {
    if (!contextMenu || !menuTriggerRef.current) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
  }, [contextMenu]);

  function openContextMenu(
    event: React.MouseEvent<HTMLElement>,
    element: EditorElement,
  ) {
    event.preventDefault();
    // Ignore right-clicks while a pointer-captured drag is in progress.
    if (dragRef.current) return;
    menuTriggerRef.current = null;
    setContextMenu({ key: element.key, x: event.clientX, y: event.clientY });
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
    setContextMenu({ key: element.key, x: rect.left, y: rect.bottom + 4 });
  }

  function dismissHintNow() {
    // Hide immediately; if the mutation fails we keep it hidden this session
    // (the server will simply show it again on a future visit).
    setHintHidden(true);
    dismissHint.mutate();
  }

  function handleEdit(element: EditorElement) {
    if (
      element.type === "ABOUT" ||
      element.type === "LINKS" ||
      element.type === "AVATAR" ||
      element.type === "NAME" ||
      element.type === "USERNAME" ||
      element.type === "CATEGORIES"
    ) {
      // Identity elements derive their content from the profile; Edit sends
      // the user to /profile/edit (displayName/avatarUrl live there; username
      // and categories aren't directly editable). The autosave controller's
      // unmount cleanup flushes pending changes.
      router.push("/profile/edit");
      return;
    }
    if (element.type === "PROJECT") {
      if (element.projectId) router.push(`/projects/${element.projectId}/edit`);
      return;
    }
    if (element.type === "TEXT") {
      setPanel({
        kind: "TEXT",
        editKey: element.key,
        initialHtml: element.textContent ?? "",
      });
      return;
    }
    if (element.type === "IMAGE") {
      setPanel({
        kind: "IMAGE",
        editKey: element.key,
        initialImageUrl: element.imageUrl ?? "",
        initialCaption: element.imageCaption ?? "",
      });
      return;
    }
    setPanel({
      kind: "LINK",
      editKey: element.key,
      initialLabel: element.linkLabel ?? "",
      initialUrl: element.linkUrl ?? "",
    });
  }

  function startDrag(
    event: React.PointerEvent<HTMLElement>,
    element: EditorElement,
    mode: "move" | "resize",
    corner: Corner | null = null,
  ) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
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
      moved: false,
    };
    // Pressing an element brings it to front immediately — even a plain
    // click with no drag — and the new stacking order must persist.
    bringToFront(element.key);
    markDirty();
  }

  function onDragPointerMove(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    const dx = Math.round(event.clientX - drag.startClientX);
    const dy = Math.round(event.clientY - drag.startClientY);
    if (dx === 0 && dy === 0) return;
    drag.moved = true;

    setElements((current) => {
      if (!current) return current;
      return current.map((element) => {
        if (element.key !== drag.key) return element;
        // resizeFromCorner clamps internally (min/max size + bounds), so
        // only the move branch needs an explicit clampElement pass.
        const next =
          drag.mode === "move"
            ? clampElement(
                {
                  x: drag.origin.x + dx,
                  y: drag.origin.y + dy,
                  width: drag.origin.width,
                  height: drag.origin.height,
                },
                boundsRef.current,
              )
            : resizeFromCorner(
                drag.origin,
                drag.corner ?? "bottom-right",
                dx,
                dy,
                boundsRef.current,
              );
        return { ...element, ...next };
      });
    });
  }

  function onDragPointerEnd(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.moved) {
      // Geometry changed; the pointerdown already brought it to front.
      markDirty();
    }
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

    let item: { type?: string; projectId?: string };
    try {
      item = JSON.parse(raw) as { type?: string; projectId?: string };
    } catch {
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

  if (editorState.isPending || elements === null) {
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
      <div className="border-line bg-surface mt-8 rounded-lg border p-6 md:hidden">
        <p className="text-ink font-medium">
          Arranging your canvas needs a larger screen.
        </p>
        <p className="text-muted mt-2 text-sm">
          Open this page on a tablet or desktop to drag and resize elements. You
          can still edit your About, Links, and project content here.
        </p>
        <Link
          href="/profile/edit"
          className="text-accent hover:text-accent-strong mt-4 inline-block text-sm font-semibold transition-colors"
        >
          Edit profile content →
        </Link>
      </div>

      <div className="hidden md:block">
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
              an element to bring it to the front, drag a corner to resize it,
              and use its ⋯ button (or right-click) to edit or delete it.
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
          Text/Image/Link elements (placed via the default position and
          clamping) even though arranging the canvas remains desktop-only. */}
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
                    ? { kind, editKey: null, initialHtml: "" }
                    : kind === "IMAGE"
                      ? {
                          kind,
                          editKey: null,
                          initialImageUrl: "",
                          initialCaption: "",
                        }
                      : {
                          kind,
                          editKey: null,
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

      {panel ? (
        <div className="border-line bg-surface mt-4 rounded-lg border p-4">
            {panel.kind === "STYLE" ? (
              (() => {
                const target = elements.find(
                  (item) => item.key === panel.editKey,
                );
                if (!target) return null;
                return (
                  <StylePanel
                    key={`style-${panel.editKey}`}
                    element={target}
                    onCancel={() => setPanel(null)}
                    onApply={(patch) => {
                      patchElement(panel.editKey, patch);
                    }}
                    onDone={() => setPanel(null)}
                  />
                );
              })()
            ) : panel.kind === "TEXT" ? (
              <TextPanel
                key={`text-${panel.editKey ?? "new"}`}
                heading={panel.editKey ? "Edit text" : "Add text"}
                initialHtml={panel.initialHtml}
                onCancel={() => setPanel(null)}
                onSave={(html) => {
                  if (panel.editKey) {
                    patchElement(panel.editKey, { textContent: html });
                  } else {
                    addElement({ type: "TEXT", textContent: html }, 24, 24);
                  }
                  setPanel(null);
                }}
              />
            ) : panel.kind === "IMAGE" ? (
              <ImagePanel
                key={`image-${panel.editKey ?? "new"}`}
                heading={panel.editKey ? "Edit image" : "Add image"}
                initialImageUrl={panel.initialImageUrl}
                initialCaption={panel.initialCaption}
                onCancel={() => setPanel(null)}
                onSave={(imageUrl, imageCaption) => {
                  if (panel.editKey) {
                    patchElement(panel.editKey, {
                      imageUrl,
                      imageCaption: imageCaption || null,
                    });
                  } else {
                    addElement(
                      {
                        type: "IMAGE",
                        imageUrl,
                        ...(imageCaption ? { imageCaption } : {}),
                      },
                      24,
                      24,
                    );
                  }
                  setPanel(null);
                }}
              />
            ) : (
              <LinkPanel
                key={`link-${panel.editKey ?? "new"}`}
                heading={panel.editKey ? "Edit link" : "Add link"}
                initialLabel={panel.initialLabel}
                initialUrl={panel.initialUrl}
                onCancel={() => setPanel(null)}
                onSave={(linkLabel, linkUrl) => {
                  if (panel.editKey) {
                    patchElement(panel.editKey, { linkLabel, linkUrl });
                  } else {
                    addElement({ type: "LINK", linkLabel, linkUrl }, 24, 24);
                  }
                  setPanel(null);
                }}
              />
            )}
          </div>
        ) : null}

      <div className="hidden md:block">
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
              onDragOver={onSurfaceDragOver}
              onDrop={onSurfaceDrop}
              className="relative"
              style={{ width: bounds.width, height: bounds.maxHeight }}
            >
              {elements.map((element) => (
                <div
                  key={element.key}
                  onPointerDown={(event) => startDrag(event, element, "move")}
                  onPointerMove={onDragPointerMove}
                  onPointerUp={onDragPointerEnd}
                  onPointerCancel={onDragPointerEnd}
                  onContextMenu={(event) => openContextMenu(event, element)}
                  className="group border-line-strong bg-surface absolute cursor-move touch-none overflow-hidden rounded-lg border"
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
                      bio={bio}
                      links={links}
                      projectsById={projectsById}
                      displayName={displayName}
                      username={username}
                      school={school}
                      avatarUrl={avatarUrl}
                      categories={categories}
                    />
                  </div>
                  {/* Visible entry point to the same Edit/Delete menu that
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
                    className="border-line-strong bg-surface/90 text-muted hover:text-ink absolute top-1 right-6 z-20 flex h-6 w-6 items-center justify-center rounded-md border text-sm leading-none opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 [@media(pointer:coarse)]:opacity-100"
                  >
                    ⋯
                  </button>
                  {RESIZE_HANDLES.map((handle) => (
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
                      className={`border-accent absolute z-10 h-4 w-4 touch-none ${handle.className}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

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
                  onClick={() => {
                    setContextMenu(null);
                    handleEdit(element);
                  }}
                  className="text-ink hover:bg-raised block w-full px-3 py-1.5 text-left text-sm transition-colors"
                >
                  Edit
                </button>
                {STYLEABLE_TYPE_SET.has(element.type) ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setContextMenu(null);
                      setPanel({ kind: "STYLE", editKey: element.key });
                    }}
                    className="text-ink hover:bg-raised block w-full px-3 py-1.5 text-left text-sm transition-colors"
                  >
                    Style
                  </button>
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
  return project ? (
    <ProjectCard project={project} />
  ) : (
    <p className="text-faint p-4 font-mono text-xs uppercase">
      Project unavailable
    </p>
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

const swatchClass =
  "h-8 w-8 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0";

// Per-element style editor: text color, background (color or transparent), and
// a curated font. AVATAR additionally gets frame shape and image zoom/position.
// Changes apply live via onApply so the canvas preview updates as you edit.
function StylePanel({
  element,
  onApply,
  onCancel,
  onDone,
}: {
  element: EditorElement;
  onApply: (patch: Partial<EditorElement>) => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const isAvatar = element.type === "AVATAR";
  return (
    <div>
      <h3 className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
        Style {elementLabels[element.type]}
      </h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <label className="text-ink flex items-center justify-between gap-3 text-sm font-medium">
          Text color
          <span className="flex items-center gap-2">
            <input
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
                element.backgroundColor && element.backgroundColor !== "transparent"
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
              onChange={(event) =>
                onApply({ avatarShape: event.target.value })
              }
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

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onDone}
          className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-4 py-2 text-sm font-semibold transition-colors"
        >
          Done
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted hover:text-ink text-sm font-medium transition-colors"
        >
          Close
        </button>
      </div>
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
    const body = new FormData();
    body.set("file", file);
    try {
      const response = await fetch("/api/upload", { method: "POST", body });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.url)
        throw new Error(result.error ?? "Upload failed.");
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
