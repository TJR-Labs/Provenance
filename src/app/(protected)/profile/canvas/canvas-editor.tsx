"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";

import { ProjectCard } from "~/app/project-card";
import {
  CANVAS_MAX_HEIGHT,
  CANVAS_MIN_HEIGHT,
  CANVAS_MIN_WIDTH,
  CANVAS_WIDTH,
} from "~/lib/canvas-constants";
import { api } from "~/trpc/react";
import { AUTOSAVE_INTERVAL_MS, createAutosaveController } from "./autosave";
import {
  clampElement,
  DEFAULT_ELEMENT_SIZE,
  type CanvasBounds,
} from "./canvas-math";

type EditorProject = ComponentProps<typeof ProjectCard>["project"];
type ProfileLink = { label: string; url: string };
type ElementType = "ABOUT" | "LINKS" | "PROJECT";

type EditorElement = {
  key: string;
  type: ElementType;
  projectId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

type ElementPayload = {
  type: ElementType;
  projectId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

type DragState = {
  key: string;
  mode: "move" | "resize";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  origin: { x: number; y: number; width: number; height: number };
  moved: boolean;
};

type CanvasEditorProps = {
  bio: string | null;
  links: ProfileLink[];
  projects: EditorProject[];
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
};

function toPayload(elements: EditorElement[]): ElementPayload[] {
  return elements.map((element) => ({
    type: element.type,
    ...(element.type === "PROJECT" && element.projectId
      ? { projectId: element.projectId }
      : {}),
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    zIndex: element.zIndex,
  }));
}

function maxZIndex(elements: EditorElement[]) {
  return elements.reduce((max, element) => Math.max(max, element.zIndex), 0);
}

export function CanvasEditor({ bio, links, projects }: CanvasEditorProps) {
  const editorState = api.canvas.getEditorState.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const saveDraft = api.canvas.saveDraft.useMutation();
  const publish = api.canvas.publish.useMutation();

  // Local in-editor state is the source of truth once loaded; the server is
  // only consulted for the initial snapshot and for clamp reconciliation.
  const [elements, setElements] = useState<EditorElement[] | null>(null);
  const [publishStatus, setPublishStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");

  const elementsRef = useRef<EditorElement[] | null>(null);
  elementsRef.current = elements;
  const saveDraftRef = useRef(saveDraft.mutateAsync);
  saveDraftRef.current = saveDraft.mutateAsync;
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const keyCounter = useRef(0);

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
    setElements((current) => {
      if (!current) return current;
      const nextZ = maxZIndex(current) + 1;
      return current.map((element) =>
        element.key === key ? { ...element, zIndex: nextZ } : element,
      );
    });
  }

  function removeElement(key: string) {
    setElements((current) =>
      current ? current.filter((element) => element.key !== key) : current,
    );
    markDirty();
  }

  function addElement(
    item: { type: ElementType; projectId?: string },
    dropX: number,
    dropY: number,
  ) {
    setElements((current) => {
      if (!current) return current;
      const alreadyPlaced =
        item.type === "PROJECT"
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
          ...clamped,
          zIndex: maxZIndex(current) + 1,
        },
      ];
    });
    markDirty();
  }

  function startDrag(
    event: React.PointerEvent<HTMLElement>,
    element: EditorElement,
    mode: "move" | "resize",
  ) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      key: element.key,
      mode,
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
  }

  function onDragPointerMove(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    if (dx === 0 && dy === 0) return;
    drag.moved = true;

    setElements((current) => {
      if (!current) return current;
      return current.map((element) => {
        if (element.key !== drag.key) return element;
        const next =
          drag.mode === "move"
            ? {
                x: Math.round(drag.origin.x + dx),
                y: Math.round(drag.origin.y + dy),
                width: drag.origin.width,
                height: drag.origin.height,
              }
            : {
                x: drag.origin.x,
                y: drag.origin.y,
                width: Math.round(drag.origin.width + dx),
                height: Math.round(drag.origin.height + dy),
              };
        return { ...element, ...clampElement(next, boundsRef.current) };
      });
    });
  }

  function onDragPointerEnd(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.moved) {
      // Most recently moved/resized element comes to the front.
      bringToFront(drag.key);
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
    if (
      item.type !== "ABOUT" &&
      item.type !== "LINKS" &&
      item.type !== "PROJECT"
    ) {
      return;
    }

    const rect = surface.getBoundingClientRect();
    const size = DEFAULT_ELEMENT_SIZE[item.type];
    addElement(
      { type: item.type, projectId: item.projectId },
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
          href="/profile/edit"
          className="text-accent hover:text-accent-strong font-semibold transition-colors"
        >
          Switch to canvas mode
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
          <p
            className={`text-sm ${saveDraft.isError ? "text-danger" : "text-muted"}`}
          >
            {autosaveStatus}
          </p>
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
              {library.length === 2 ? (
                <li className="text-faint px-1 py-2 text-xs">
                  No projects yet — new projects appear here as unplaced.
                </li>
              ) : null}
            </ul>
          </aside>

          <div className="border-line bg-canvas relative min-w-0 flex-1 overflow-auto rounded-lg border">
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
                  className="border-line-strong bg-surface absolute cursor-move touch-none overflow-hidden rounded-lg border"
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
                  <div className="pointer-events-none h-full w-full overflow-hidden select-none">
                    <ElementContent
                      element={element}
                      bio={bio}
                      links={links}
                      projectsById={projectsById}
                    />
                  </div>
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => removeElement(element.key)}
                    className="text-danger bg-raised/90 absolute top-1.5 right-1.5 z-10 rounded px-2 py-0.5 text-xs font-medium underline-offset-4 hover:underline"
                  >
                    Remove
                  </button>
                  <div
                    role="presentation"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      startDrag(event, element, "resize");
                    }}
                    onPointerMove={onDragPointerMove}
                    onPointerUp={onDragPointerEnd}
                    onPointerCancel={onDragPointerEnd}
                    className="border-accent absolute right-0 bottom-0 z-10 h-4 w-4 cursor-se-resize touch-none rounded-tl border-t-2 border-l-2"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ElementContent({
  element,
  bio,
  links,
  projectsById,
}: {
  element: EditorElement;
  bio: string | null;
  links: ProfileLink[];
  projectsById: Map<string, EditorProject>;
}) {
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
