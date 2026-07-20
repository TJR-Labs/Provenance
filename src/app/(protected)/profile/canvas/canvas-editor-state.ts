import { clampElement, type CanvasBounds, type CanvasBox } from "./canvas-math";

export type LayerAction = "front" | "forward" | "backward" | "back";

export function boxesIntersect(left: CanvasBox, right: CanvasBox): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

export function intersectingKeys<T extends CanvasBox & { key: string }>(
  elements: readonly T[],
  rectangle: CanvasBox,
): Set<string> {
  return new Set(
    elements
      .filter((element) => boxesIntersect(element, rectangle))
      .map((element) => element.key),
  );
}

function ordered<T extends { zIndex: number }>(elements: readonly T[]) {
  return [...elements].sort((left, right) => left.zIndex - right.zIndex);
}

function withContiguousLayers<T extends { zIndex: number }>(elements: T[]): T[] {
  return elements.map((element, index) => ({ ...element, zIndex: index + 1 }));
}

export function layerSelection<T extends { key: string; zIndex: number }>(
  elements: readonly T[],
  selected: ReadonlySet<string>,
  action: LayerAction,
): T[] {
  const current = ordered(elements);
  const chosen = current.filter((element) => selected.has(element.key));
  if (!chosen.length || chosen.length === current.length) return [...elements];
  const others = current.filter((element) => !selected.has(element.key));
  let next: T[];

  if (action === "front") next = [...others, ...chosen];
  else if (action === "back") next = [...chosen, ...others];
  else if (action === "forward") {
    const topIndex = Math.max(
      ...current.flatMap((element, index) =>
        selected.has(element.key) ? [index] : [],
      ),
    );
    const boundary = current.findIndex(
      (element, index) => index > topIndex && !selected.has(element.key),
    );
    if (boundary === -1) return [...elements];
    const target = current[boundary]!;
    const insertion = others.findIndex((element) => element.key === target.key) + 1;
    next = [...others.slice(0, insertion), ...chosen, ...others.slice(insertion)];
  } else {
    const bottomIndex = Math.min(
      ...current.flatMap((element, index) =>
        selected.has(element.key) ? [index] : [],
      ),
    );
    let boundary = -1;
    for (let index = bottomIndex - 1; index >= 0; index -= 1) {
      if (!selected.has(current[index]!.key)) {
        boundary = index;
        break;
      }
    }
    if (boundary === -1) return [...elements];
    const target = current[boundary]!;
    const insertion = others.findIndex((element) => element.key === target.key);
    next = [...others.slice(0, insertion), ...chosen, ...others.slice(insertion)];
  }

  const normalized = withContiguousLayers(next);
  const zByKey = new Map(normalized.map((element) => [element.key, element.zIndex]));
  return elements.map((element) => ({
    ...element,
    zIndex: zByKey.get(element.key) ?? element.zIndex,
  }));
}

export function groupOffset<T extends CanvasBox>(
  elements: readonly T[],
  bounds: CanvasBounds,
  preferred = 24,
): { x: number; y: number } {
  if (!elements.length) return { x: preferred, y: preferred };
  const minX = Math.min(...elements.map((element) => element.x));
  const minY = Math.min(...elements.map((element) => element.y));
  const maxX = Math.max(...elements.map((element) => element.x + element.width));
  const maxY = Math.max(...elements.map((element) => element.y + element.height));
  const x = maxX + preferred <= bounds.width ? preferred : minX >= preferred ? -preferred : 0;
  const y = maxY + preferred <= bounds.maxHeight ? preferred : minY >= preferred ? -preferred : 0;
  return { x, y };
}

export function clampGroupDelta<T extends CanvasBox>(
  elements: readonly T[],
  dx: number,
  dy: number,
  bounds: CanvasBounds,
): { x: number; y: number } {
  if (!elements.length) return { x: 0, y: 0 };
  const minX = Math.min(...elements.map((element) => element.x));
  const minY = Math.min(...elements.map((element) => element.y));
  const maxX = Math.max(...elements.map((element) => element.x + element.width));
  const maxY = Math.max(...elements.map((element) => element.y + element.height));
  return {
    x: Math.max(-minX, Math.min(dx, bounds.width - maxX)),
    y: Math.max(-minY, Math.min(dy, bounds.maxHeight - maxY)),
  };
}

export function duplicateSelection<
  T extends CanvasBox & { key: string; zIndex: number; locked: boolean },
>(
  elements: readonly T[],
  selected: ReadonlySet<string>,
  bounds: CanvasBounds,
  createKey: () => string,
): { elements: T[]; selected: Set<string> } {
  const originals = ordered(elements).filter((element) => selected.has(element.key));
  if (!originals.length) return { elements: [...elements], selected: new Set() };
  const offset = groupOffset(originals, bounds);
  const highest = Math.max(0, ...elements.map((element) => element.zIndex));
  const copies = originals.map((element, index) => {
    const geometry = clampElement(
      { ...element, x: element.x + offset.x, y: element.y + offset.y },
      bounds,
    );
    return {
      ...element,
      ...geometry,
      key: createKey(),
      zIndex: highest + index + 1,
      locked: false,
    };
  });
  return {
    elements: [...elements, ...copies],
    selected: new Set(copies.map((copy) => copy.key)),
  };
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    Boolean(target.closest('[contenteditable="true"]'))
  );
}
