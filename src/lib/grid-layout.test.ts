import { describe, expect, it } from "vitest";

import {
  GRID_COLUMNS,
  GRID_MAX_BLOCKS,
  GRID_ROW_HEIGHT_PX,
  findNextGridPosition,
  isEmptyGridBlock,
  moveOrSwapGridBlock,
  reduceGridHistory,
  resizeGridBlock,
  sortGridBlocksForMobile,
  validateGridBlocks,
  type GridBlock,
  type GridHistory,
} from "./grid-layout";

const minimums = {
  PROJECT: { width: 3, height: 2 },
  IMAGE: { width: 2, height: 2 },
  TEXT: { width: 2, height: 1 },
  LINK: { width: 2, height: 1 },
} as const;

function block(key: string, overrides: Partial<GridBlock> = {}): GridBlock {
  const type = overrides.type ?? "TEXT";
  return {
    key,
    order: 0,
    type,
    x: 0,
    y: 0,
    ...minimums[type],
    projectId: null,
    textContent: null,
    imageUrl: null,
    imageMimeType: null,
    imageAlt: null,
    linkLabel: null,
    linkUrl: null,
    ...overrides,
  };
}

describe("grid constants and validation", () => {
  it("exposes the Task 2 grid constants", () => {
    expect(GRID_COLUMNS).toBe(12);
    expect(GRID_MAX_BLOCKS).toBe(50);
    expect(GRID_ROW_HEIGHT_PX).toBe(80);
  });

  it.each([
    ["PROJECT", 3, 2],
    ["IMAGE", 2, 2],
    ["TEXT", 2, 1],
    ["LINK", 2, 1],
  ] as const)("accepts the %s minimum of %sx%s", (type, width, height) => {
    expect(validateGridBlocks([block("a", { type, width, height })])).toEqual(
      [],
    );
  });

  it.each(["x", "y", "width", "height"] as const)(
    "rejects a non-integer %s value",
    (field) => {
      expect(validateGridBlocks([block("a", { [field]: 1.5 })])).not.toEqual(
        [],
      );
    },
  );

  it.each([
    ["PROJECT", 2, 2],
    ["PROJECT", 3, 1],
    ["IMAGE", 1, 2],
    ["IMAGE", 2, 1],
    ["TEXT", 1, 1],
    ["TEXT", 2, 0],
    ["LINK", 1, 1],
    ["LINK", 2, 0],
  ] as const)(
    "rejects a %s block smaller than %sx%s",
    (type, width, height) => {
      expect(
        validateGridBlocks([block("a", { type, width, height })]),
      ).not.toEqual([]);
    },
  );

  it("rejects horizontal overflow and negative coordinates", () => {
    expect(validateGridBlocks([block("a", { x: 11 })])).not.toEqual([]);
    expect(validateGridBlocks([block("a", { x: -1 })])).not.toEqual([]);
    expect(validateGridBlocks([block("a", { y: -1 })])).not.toEqual([]);
  });

  it("rejects collisions but permits touching edges", () => {
    const left = block("left", { x: 0, width: 3 });
    const touching = block("touching", { x: 3 });
    const overlapping = block("overlapping", { x: 2 });

    expect(validateGridBlocks([left, touching])).toEqual([]);
    expect(validateGridBlocks([left, overlapping])).not.toEqual([]);
  });

  it("allows exactly 50 blocks and rejects a 51st", () => {
    const fifty = Array.from({ length: GRID_MAX_BLOCKS }, (_, index) =>
      block(`block-${index}`, { y: index }),
    );

    expect(validateGridBlocks(fifty)).toEqual([]);
    expect(
      validateGridBlocks([...fifty, block("block-50", { y: 50 })]),
    ).not.toEqual([]);
  });
});

describe("row-major placement", () => {
  it("finds the first position that fits a type minimum", () => {
    const blocks = [
      block("wide", { x: 0, width: 5 }),
      block("middle", { x: 7, width: 3 }),
    ];

    expect(findNextGridPosition(blocks, "TEXT")).toEqual({ x: 5, y: 0 });
    expect(findNextGridPosition(blocks, "PROJECT")).toEqual({ x: 0, y: 1 });
  });

  it("grows downward without a fixed maximum row", () => {
    const blocks = [
      block("tall", { x: 0, y: 0, width: GRID_COLUMNS, height: 125 }),
    ];

    expect(findNextGridPosition(blocks, "TEXT")).toEqual({ x: 0, y: 125 });
  });

  it("returns null before scanning when the layout has 50 blocks", () => {
    const blocks = Array.from({ length: GRID_MAX_BLOCKS }, (_, index) =>
      block(`block-${index}`, { x: 0, y: index + 1 }),
    );

    expect(findNextGridPosition(blocks, "TEXT")).toBeNull();
  });
});

describe("move, swap, and resize operations", () => {
  it("moves a block by one cell like an Arrow key operation", () => {
    const blocks = [block("a", { x: 0 })];
    const result = moveOrSwapGridBlock(blocks, "a", 1, 0);

    expect(result.valid).toBe(true);
    expect(result.blocks[0]).toMatchObject({ x: 1, y: 0 });
    expect(blocks[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("rolls back an invalid move and preserves the input array", () => {
    const blocks = [block("a", { x: 0 })];
    const result = moveOrSwapGridBlock(blocks, "a", -1, 0);

    expect(result.valid).toBe(false);
    expect(result.blocks).toBe(blocks);
    if (!result.valid) expect(result.message).toBeTruthy();
  });

  it("exchanges positions without changing either block size", () => {
    const blocks = [
      block("a", { x: 0, width: 2, height: 1 }),
      block("b", { x: 4, width: 3, height: 2, type: "PROJECT" }),
    ];
    const result = moveOrSwapGridBlock(blocks, "a", 4, 0);

    expect(result).toEqual({
      valid: true,
      blocks: [
        { ...blocks[0]!, x: 4, y: 0 },
        { ...blocks[1]!, x: 0, y: 0 },
      ],
    });
  });

  it("rejects a differently sized exchange that would overlap another block", () => {
    const blocks = [
      block("a", { x: 0, width: 2, height: 1 }),
      block("b", { x: 3, width: 4, height: 2, type: "PROJECT" }),
      block("c", { x: 0, y: 1, width: 2, height: 1, type: "TEXT" }),
    ];

    expect(moveOrSwapGridBlock(blocks, "a", 3, 0)).toEqual({
      valid: false,
      blocks,
      message: "Those blocks cannot exchange positions here.",
    });
  });

  it("rejects a differently sized exchange that would leave the grid", () => {
    const blocks = [
      block("wide", { x: 0, width: 4, type: "PROJECT" }),
      block("edge", { x: 10, width: 2 }),
    ];
    const result = moveOrSwapGridBlock(blocks, "wide", 10, 0);

    expect(result.valid).toBe(false);
    expect(result.blocks).toBe(blocks);
    if (!result.valid) {
      expect(result.message).toBe(
        "Those blocks cannot exchange positions here.",
      );
    }
  });

  it("resizes by one cell like a Shift+Arrow operation", () => {
    const blocks = [block("a", { width: 2, height: 1 })];
    const result = resizeGridBlock(blocks, "a", 3, 2);

    expect(result.valid).toBe(true);
    expect(result.blocks[0]).toMatchObject({ width: 3, height: 2 });
  });

  it("rolls back resize at a type minimum, boundary, or collision", () => {
    const minimum = [block("a")];
    const belowMinimum = resizeGridBlock(minimum, "a", 1, 1);
    expect(belowMinimum.valid).toBe(false);
    expect(belowMinimum.blocks).toBe(minimum);

    const boundary = [block("a", { x: 10 })];
    const outOfBounds = resizeGridBlock(boundary, "a", 3, 1);
    expect(outOfBounds.valid).toBe(false);
    expect(outOfBounds.blocks).toBe(boundary);

    const collision = [block("a"), block("b", { x: 3 })];
    const overlaps = resizeGridBlock(collision, "a", 4, 1);
    expect(overlaps.valid).toBe(false);
    expect(overlaps.blocks).toBe(collision);
  });
});

describe("history", () => {
  const a = block("a", { textContent: "first" });
  const moved = { ...a, x: 1 };
  const edited = { ...moved, textContent: "edited" };

  it("records commits and supports undo and redo", () => {
    const initial: GridHistory = { past: [], present: [a], future: [] };
    const committed = reduceGridHistory(initial, {
      type: "commit",
      blocks: [moved],
    });
    expect(committed).toEqual({ past: [[a]], present: [moved], future: [] });

    const undone = reduceGridHistory(committed, { type: "undo" });
    expect(undone).toEqual({ past: [], present: [a], future: [[moved]] });
    expect(reduceGridHistory(undone, { type: "redo" })).toEqual(committed);
  });

  it("projects content through layout snapshots without adding history", () => {
    const future = { ...a, x: 2 };
    const state: GridHistory = {
      past: [[a]],
      present: [moved],
      future: [[future]],
    };
    const content = {
      ...edited,
      order: 99,
      type: "IMAGE" as const,
      x: 9,
      projectId: "project-edited",
      imageUrl: "/edited.png",
      imageMimeType: "image/png",
      imageAlt: "Edited image",
      linkLabel: "Edited link",
      linkUrl: "https://example.com",
    };
    const expectedContent = {
      projectId: content.projectId,
      textContent: content.textContent,
      imageUrl: content.imageUrl,
      imageMimeType: content.imageMimeType,
      imageAlt: content.imageAlt,
      linkLabel: content.linkLabel,
      linkUrl: content.linkUrl,
    };

    expect(
      reduceGridHistory(state, { type: "content", blocks: [content] }),
    ).toEqual({
      past: [[{ ...a, ...expectedContent }]],
      present: [{ ...moved, ...expectedContent }],
      future: [[{ ...future, ...expectedContent }]],
    });
  });

  it("keeps edited text while undoing and redoing layout geometry", () => {
    const initial: GridHistory = { past: [], present: [a], future: [] };
    const committed = reduceGridHistory(initial, {
      type: "commit",
      blocks: [moved],
    });
    const contentEdited = reduceGridHistory(committed, {
      type: "content",
      blocks: [edited],
    });

    const undone = reduceGridHistory(contentEdited, { type: "undo" });
    expect(undone.present[0]).toMatchObject({ x: 0, textContent: "edited" });

    const redone = reduceGridHistory(undone, { type: "redo" });
    expect(redone.present[0]).toMatchObject({ x: 1, textContent: "edited" });
  });

  it("clears redo history on a new commit and no-ops at history ends", () => {
    const state: GridHistory = { past: [], present: [a], future: [[moved]] };
    const committed = reduceGridHistory(state, {
      type: "commit",
      blocks: [edited],
    });

    expect(committed.future).toEqual([]);
    const atBeginning = { ...state, future: [] };
    expect(reduceGridHistory(atBeginning, { type: "undo" })).toBe(atBeginning);
    const atEnd = { ...state, future: [] };
    expect(reduceGridHistory(atEnd, { type: "redo" })).toBe(atEnd);
  });
});

describe("mobile ordering and empty blocks", () => {
  it("sorts by y, x, stable order, and key without mutating the input", () => {
    const blocks = [
      block("z", { y: 1, x: 0, order: 0 }),
      block("d", { y: 0, x: 1, order: 2 }),
      block("c", { y: 0, x: 1, order: 2 }),
      block("b", { y: 0, x: 1, order: 1 }),
      block("a", { y: 0, x: 0, order: 9 }),
    ];

    expect(sortGridBlocksForMobile(blocks).map(({ key }) => key)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "z",
    ]);
    expect(blocks.map(({ key }) => key)).toEqual(["z", "d", "c", "b", "a"]);
  });

  it.each([
    [block("project", { type: "PROJECT" }), true],
    [block("project", { type: "PROJECT", projectId: "p1" }), false],
    [block("text", { type: "TEXT", textContent: " \n " }), true],
    [block("text", { type: "TEXT", textContent: "Copy" }), false],
    [block("image", { type: "IMAGE", imageUrl: "  " }), true],
    [block("image", { type: "IMAGE", imageUrl: "/image.png" }), false],
    [block("link", { type: "LINK", linkLabel: "Label" }), true],
    [block("link", { type: "LINK", linkUrl: "https://example.com" }), false],
  ])("classifies publishable content emptiness", (candidate, expected) => {
    expect(isEmptyGridBlock(candidate)).toBe(expected);
  });
});
