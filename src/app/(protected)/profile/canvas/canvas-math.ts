export type CanvasBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasBounds = {
  width: number;
  maxHeight: number;
  minWidth: number;
  minHeight: number;
};

export const DEFAULT_ELEMENT_SIZE: Record<
  "ABOUT" | "LINKS" | "PROJECT" | "TEXT" | "IMAGE" | "LINK",
  { width: number; height: number }
> = {
  ABOUT: { width: 400, height: 240 },
  LINKS: { width: 400, height: 160 },
  PROJECT: { width: 320, height: 240 },
  TEXT: { width: 320, height: 160 },
  IMAGE: { width: 320, height: 240 },
  LINK: { width: 280, height: 72 },
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(value, maximum));
}

/**
 * Same clamping semantics as the server (src/server/canvas.ts): floor the
 * size to the minimums, cap it to the canvas, then keep the box fully
 * inside `[0, width] x [0, maxHeight]`.
 */
export function clampElement(box: CanvasBox, bounds: CanvasBounds): CanvasBox {
  const width = clamp(box.width, bounds.minWidth, bounds.width);
  const height = clamp(box.height, bounds.minHeight, bounds.maxHeight);

  return {
    width,
    height,
    x: clamp(box.x, 0, bounds.width - width),
    y: clamp(box.y, 0, bounds.maxHeight - height),
  };
}

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Resize `origin` by dragging one of its corners by (dx, dy), keeping the
 * opposite corner anchored in place. The raw size may go negative when the
 * pointer crosses the anchor; the min-size floor prevents the box from
 * inverting or collapsing. Ends with the same `clampElement` bounds pass
 * used everywhere else, so the result is always fully inside the canvas.
 */
export function resizeFromCorner(
  origin: CanvasBox,
  corner: Corner,
  dx: number,
  dy: number,
  bounds: CanvasBounds,
): CanvasBox {
  const draggingLeft = corner === "top-left" || corner === "bottom-left";
  const draggingTop = corner === "top-left" || corner === "top-right";

  // Fixed anchor: the corner opposite the one being dragged.
  const anchorX = draggingLeft ? origin.x + origin.width : origin.x;
  const anchorY = draggingTop ? origin.y + origin.height : origin.y;

  // Moving point: the dragged corner, displaced by the pointer delta.
  const movingX = (draggingLeft ? origin.x : origin.x + origin.width) + dx;
  const movingY = (draggingTop ? origin.y : origin.y + origin.height) + dy;

  const width = clamp(
    draggingLeft ? anchorX - movingX : movingX - anchorX,
    bounds.minWidth,
    bounds.width,
  );
  const height = clamp(
    draggingTop ? anchorY - movingY : movingY - anchorY,
    bounds.minHeight,
    bounds.maxHeight,
  );

  return clampElement(
    {
      width,
      height,
      // Position so the anchor corner stays fixed.
      x: draggingLeft ? anchorX - width : anchorX,
      y: draggingTop ? anchorY - height : anchorY,
    },
    bounds,
  );
}

/**
 * Raise `key`'s element above every other element's zIndex. Used for both a
 * completed drag/resize and a plain pointerdown with no movement — pressing
 * an element always brings it to front immediately.
 */
export function bringElementToFront<T extends { key: string; zIndex: number }>(
  elements: readonly T[],
  key: string,
): T[] {
  const nextZ = elements.reduce((max, element) => Math.max(max, element.zIndex), 0) + 1;
  return elements.map((element) =>
    element.key === key ? { ...element, zIndex: nextZ } : element,
  );
}

/**
 * Order elements for the linear mobile fallback: top-to-bottom by y,
 * left-to-right by x as the tiebreaker. Does not mutate the input.
 */
export function sortForMobile<T extends { x: number; y: number }>(
  elements: readonly T[],
): T[] {
  return [...elements].sort((a, b) => a.y - b.y || a.x - b.x);
}
