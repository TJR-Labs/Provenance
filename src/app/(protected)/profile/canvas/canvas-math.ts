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
  "ABOUT" | "LINKS" | "PROJECT",
  { width: number; height: number }
> = {
  ABOUT: { width: 400, height: 240 },
  LINKS: { width: 400, height: 160 },
  PROJECT: { width: 320, height: 240 },
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

/**
 * Order elements for the linear mobile fallback: top-to-bottom by y,
 * left-to-right by x as the tiebreaker. Does not mutate the input.
 */
export function sortForMobile<T extends { x: number; y: number }>(
  elements: readonly T[],
): T[] {
  return [...elements].sort((a, b) => a.y - b.y || a.x - b.x);
}
