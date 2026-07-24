import { describe, expect, it } from "vitest";

import {
  boxesIntersect,
  clampGroupDelta,
  duplicateSelection,
  groupOffset,
  intersectingKeys,
} from "./canvas-editor-state";

const bounds = {
  width: 600,
  maxHeight: 500,
  minWidth: 120,
  minHeight: 80,
};

const elements = [
  {
    key: "one",
    x: 20,
    y: 30,
    width: 120,
    height: 80,
    zIndex: 1,
    locked: true,
  },
  {
    key: "two",
    x: 260,
    y: 160,
    width: 140,
    height: 100,
    zIndex: 2,
    locked: false,
  },
];

describe("canvas editor selection geometry", () => {
  it("treats a one-pixel overlap as an intersection", () => {
    expect(
      boxesIntersect(elements[0]!, {
        x: 139,
        y: 109,
        width: 1,
        height: 1,
      }),
    ).toBe(true);
    expect(
      boxesIntersect(elements[0]!, {
        x: 140,
        y: 110,
        width: 1,
        height: 1,
      }),
    ).toBe(false);
  });

  it("returns every key touched by a marquee", () => {
    expect(
      intersectingKeys(elements, {
        x: 130,
        y: 100,
        width: 140,
        height: 70,
      }),
    ).toEqual(new Set(["one", "two"]));
  });
});

describe("canvas editor group geometry", () => {
  it("clamps one shared movement delta for the entire group", () => {
    expect(clampGroupDelta(elements, -100, -100, bounds)).toEqual({
      x: -20,
      y: -30,
    });
    expect(clampGroupDelta(elements, 500, 500, bounds)).toEqual({
      x: 200,
      y: 240,
    });
  });

  it("chooses a uniform duplicate offset that keeps the group reachable", () => {
    expect(groupOffset(elements, bounds)).toEqual({ x: 24, y: 24 });
    expect(
      groupOffset(
        elements.map((element) => ({ ...element, x: element.x + 200 })),
        bounds,
      ),
    ).toEqual({ x: -24, y: 24 });
  });

  it("duplicates the selection in relative order and starts copies unlocked", () => {
    let nextKey = 0;
    const result = duplicateSelection(
      elements,
      new Set(["one", "two"]),
      bounds,
      () => `copy-${++nextKey}`,
    );
    const copies = result.elements.slice(2);

    expect(copies).toEqual([
      expect.objectContaining({
        key: "copy-1",
        x: 44,
        y: 54,
        zIndex: 3,
        locked: false,
      }),
      expect.objectContaining({
        key: "copy-2",
        x: 284,
        y: 184,
        zIndex: 4,
        locked: false,
      }),
    ]);
    expect(result.selected).toEqual(new Set(["copy-1", "copy-2"]));
  });
});
