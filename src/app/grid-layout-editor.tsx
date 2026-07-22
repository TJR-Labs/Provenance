"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { GridLayoutRenderer } from "~/app/grid-layout-renderer";
import { useUnsavedNavigationWarning } from "~/app/use-unsaved-navigation-warning";
import {
  AUTOSAVE_INTERVAL_MS,
  createAutosaveController,
} from "~/app/(protected)/profile/canvas/autosave";
import {
  findNextGridPosition,
  GRID_COLUMNS,
  GRID_MAX_BLOCKS,
  GRID_ROW_HEIGHT_PX,
  moveOrSwapGridBlock,
  reduceGridHistory,
  resizeGridBlock,
  validateGridBlocks,
  type GridBlock,
  type GridOperationResult,
} from "~/lib/grid-layout";
import type { GridEditorPayload, GridSaveResult } from "~/server/grid-layouts";
import { api } from "~/trpc/react";

type GridLayoutEditorProps =
  | { scope: "profile"; initial: GridEditorPayload }
  | { scope: "project"; projectId: string; initial: GridEditorPayload };

type BlockType = GridBlock["type"];
type PreviewMode = "desktop" | "mobile";
type PointerMode = "move" | "resize";

type OperationPreview = {
  valid: boolean;
  key: string;
  mode: PointerMode | "add";
  x: number;
  y: number;
  width: number;
  height: number;
  message: string;
  blocks: GridBlock[] | null;
};

type PointerInteraction = {
  mode: PointerMode;
  key: string;
  startX: number;
  startY: number;
  origin: GridBlock;
  blocks: GridBlock[];
};

const MINIMUM_SIZE: Record<BlockType, { width: number; height: number }> = {
  PROJECT: { width: 3, height: 2 },
  IMAGE: { width: 2, height: 2 },
  TEXT: { width: 2, height: 1 },
  LINK: { width: 2, height: 1 },
};

const PALETTE: Array<{ type: BlockType; label: string }> = [
  { type: "PROJECT", label: "Project" },
  { type: "IMAGE", label: "Image" },
  { type: "TEXT", label: "Text" },
  { type: "LINK", label: "Link" },
];

const SNAP_DISTANCE_PX = 8;
const DELETE_UNDO_MS = 5_000;

function blocksSignature(blocks: GridBlock[]) {
  return JSON.stringify(blocks);
}

function blockName(type: BlockType) {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

function textOrFallback(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value) return fallback;
  return value;
}

function newBlock(
  type: BlockType,
  key: string,
  order: number,
  x: number,
  y: number,
): GridBlock {
  const minimum = MINIMUM_SIZE[type];
  return {
    key,
    order,
    type,
    x,
    y,
    width: minimum.width,
    height: minimum.height,
    projectId: null,
    textContent: null,
    imageUrl: null,
    imageMimeType: null,
    imageAlt: null,
    linkLabel: null,
    linkUrl: null,
  };
}

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "The layout could not be saved. Try again.";
}

function isConflictError(error: unknown) {
  if (typeof error !== "object" || !error) return false;
  if (
    "data" in error &&
    typeof error.data === "object" &&
    error.data &&
    "code" in error.data &&
    error.data.code === "CONFLICT"
  ) {
    return true;
  }
  return errorText(error).toLowerCase().includes("another tab");
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function nearestEdge(raw: number, candidates: number[], pixelsPerCell: number) {
  let snapped = Math.round(raw);
  let closestDistance = SNAP_DISTANCE_PX + 1;
  for (const candidate of candidates) {
    const distance = Math.abs(raw - candidate) * pixelsPerCell;
    if (distance <= SNAP_DISTANCE_PX && distance < closestDistance) {
      snapped = candidate;
      closestDistance = distance;
    }
  }
  return Math.round(snapped);
}

function moveCoordinates(
  interaction: PointerInteraction,
  clientX: number,
  clientY: number,
  columnWidth: number,
) {
  const rawX =
    interaction.origin.x + (clientX - interaction.startX) / columnWidth;
  const rawY =
    interaction.origin.y + (clientY - interaction.startY) / GRID_ROW_HEIGHT_PX;
  const others = interaction.blocks.filter(
    (block) => block.key !== interaction.key,
  );
  const horizontalEdges = others.flatMap((block) => [
    block.x,
    block.x + block.width,
    block.x - interaction.origin.width,
    block.x + block.width - interaction.origin.width,
  ]);
  const verticalEdges = others.flatMap((block) => [
    block.y,
    block.y + block.height,
    block.y - interaction.origin.height,
    block.y + block.height - interaction.origin.height,
  ]);
  return {
    x: nearestEdge(rawX, horizontalEdges, columnWidth),
    y: nearestEdge(rawY, verticalEdges, GRID_ROW_HEIGHT_PX),
  };
}

function resizeDimensions(
  interaction: PointerInteraction,
  clientX: number,
  clientY: number,
  columnWidth: number,
) {
  const rawRight =
    interaction.origin.x +
    interaction.origin.width +
    (clientX - interaction.startX) / columnWidth;
  const rawBottom =
    interaction.origin.y +
    interaction.origin.height +
    (clientY - interaction.startY) / GRID_ROW_HEIGHT_PX;
  const others = interaction.blocks.filter(
    (block) => block.key !== interaction.key,
  );
  const right = nearestEdge(
    rawRight,
    others.flatMap((block) => [block.x, block.x + block.width]),
    columnWidth,
  );
  const bottom = nearestEdge(
    rawBottom,
    others.flatMap((block) => [block.y, block.y + block.height]),
    GRID_ROW_HEIGHT_PX,
  );
  return {
    width: right - interaction.origin.x,
    height: bottom - interaction.origin.y,
  };
}

function operationPreview(
  interaction: PointerInteraction,
  result: GridOperationResult,
  candidate: Pick<GridBlock, "x" | "y" | "width" | "height">,
): OperationPreview {
  const resultBlock = result.valid
    ? result.blocks.find((block) => block.key === interaction.key)
    : undefined;
  return {
    valid: result.valid,
    key: interaction.key,
    mode: interaction.mode,
    x: resultBlock?.x ?? candidate.x,
    y: resultBlock?.y ?? candidate.y,
    width: resultBlock?.width ?? candidate.width,
    height: resultBlock?.height ?? candidate.height,
    message: result.valid
      ? `Valid ${interaction.mode} preview.`
      : result.message,
    blocks: result.valid ? result.blocks : null,
  };
}

function Inspector({
  block,
  projects,
  update,
  remove,
}: {
  block: GridBlock | undefined;
  projects: GridEditorPayload["projects"];
  update: (block: GridBlock) => void;
  remove: () => void;
}) {
  return (
    <aside className="border-line bg-surface rounded-lg border p-5">
      <h2 className="font-display text-ink text-xl font-semibold">Inspector</h2>
      {!block ? (
        <p className="text-muted mt-3 text-sm">Select a block to inspect it.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="text-faint font-mono text-xs tracking-wider uppercase">
            {blockName(block.type)} block
          </p>
          <p className="text-muted text-xs">
            Column {block.x + 1}, row {block.y + 1}; {block.width} by{" "}
            {block.height} cells
          </p>

          {block.type === "TEXT" ? (
            <label className="text-ink block text-sm font-medium">
              Plain text
              <textarea
                aria-label="Plain text"
                value={block.textContent ?? ""}
                onChange={(event) =>
                  update({ ...block, textContent: event.currentTarget.value })
                }
                rows={7}
                className="border-line bg-raised text-ink mt-2 w-full rounded-md border p-3 font-normal"
              />
            </label>
          ) : null}

          {block.type === "PROJECT" ? (
            <label className="text-ink block text-sm font-medium">
              Owned project
              <select
                aria-label="Owned project"
                value={block.projectId ?? ""}
                onChange={(event) =>
                  update({
                    ...block,
                    projectId: event.currentTarget.value || null,
                  })
                }
                className="border-line bg-raised text-ink mt-2 w-full rounded-md border p-3 font-normal"
              >
                <option value="">No project selected</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                    {project.private ? " (private)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {block.type === "IMAGE" ? (
            block.imageUrl ? (
              <div className="space-y-2 text-sm">
                <p className="text-ink font-semibold">
                  Imported image details (read-only)
                </p>
                <p className="text-muted break-all">{block.imageUrl}</p>
                {block.imageMimeType ? (
                  <p className="text-muted">{block.imageMimeType}</p>
                ) : null}
                {block.imageAlt ? (
                  <p className="text-muted">Alt: {block.imageAlt}</p>
                ) : null}
              </div>
            ) : (
              <div className="text-sm">
                <p className="text-ink font-semibold">Empty image shell</p>
                <p className="text-muted mt-2">
                  Image content controls are not included in this release.
                </p>
              </div>
            )
          ) : null}

          {block.type === "LINK" ? (
            block.linkUrl ? (
              <div className="space-y-2 text-sm">
                <p className="text-ink font-semibold">
                  Imported link details (read-only)
                </p>
                {block.linkLabel ? (
                  <p className="text-muted">{block.linkLabel}</p>
                ) : null}
                <p className="text-muted break-all">{block.linkUrl}</p>
              </div>
            ) : (
              <div className="text-sm">
                <p className="text-ink font-semibold">Empty link shell</p>
                <p className="text-muted mt-2">
                  Link content controls are not included in this release.
                </p>
              </div>
            )
          ) : null}

          <button
            type="button"
            onClick={remove}
            aria-label="Delete block"
            className="border-danger text-danger hover:bg-danger/10 w-full rounded-md border px-3 py-2 text-sm font-semibold"
          >
            Delete block
          </button>
        </div>
      )}
    </aside>
  );
}

export function GridLayoutEditor(
  props: GridLayoutEditorProps,
): React.ReactNode {
  const saveProfileDraft = api.grid.saveProfileDraft.useMutation();
  const publishProfile = api.grid.publishProfile.useMutation();
  const publishProject = api.grid.publishProject.useMutation();
  const [history, dispatch] = useReducer(reduceGridHistory, {
    past: [],
    present: props.initial.blocks,
    future: [],
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<OperationPreview | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode | null>(null);
  const [placementStatus, setPlacementStatus] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deletedNotice, setDeletedNotice] = useState(false);
  const [autosaveGeneration, setAutosaveGeneration] = useState(0);

  const gridRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef(history.present);
  const revisionRef = useRef(props.initial.revision);
  const savedSignatureRef = useRef(blocksSignature(props.initial.blocks));
  const pointerRef = useRef<PointerInteraction | null>(null);
  const previewRef = useRef<OperationPreview | null>(null);
  const paletteDragRef = useRef<BlockType | null>(null);
  const autosaveRef = useRef<ReturnType<
    typeof createAutosaveController
  > | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextOrderRef = useRef(
    props.initial.blocks.reduce(
      (maximum, block) => Math.max(maximum, block.order + 1),
      0,
    ),
  );

  blocksRef.current = history.present;
  previewRef.current = preview;

  const saveProfileDraftRef = useRef(saveProfileDraft.mutateAsync);
  const publishProfileRef = useRef(publishProfile.mutateAsync);
  const publishProjectRef = useRef(publishProject.mutateAsync);
  saveProfileDraftRef.current = saveProfileDraft.mutateAsync;
  publishProfileRef.current = publishProfile.mutateAsync;
  publishProjectRef.current = publishProject.mutateAsync;

  const atLimit = history.present.length >= GRID_MAX_BLOCKS;
  const selected = history.present.find((block) => block.key === selectedKey);

  const markSuccessfulSave = useCallback(
    (snapshot: GridBlock[], result: GridSaveResult) => {
      revisionRef.current = result.revision;
      savedSignatureRef.current = blocksSignature(snapshot);
      const stillDirty =
        blocksSignature(blocksRef.current) !== savedSignatureRef.current;
      setDirty(stillDirty);
      setSaveError(null);
      setSaveStatus("Layout saved.");
      if (stillDirty && props.scope === "profile") {
        autosaveRef.current?.notifyChange();
      }
    },
    [props.scope],
  );

  const failSave = useCallback((error: unknown) => {
    if (isConflictError(error)) {
      setConflict(true);
      setSaveError(
        "This layout changed in another tab. Reload or reopen the editor before saving again.",
      );
    } else {
      setSaveError(errorText(error));
    }
    setSaveStatus(null);
    setDirty(true);
  }, []);

  const runProfileDraftSave = useCallback(
    async (immediate = false) => {
      if (props.scope !== "profile" || conflict) return false;
      const snapshot = blocksRef.current;
      setSaving(true);
      try {
        const result = await saveProfileDraftRef.current({
          expectedRevision: revisionRef.current,
          blocks: snapshot,
        });
        markSuccessfulSave(snapshot, result);
        if (immediate) setAutosaveGeneration((value) => value + 1);
        return true;
      } catch (error) {
        failSave(error);
        if (!isConflictError(error)) autosaveRef.current?.notifyChange();
        return false;
      } finally {
        setSaving(false);
      }
    },
    [conflict, failSave, markSuccessfulSave, props.scope],
  );

  const runPublish = useCallback(async () => {
    if (conflict) return;
    const snapshot = blocksRef.current;
    setSaving(true);
    try {
      const result =
        props.scope === "profile"
          ? await publishProfileRef.current({
              expectedRevision: revisionRef.current,
              blocks: snapshot,
            })
          : await publishProjectRef.current({
              projectId: props.projectId,
              expectedRevision: revisionRef.current,
              blocks: snapshot,
            });
      markSuccessfulSave(snapshot, result);
      setSaveStatus(
        props.scope === "profile" ? "Layout published." : "Layout published.",
      );
      if (props.scope === "profile") {
        setAutosaveGeneration((value) => value + 1);
      }
    } catch (error) {
      failSave(error);
    } finally {
      setSaving(false);
    }
  }, [conflict, failSave, markSuccessfulSave, props]);

  useEffect(() => {
    if (props.scope !== "profile" || conflict) return;
    const controller = createAutosaveController({
      intervalMs: AUTOSAVE_INTERVAL_MS,
      save: async () => {
        const succeeded = await runProfileDraftSave();
        if (!succeeded && !conflict) controller.notifyChange();
      },
    });
    autosaveRef.current = controller;
    return () => {
      controller.stop();
      if (autosaveRef.current === controller) autosaveRef.current = null;
    };
  }, [autosaveGeneration, conflict, props.scope, runProfileDraftSave]);

  useEffect(() => {
    const changed =
      blocksSignature(history.present) !== savedSignatureRef.current;
    setDirty(changed);
    if (changed && props.scope === "profile" && !conflict) {
      autosaveRef.current?.notifyChange();
    }
  }, [conflict, history.present, props.scope]);

  useEffect(() => {
    if (selectedKey && !selected) setSelectedKey(null);
  }, [selected, selectedKey]);

  useEffect(
    () => () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    },
    [],
  );

  useUnsavedNavigationWarning(dirty);

  const uniqueKey = useCallback((type: BlockType) => {
    let key = "";
    do {
      key = `grid-${type.toLowerCase()}-${nextOrderRef.current}`;
      nextOrderRef.current += 1;
    } while (blocksRef.current.some((block) => block.key === key));
    return key;
  }, []);

  const addAt = useCallback(
    (type: BlockType, x: number, y: number, explicit: boolean) => {
      if (blocksRef.current.length >= GRID_MAX_BLOCKS) {
        setPlacementStatus(`The ${GRID_MAX_BLOCKS}-block limit is reached.`);
        return false;
      }
      const order = nextOrderRef.current;
      const candidate = newBlock(type, uniqueKey(type), order, x, y);
      const blocks = [...blocksRef.current, candidate];
      const errors = validateGridBlocks(blocks);
      if (errors.length > 0) {
        setPlacementStatus(
          explicit
            ? `Block not added: ${errors[0]}`
            : "No placement is available.",
        );
        return false;
      }
      dispatch({ type: "commit", blocks });
      setSelectedKey(candidate.key);
      setPlacementStatus(`${blockName(type)} block added.`);
      setPreview(null);
      return true;
    },
    [uniqueKey],
  );

  const clickAdd = useCallback(
    (type: BlockType) => {
      const position = findNextGridPosition(blocksRef.current, type);
      if (!position) {
        setPlacementStatus(`The ${GRID_MAX_BLOCKS}-block limit is reached.`);
        return;
      }
      addAt(type, position.x, position.y, false);
    },
    [addAt],
  );

  const paletteCell = useCallback((clientX: number, clientY: number) => {
    const rectangle = gridRef.current?.getBoundingClientRect();
    if (!rectangle || rectangle.width <= 0) return null;
    return {
      x: Math.floor(
        (clientX - rectangle.left) / (rectangle.width / GRID_COLUMNS),
      ),
      y: Math.floor((clientY - rectangle.top) / GRID_ROW_HEIGHT_PX),
    };
  }, []);

  const dragPreview = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const type = paletteDragRef.current;
      if (!type || atLimit) return;
      event.preventDefault();
      const cell = paletteCell(event.clientX, event.clientY);
      if (!cell) return;
      const candidate = newBlock(
        type,
        "palette-preview",
        nextOrderRef.current,
        cell.x,
        cell.y,
      );
      const blocks = [...blocksRef.current, candidate];
      const errors = validateGridBlocks(blocks);
      setPreview({
        valid: errors.length === 0,
        key: candidate.key,
        mode: "add",
        x: candidate.x,
        y: candidate.y,
        width: candidate.width,
        height: candidate.height,
        message: errors.length === 0 ? "Valid add preview." : errors[0]!,
        blocks: errors.length === 0 ? blocks : null,
      });
    },
    [atLimit, paletteCell],
  );

  const dropPalette = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const type = paletteDragRef.current;
      const cell = paletteCell(event.clientX, event.clientY);
      if (type && cell) addAt(type, cell.x, cell.y, true);
      paletteDragRef.current = null;
      setPreview(null);
    },
    [addAt, paletteCell],
  );

  const beginPointer = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      mode: PointerMode,
      block: GridBlock,
    ) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      setSelectedKey(block.key);
      pointerRef.current = {
        mode,
        key: block.key,
        startX: event.clientX,
        startY: event.clientY,
        origin: block,
        blocks: blocksRef.current,
      };
      if ("setPointerCapture" in event.currentTarget) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is optional in test DOMs and older browsers.
        }
      }
    },
    [],
  );

  useEffect(() => {
    const pointerMove = (event: PointerEvent) => {
      const interaction = pointerRef.current;
      const rectangle = gridRef.current?.getBoundingClientRect();
      if (!interaction || !rectangle || rectangle.width <= 0) return;
      const columnWidth = rectangle.width / GRID_COLUMNS;
      if (interaction.mode === "move") {
        const cell = moveCoordinates(
          interaction,
          event.clientX,
          event.clientY,
          columnWidth,
        );
        const result = moveOrSwapGridBlock(
          interaction.blocks,
          interaction.key,
          cell.x,
          cell.y,
        );
        setPreview(
          operationPreview(interaction, result, {
            ...interaction.origin,
            ...cell,
          }),
        );
      } else {
        const size = resizeDimensions(
          interaction,
          event.clientX,
          event.clientY,
          columnWidth,
        );
        const result = resizeGridBlock(
          interaction.blocks,
          interaction.key,
          size.width,
          size.height,
        );
        setPreview(
          operationPreview(interaction, result, {
            ...interaction.origin,
            ...size,
          }),
        );
      }
    };

    const finishPointer = () => {
      if (!pointerRef.current) return;
      const pending = previewRef.current;
      if (pending?.valid && pending.blocks) {
        if (
          blocksSignature(pending.blocks) !== blocksSignature(blocksRef.current)
        ) {
          dispatch({ type: "commit", blocks: pending.blocks });
        }
        setPlacementStatus(
          pending.mode === "resize" ? "Block resized." : "Block moved.",
        );
      } else if (pending) {
        setPlacementStatus(pending.message);
      }
      pointerRef.current = null;
      setPreview(null);
    };

    const cancelPointer = () => {
      if (!pointerRef.current) return;
      pointerRef.current = null;
      setPreview(null);
      setPlacementStatus(
        "Operation cancelled; the previous layout was restored.",
      );
    };

    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", finishPointer);
    window.addEventListener("pointercancel", cancelPointer);
    return () => {
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", finishPointer);
      window.removeEventListener("pointercancel", cancelPointer);
    };
  }, []);

  const updateContent = useCallback((next: GridBlock) => {
    dispatch({
      type: "content",
      blocks: blocksRef.current.map((block) =>
        block.key === next.key ? next : block,
      ),
    });
  }, []);

  const removeSelected = useCallback(() => {
    if (!selectedKey) return;
    const blocks = blocksRef.current.filter(
      (block) => block.key !== selectedKey,
    );
    if (blocks.length === blocksRef.current.length) return;
    dispatch({ type: "commit", blocks });
    setSelectedKey(null);
    setDeletedNotice(true);
    setPlacementStatus("Block deleted.");
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = setTimeout(
      () => setDeletedNotice(false),
      DELETE_UNDO_MS,
    );
  }, [selectedKey]);

  const undo = useCallback(() => {
    dispatch({ type: "undo" });
    setDeletedNotice(false);
    setPlacementStatus("Layout change undone.");
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: "redo" });
    setPlacementStatus("Layout change redone.");
  }, []);

  const keyboardGeometry = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (
        isTypingTarget(event.target) ||
        !selectedKey ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        return;
      }
      const block = blocksRef.current.find((item) => item.key === selectedKey);
      if (!block) return;
      event.preventDefault();
      const horizontal =
        event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      const vertical =
        event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      const result = event.shiftKey
        ? resizeGridBlock(
            blocksRef.current,
            block.key,
            block.width + horizontal,
            block.height + vertical,
          )
        : moveOrSwapGridBlock(
            blocksRef.current,
            block.key,
            block.x + horizontal,
            block.y + vertical,
          );
      if (result.valid) {
        dispatch({ type: "commit", blocks: result.blocks });
        setPlacementStatus(
          event.shiftKey
            ? "Block resized by one cell."
            : "Block moved by one cell.",
        );
      } else {
        setPlacementStatus(result.message);
      }
    },
    [selectedKey],
  );

  const gridHeight = useMemo(
    () =>
      Math.max(
        4,
        ...history.present.map((block) => block.y + block.height),
        preview ? preview.y + preview.height : 0,
      ) * GRID_ROW_HEIGHT_PX,
    [history.present, preview],
  );

  const desktopEditor = (
    <section
      data-testid="grid-desktop-editor"
      onKeyDown={keyboardGeometry}
      className="mt-8 hidden space-y-6 lg:block"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-ink text-2xl font-semibold">
            Grid layout editor
          </h1>
          <p className="text-muted mt-2 text-sm">
            {props.scope === "profile"
              ? "Your private draft autosaves every 30 seconds. Publish when it is ready."
              : "Project changes stay in this browser until Save & Publish."}
          </p>
          <p className="text-muted mt-1 text-sm">
            {dirty ? "Unsaved changes" : (saveStatus ?? "All changes saved")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-label="Undo layout change"
            disabled={history.past.length === 0}
            onClick={undo}
            className="border-line-strong rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          >
            Undo
          </button>
          <button
            type="button"
            aria-label="Redo layout change"
            disabled={history.future.length === 0}
            onClick={redo}
            className="border-line-strong rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          >
            Redo
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode("desktop")}
            className="border-line-strong rounded-md border px-3 py-2 text-sm"
          >
            Preview layout
          </button>
          {props.scope === "profile" ? (
            <>
              <button
                type="button"
                onClick={() => void runProfileDraftSave(true)}
                disabled={saving || conflict}
                className="border-line-strong rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => void runPublish()}
                disabled={saving || conflict}
                className="bg-accent text-on-accent rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Publish
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void runPublish()}
              disabled={saving || conflict}
              className="bg-accent text-on-accent rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Save &amp; Publish
            </button>
          )}
        </div>
      </header>

      {saveError ? (
        <p
          role="alert"
          className="border-danger text-danger rounded-md border p-3 text-sm"
        >
          {saveError}
        </p>
      ) : null}

      <div className="border-line bg-raised rounded-lg border p-4">
        <div className="flex flex-wrap gap-3" aria-label="Block palette">
          {PALETTE.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              draggable={!atLimit}
              disabled={atLimit}
              aria-label={`Add ${label.toLowerCase()} block`}
              title={
                atLimit ? `${GRID_MAX_BLOCKS}-block limit reached` : undefined
              }
              onClick={() => clickAdd(type)}
              onDragStart={(event) => {
                paletteDragRef.current = type;
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData(
                  "application/x-provenance-grid-block",
                  type,
                );
              }}
              onDragEnd={() => {
                paletteDragRef.current = null;
                setPreview(null);
              }}
              className="border-line-strong bg-surface rounded-md border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add {label}
            </button>
          ))}
        </div>
        {atLimit ? (
          <p role="status" className="text-muted mt-3 text-sm">
            {GRID_MAX_BLOCKS}-block limit reached. Remove a block before adding
            another.
          </p>
        ) : (
          <p className="text-muted mt-3 text-xs">
            Click to place in the first open cells, or drag a type to an exact
            grid position.
          </p>
        )}
      </div>

      <p
        id="placement-status"
        data-testid="placement-status"
        aria-live="polite"
        className="text-muted min-h-5 text-sm"
      >
        {placementStatus}
      </p>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div
          ref={gridRef}
          data-testid="grid-editor-surface"
          onDragOver={dragPreview}
          onDrop={dropPalette}
          className="border-line bg-surface relative grid min-w-0 gap-1 rounded-lg border p-1"
          style={{
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
            gridAutoRows: `${GRID_ROW_HEIGHT_PX}px`,
            minHeight: `${gridHeight}px`,
          }}
        >
          {history.present.map((block) => {
            const name = blockName(block.type);
            const projectTitle =
              block.type === "PROJECT"
                ? props.initial.projects.find(
                    (project) => project.id === block.projectId,
                  )?.title
                : null;
            return (
              <div
                key={block.key}
                role="button"
                tabIndex={0}
                aria-label={`Select ${name.toLowerCase()} block ${block.key}`}
                aria-pressed={selectedKey === block.key}
                onClick={() => setSelectedKey(block.key)}
                onPointerDown={(event) => beginPointer(event, "move", block)}
                className={`border-line-strong bg-raised relative min-w-0 overflow-hidden rounded-md border p-3 text-left ${
                  selectedKey === block.key ? "ring-accent ring-2" : ""
                }`}
                style={{
                  gridColumn: `${block.x + 1} / span ${block.width}`,
                  gridRow: `${block.y + 1} / span ${block.height}`,
                }}
              >
                <span className="font-mono text-xs font-semibold tracking-wider uppercase">
                  {name}
                </span>
                <span className="text-muted mt-2 block truncate text-xs">
                  {block.type === "TEXT"
                    ? textOrFallback(block.textContent, "Empty text shell")
                    : block.type === "PROJECT"
                      ? textOrFallback(projectTitle, "No project selected")
                      : block.type === "IMAGE"
                        ? textOrFallback(block.imageUrl, "Empty image shell")
                        : textOrFallback(
                            block.linkLabel,
                            textOrFallback(block.linkUrl, "Empty link shell"),
                          )}
                </span>
                <button
                  type="button"
                  aria-label={`Resize ${name.toLowerCase()} block ${block.key}`}
                  onPointerDown={(event) =>
                    beginPointer(event, "resize", block)
                  }
                  className="border-line-strong bg-surface absolute right-1 bottom-1 h-6 w-6 rounded border text-xs"
                >
                  ↘
                </button>
              </div>
            );
          })}

          {preview ? (
            <div
              data-testid="grid-operation-preview"
              aria-label={
                preview.valid
                  ? "Valid placement preview"
                  : "Invalid placement preview"
              }
              aria-live="polite"
              className={`pointer-events-none z-10 rounded-md border-2 border-dashed p-2 text-xs font-semibold ${
                preview.valid
                  ? "border-success bg-success/10"
                  : "border-danger bg-danger/10"
              }`}
              style={{
                gridColumn: `${preview.x + 1} / span ${preview.width}`,
                gridRow: `${preview.y + 1} / span ${preview.height}`,
              }}
            >
              {preview.message}
            </div>
          ) : null}
        </div>

        <Inspector
          block={selected}
          projects={props.initial.projects}
          update={updateContent}
          remove={removeSelected}
        />
      </div>

      {deletedNotice ? (
        <div className="border-line-strong bg-surface fixed right-5 bottom-5 z-40 flex items-center gap-4 rounded-md border p-4 shadow-lg">
          <span>Block deleted.</span>
          <button
            type="button"
            aria-label="Undo deletion"
            onClick={undo}
            className="text-accent font-semibold"
          >
            Undo
          </button>
        </div>
      ) : null}

      {previewMode ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Layout preview"
          className="bg-canvas fixed inset-0 z-50 overflow-auto p-6"
        >
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2" aria-label="Preview size">
                <button
                  type="button"
                  aria-pressed={previewMode === "desktop"}
                  onClick={() => setPreviewMode("desktop")}
                  className="border-line-strong rounded-md border px-3 py-2"
                >
                  Desktop preview
                </button>
                <button
                  type="button"
                  aria-pressed={previewMode === "mobile"}
                  onClick={() => setPreviewMode("mobile")}
                  className="border-line-strong rounded-md border px-3 py-2"
                >
                  Mobile preview
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPreviewMode(null)}
                className="border-line-strong rounded-md border px-3 py-2 font-semibold"
              >
                Close preview
              </button>
            </div>
            <div className={previewMode === "mobile" ? "mx-auto max-w-sm" : ""}>
              <GridLayoutRenderer
                blocks={history.present}
                projects={props.initial.projects}
                mode={previewMode}
                ownerView
                showEmpty
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );

  return (
    <>
      <section
        data-testid="grid-mobile-editor-notice"
        className="border-line bg-raised mt-8 rounded-lg border p-5 lg:hidden"
      >
        <h1 className="font-display text-ink text-2xl font-semibold">
          Grid layout editor
        </h1>
        <p className="text-muted mt-2 text-sm">
          To edit this layout, use a desktop browser.
        </p>
      </section>

      {desktopEditor}
    </>
  );
}
