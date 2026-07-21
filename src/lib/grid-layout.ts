export type GridBlock = {
  key: string;
  order: number;
  type: "PROJECT" | "IMAGE" | "TEXT" | "LINK";
  x: number;
  y: number;
  width: number;
  height: number;
  projectId: string | null;
  textContent: string | null;
  imageUrl: string | null;
  imageMimeType: string | null;
  imageAlt: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
};

export type GridOperationResult =
  | { valid: true; blocks: GridBlock[] }
  | { valid: false; blocks: GridBlock[]; message: string };

export type GridHistory = {
  past: GridBlock[][];
  present: GridBlock[];
  future: GridBlock[][];
};

export type GridHistoryAction =
  | { type: "commit"; blocks: GridBlock[] }
  | { type: "content"; blocks: GridBlock[] }
  | { type: "undo" }
  | { type: "redo" };

export const GRID_COLUMNS = 12;
export const GRID_MAX_BLOCKS = 50;
export const GRID_ROW_HEIGHT_PX = 80;

const MINIMUM_SIZE: Record<
  GridBlock["type"],
  { width: number; height: number }
> = {
  PROJECT: { width: 3, height: 2 },
  IMAGE: { width: 2, height: 2 },
  TEXT: { width: 2, height: 1 },
  LINK: { width: 2, height: 1 },
};

type GridRectangle = Pick<GridBlock, "x" | "y" | "width" | "height">;

function overlaps(a: GridRectangle, b: GridRectangle) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function geometryErrors(block: GridBlock) {
  const errors: string[] = [];
  const minimum = MINIMUM_SIZE[block.type];

  if (!minimum) {
    errors.push(`Block ${block.key} has an unknown type.`);
    return errors;
  }

  if (
    !Number.isInteger(block.x) ||
    !Number.isInteger(block.y) ||
    !Number.isInteger(block.width) ||
    !Number.isInteger(block.height)
  ) {
    errors.push(`Block ${block.key} geometry must use whole grid cells.`);
  }
  if (block.x < 0 || block.x + block.width > GRID_COLUMNS) {
    errors.push(
      `Block ${block.key} must stay within the ${GRID_COLUMNS}-column grid.`,
    );
  }
  if (block.y < 0) {
    errors.push(`Block ${block.key} cannot use a negative row.`);
  }
  if (block.width < minimum.width || block.height < minimum.height) {
    errors.push(
      `Block ${block.key} must be at least ${minimum.width} columns by ${minimum.height} rows.`,
    );
  }

  return errors;
}

export function validateGridBlocks(blocks: GridBlock[]): string[] {
  const errors: string[] = [];

  if (blocks.length > GRID_MAX_BLOCKS) {
    errors.push(`Layouts can contain at most ${GRID_MAX_BLOCKS} blocks.`);
  }

  for (const block of blocks) errors.push(...geometryErrors(block));

  for (let left = 0; left < blocks.length; left += 1) {
    for (let right = left + 1; right < blocks.length; right += 1) {
      const leftBlock = blocks[left]!;
      const rightBlock = blocks[right]!;
      if (overlaps(leftBlock, rightBlock)) {
        errors.push(
          `Blocks ${leftBlock.key} and ${rightBlock.key} cannot overlap.`,
        );
      }
    }
  }

  return errors;
}

export function findNextGridPosition(
  blocks: GridBlock[],
  type: GridBlock["type"],
): { x: number; y: number } | null {
  if (blocks.length >= GRID_MAX_BLOCKS) return null;

  const minimum = MINIMUM_SIZE[type];
  for (let y = 0; ; y += 1) {
    for (let x = 0; x <= GRID_COLUMNS - minimum.width; x += 1) {
      const candidate = {
        x,
        y,
        width: minimum.width,
        height: minimum.height,
      };
      if (!blocks.some((block) => overlaps(candidate, block))) return { x, y };
    }
  }
}

function invalidOperation(
  blocks: GridBlock[],
  message: string,
): GridOperationResult {
  return { valid: false, blocks, message };
}

export function moveOrSwapGridBlock(
  blocks: GridBlock[],
  key: string,
  x: number,
  y: number,
): GridOperationResult {
  const movingIndex = blocks.findIndex((block) => block.key === key);
  if (movingIndex === -1) {
    return invalidOperation(blocks, "That block no longer exists.");
  }

  const moving = blocks[movingIndex]!;
  const moved = { ...moving, x, y };
  const collisions = blocks.filter(
    (block) => block.key !== key && overlaps(moved, block),
  );
  if (collisions.length === 0) {
    if (geometryErrors(moved).length > 0) {
      return invalidOperation(blocks, "That block cannot be placed there.");
    }
    const next = blocks.map((block) => (block.key === key ? moved : block));
    return validateGridBlocks(next).length === 0
      ? { valid: true, blocks: next }
      : invalidOperation(blocks, "That block cannot be placed there.");
  }

  if (collisions.length !== 1) {
    return invalidOperation(blocks, "That block cannot be placed there.");
  }

  const exchanged = collisions[0]!;
  const next = blocks.map((block) => {
    if (block.key === moving.key) {
      return { ...block, x: exchanged.x, y: exchanged.y };
    }
    if (block.key === exchanged.key) {
      return { ...block, x: moving.x, y: moving.y };
    }
    return block;
  });

  return validateGridBlocks(next).length === 0
    ? { valid: true, blocks: next }
    : invalidOperation(blocks, "Those blocks cannot exchange positions here.");
}

export function resizeGridBlock(
  blocks: GridBlock[],
  key: string,
  width: number,
  height: number,
): GridOperationResult {
  const resizing = blocks.find((block) => block.key === key);
  if (!resizing)
    return invalidOperation(blocks, "That block no longer exists.");

  const resized = { ...resizing, width, height };
  const next = blocks.map((block) => (block.key === key ? resized : block));
  return validateGridBlocks(next).length === 0
    ? { valid: true, blocks: next }
    : invalidOperation(blocks, "That block cannot be resized there.");
}

export function sortGridBlocksForMobile(blocks: GridBlock[]): GridBlock[] {
  return [...blocks].sort(
    (a, b) =>
      a.y - b.y || a.x - b.x || a.order - b.order || a.key.localeCompare(b.key),
  );
}

export function isEmptyGridBlock(block: GridBlock): boolean {
  switch (block.type) {
    case "PROJECT":
      return !block.projectId?.trim();
    case "IMAGE":
      return !block.imageUrl?.trim();
    case "TEXT":
      return !block.textContent?.trim();
    case "LINK":
      return !block.linkUrl?.trim();
  }
}

export function reduceGridHistory(
  state: GridHistory,
  action: GridHistoryAction,
): GridHistory {
  switch (action.type) {
    case "commit":
      return {
        past: [...state.past, state.present],
        present: action.blocks,
        future: [],
      };
    case "content": {
      const contentByKey = new Map(
        action.blocks.map((block) => [block.key, block]),
      );
      const projectContent = (blocks: GridBlock[]) =>
        blocks.map((block) => {
          const content = contentByKey.get(block.key);
          return content
            ? {
                ...block,
                projectId: content.projectId,
                textContent: content.textContent,
                imageUrl: content.imageUrl,
                imageMimeType: content.imageMimeType,
                imageAlt: content.imageAlt,
                linkLabel: content.linkLabel,
                linkUrl: content.linkUrl,
              }
            : block;
        });

      return {
        past: state.past.map(projectContent),
        present: projectContent(state.present),
        future: state.future.map(projectContent),
      };
    }
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
  }
}
