import { z } from "zod";

export const MAX_PAGE_SIZE = 100;
export const PUBLIC_PROJECT_PAGE_SIZE = 24;
export const ADMIN_PAGE_SIZE = 50;

const ISO_DATE_LENGTH = 24;
const MAX_CURSOR_LENGTH = 512;

export type CreatedAtIdCursor = {
  createdAt: Date;
  id: string;
};

export class InvalidPaginationCursorError extends Error {
  constructor() {
    super("Invalid pagination cursor.");
    this.name = "InvalidPaginationCursorError";
  }
}

export function encodePaginationCursor(cursor: CreatedAtIdCursor) {
  return `${cursor.createdAt.toISOString()}|${encodeURIComponent(cursor.id)}`;
}

export function decodePaginationCursor(value: string): CreatedAtIdCursor {
  if (
    value.length > MAX_CURSOR_LENGTH ||
    value.length <= ISO_DATE_LENGTH + 1 ||
    value[ISO_DATE_LENGTH] !== "|" ||
    value.slice(ISO_DATE_LENGTH + 1).includes("|")
  ) {
    throw new InvalidPaginationCursorError();
  }

  const encodedId = value.slice(ISO_DATE_LENGTH + 1);
  const createdAtText = value.slice(0, ISO_DATE_LENGTH);
  const createdAt = new Date(createdAtText);
  let id: string;
  try {
    id = decodeURIComponent(encodedId);
  } catch {
    throw new InvalidPaginationCursorError();
  }

  if (
    !id ||
    createdAt.toString() === "Invalid Date" ||
    createdAt.toISOString() !== createdAtText
  ) {
    throw new InvalidPaginationCursorError();
  }

  return { createdAt, id };
}

export const paginationCursorSchema = z
  .string()
  .max(MAX_CURSOR_LENGTH)
  .refine(
    (value) => {
      try {
        decodePaginationCursor(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid pagination cursor." },
  );

export function pageSizeSchema(defaultSize: number) {
  return z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .transform((value) => Math.min(value, MAX_PAGE_SIZE))
    .default(defaultSize);
}

export function clampPageSize(
  requestedSize: number | undefined,
  defaultSize: number,
) {
  const size = requestedSize ?? defaultSize;
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new RangeError("Page size must be a positive integer.");
  }
  return Math.min(size, MAX_PAGE_SIZE);
}

export function createdAtIdCursorWhere(cursorValue: string | undefined) {
  if (!cursorValue) return undefined;
  const cursor = decodePaginationCursor(cursorValue);
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

export function pageFromRows<Row extends CreatedAtIdCursor, Item = Row>(
  rows: Row[],
  pageSize: number,
  mapItem: (row: Row) => Item = (row) => row as unknown as Item,
) {
  const hasNextPage = rows.length > pageSize;
  const pageRows = hasNextPage ? rows.slice(0, pageSize) : rows;
  const lastRow = pageRows.at(-1);

  return {
    items: pageRows.map(mapItem),
    nextCursor:
      hasNextPage && lastRow
        ? encodePaginationCursor({
            createdAt: lastRow.createdAt,
            id: lastRow.id,
          })
        : null,
  };
}
