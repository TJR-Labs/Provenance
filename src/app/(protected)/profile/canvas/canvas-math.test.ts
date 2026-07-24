import { describe, expect, it } from "vitest";

import {
  bringElementToFront,
  clampElement,
  resizeFromCorner,
  sortForMobile,
} from "./canvas-math";

const bounds = { width: 1152, maxHeight: 3200, minWidth: 160, minHeight: 80 };

describe("clampElement", () => {
  it("leaves an in-bounds element unchanged", () => {
    const box = { x: 100, y: 200, width: 400, height: 240 };
    expect(clampElement(box, bounds)).toEqual(box);
  });

  it("floors too-small sizes to the minimums", () => {
    expect(clampElement({ x: 0, y: 0, width: 10, height: 5 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 160,
      height: 80,
    });
  });

  it("caps oversized elements to the canvas size", () => {
    expect(
      clampElement({ x: 0, y: 0, width: 5000, height: 9000 }, bounds),
    ).toEqual({ x: 0, y: 0, width: 1152, height: 3200 });
  });

  it("clamps negative positions to the origin", () => {
    expect(
      clampElement({ x: -50, y: -9999, width: 400, height: 240 }, bounds),
    ).toEqual({ x: 0, y: 0, width: 400, height: 240 });
  });

  it("pulls an element back inside when it overhangs the right/bottom edge", () => {
    expect(
      clampElement({ x: 1100, y: 3190, width: 400, height: 240 }, bounds),
    ).toEqual({ x: 1152 - 400, y: 3200 - 240, width: 400, height: 240 });
  });

  it("re-clamps position after flooring the size", () => {
    // Width floors to 160, so max x becomes 1152 - 160 = 992.
    expect(
      clampElement({ x: 1150, y: 0, width: 10, height: 100 }, bounds),
    ).toEqual({ x: 992, y: 0, width: 160, height: 100 });
  });
});

describe("resizeFromCorner", () => {
  // Anchors: top-left (200, 300), top-right (600, 300),
  // bottom-left (200, 540), bottom-right (600, 540).
  const origin = { x: 200, y: 300, width: 400, height: 240 };

  it("dragging top-left keeps the bottom-right corner anchored", () => {
    const result = resizeFromCorner(origin, "top-left", -40, -60, bounds);
    expect(result).toEqual({ x: 160, y: 240, width: 440, height: 300 });
    expect(result.x + result.width).toBe(origin.x + origin.width);
    expect(result.y + result.height).toBe(origin.y + origin.height);
  });

  it("dragging top-right keeps the bottom-left corner anchored", () => {
    const result = resizeFromCorner(origin, "top-right", 50, -30, bounds);
    expect(result).toEqual({ x: 200, y: 270, width: 450, height: 270 });
    expect(result.x).toBe(origin.x);
    expect(result.y + result.height).toBe(origin.y + origin.height);
  });

  it("dragging bottom-left keeps the top-right corner anchored", () => {
    const result = resizeFromCorner(origin, "bottom-left", -30, 40, bounds);
    expect(result).toEqual({ x: 170, y: 300, width: 430, height: 280 });
    expect(result.x + result.width).toBe(origin.x + origin.width);
    expect(result.y).toBe(origin.y);
  });

  it("dragging bottom-right keeps the top-left corner anchored", () => {
    const result = resizeFromCorner(origin, "bottom-right", 60, 70, bounds);
    expect(result).toEqual({ x: 200, y: 300, width: 460, height: 310 });
    expect(result.x).toBe(origin.x);
    expect(result.y).toBe(origin.y);
  });

  it("dragging top-left past the bottom-right edge floors to the minimum size without inverting", () => {
    const result = resizeFromCorner(origin, "top-left", 1000, 1000, bounds);
    expect(result).toEqual({ x: 440, y: 460, width: 160, height: 80 });
    expect(result.x + result.width).toBe(origin.x + origin.width);
    expect(result.y + result.height).toBe(origin.y + origin.height);
  });

  it("dragging top-right past the bottom-left edge floors to the minimum size without inverting", () => {
    const result = resizeFromCorner(origin, "top-right", -1000, 1000, bounds);
    expect(result).toEqual({ x: 200, y: 460, width: 160, height: 80 });
    expect(result.x).toBe(origin.x);
    expect(result.y + result.height).toBe(origin.y + origin.height);
  });

  it("dragging bottom-left past the top-right edge floors to the minimum size without inverting", () => {
    const result = resizeFromCorner(origin, "bottom-left", 1000, -1000, bounds);
    expect(result).toEqual({ x: 440, y: 300, width: 160, height: 80 });
    expect(result.x + result.width).toBe(origin.x + origin.width);
    expect(result.y).toBe(origin.y);
  });

  it("dragging bottom-right past the top-left edge floors to the minimum size without inverting", () => {
    const result = resizeFromCorner(origin, "bottom-right", -1000, -1000, bounds);
    expect(result).toEqual({ x: 200, y: 300, width: 160, height: 80 });
    expect(result.x).toBe(origin.x);
    expect(result.y).toBe(origin.y);
  });

  it("clamps the result inside the canvas when the drag leaves the bounds", () => {
    // Dragging top-left far past the canvas origin: size caps to the
    // canvas, then the position is pulled back inside [0, bounds].
    const result = resizeFromCorner(origin, "top-left", -2000, -2000, bounds);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.width).toBeLessThanOrEqual(bounds.width);
    expect(result.height).toBeLessThanOrEqual(bounds.maxHeight);
  });
});

describe("bringElementToFront", () => {
  it("raises the targeted element above every other zIndex, with no movement involved", () => {
    const elements = [
      { key: "a", zIndex: 1 },
      { key: "b", zIndex: 3 },
      { key: "c", zIndex: 2 },
    ];
    const result = bringElementToFront(elements, "a");
    const zByKey = new Map(result.map((element) => [element.key, element.zIndex]));
    expect(zByKey.get("a")).toBeGreaterThan(zByKey.get("b")!);
    expect(zByKey.get("a")).toBeGreaterThan(zByKey.get("c")!);
    // Untouched elements keep their zIndex — this models a plain
    // click/press with no drag: only stacking order changes.
    expect(zByKey.get("b")).toBe(3);
    expect(zByKey.get("c")).toBe(2);
  });

  it("does not mutate the input array", () => {
    const elements = [
      { key: "a", zIndex: 1 },
      { key: "b", zIndex: 2 },
    ];
    const copy = elements.map((element) => ({ ...element }));
    bringElementToFront(elements, "b");
    expect(elements).toEqual(copy);
  });

  it("is a no-op reorder when the element is already on top (still bumps zIndex higher)", () => {
    const elements = [
      { key: "a", zIndex: 1 },
      { key: "b", zIndex: 5 },
    ];
    const result = bringElementToFront(elements, "b");
    const b = result.find((element) => element.key === "b")!;
    expect(b.zIndex).toBeGreaterThan(5);
  });
});

describe("sortForMobile", () => {
  it("sorts by y ascending with x as tiebreaker", () => {
    const elements = [
      { id: "c", x: 600, y: 300 },
      { id: "a", x: 0, y: 0 },
      { id: "d", x: 0, y: 300 },
      { id: "b", x: 100, y: 40 },
    ];
    expect(sortForMobile(elements).map((element) => element.id)).toEqual([
      "a",
      "b",
      "d",
      "c",
    ]);
  });

  it("does not mutate the input array", () => {
    const elements = [
      { x: 5, y: 10 },
      { x: 0, y: 0 },
    ];
    const copy = [...elements];
    sortForMobile(elements);
    expect(elements).toEqual(copy);
  });
});
