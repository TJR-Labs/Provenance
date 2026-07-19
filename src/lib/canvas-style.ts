// Per-element canvas styling constraints. These mirror the "no arbitrary font
// loading / no @font-face / no external URL injection" rule established for
// custom CSS in portfolio-platform.md: fonts are a fixed allowlist of CSS
// stacks (never a user-supplied URL), colors are restricted to safe literals,
// and every value is validated server-side before it is stored or rendered.

// Element types that expose a style panel (color / background / font). Avatar
// additionally exposes frame shape and image position/zoom (see below).
export const STYLEABLE_TYPES = [
  "NAME",
  "USERNAME",
  "CATEGORIES",
  "ABOUT",
  "AVATAR",
  "TEXT",
] as const;
export type StyleableType = (typeof STYLEABLE_TYPES)[number];

// Curated, allowlisted font choices. `id` is what gets stored on the element;
// `stack` is the self-contained CSS font-family value applied at render time.
// No entry references an external font or @font-face — these are system/web-safe
// stacks only.
export const CANVAS_FONTS = [
  { id: "sans", label: "Sans", stack: "ui-sans-serif, system-ui, sans-serif" },
  { id: "serif", label: "Serif", stack: "ui-serif, Georgia, Cambria, serif" },
  {
    id: "mono",
    label: "Mono",
    stack: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  {
    id: "rounded",
    label: "Rounded",
    stack: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
  },
  { id: "condensed", label: "Condensed", stack: '"Arial Narrow", Arial, sans-serif' },
] as const;

export type CanvasFontId = (typeof CANVAS_FONTS)[number]["id"];

export const CANVAS_FONT_IDS = CANVAS_FONTS.map((font) => font.id) as [
  CanvasFontId,
  ...CanvasFontId[],
];

// Map a stored font id to its CSS font-family stack, or null when unset/unknown.
export function fontStack(id: string | null | undefined): string | null {
  const found = CANVAS_FONTS.find((font) => font.id === id);
  return found ? found.stack : null;
}

export const AVATAR_SHAPES = ["circle", "square", "rounded"] as const;
export type AvatarShape = (typeof AVATAR_SHAPES)[number];

export const AVATAR_ZOOM_MIN = 100;
export const AVATAR_ZOOM_MAX = 300;
export const AVATAR_ZOOM_DEFAULT = 100;

// Image position, expressed as CSS background/object-position percentages.
export const AVATAR_OFFSET_MIN = 0;
export const AVATAR_OFFSET_MAX = 100;
export const AVATAR_OFFSET_DEFAULT = 50;

// CSS border-radius for a given avatar frame shape.
export function avatarShapeRadius(shape: string | null | undefined): string {
  if (shape === "square") return "0px";
  if (shape === "rounded") return "16px";
  return "9999px"; // circle (default)
}

// Colors are restricted to short/long hex literals or the keyword "transparent"
// so a stored value can never inject arbitrary CSS when applied inline.
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isSafeCanvasColor(value: string): boolean {
  return value === "transparent" || HEX_COLOR.test(value);
}

export function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(Math.round(value), max));
}
