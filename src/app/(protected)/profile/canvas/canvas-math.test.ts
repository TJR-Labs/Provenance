import { describe, expect, it } from "vitest";

import { clampElement, sortForMobile } from "./canvas-math";

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
