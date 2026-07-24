// Canvas-only project card overrides and layout presets. A placed PROJECT
// canvas element can override the title/description/hashtags it displays and
// pick a layout preset — all scoped to that one placement, never mutating the
// underlying Project record (see specs/canvas-project-card-editing.md).

import type { Category } from "../../generated/prisma";

// Fixed preset list for how media/description are arranged within a placed
// card. Distinct from a Project's own `layout` field (projectLayouts in
// src/server/projects.ts), which controls the project's own page rendering.
export const CARD_LAYOUTS = [
  "media-top",
  "desc-top",
  "media-left",
  "text-only",
] as const;

export type CardLayout = (typeof CARD_LAYOUTS)[number];

// "media-top" is today's only rendering and the default when no override is set.
export const DEFAULT_CARD_LAYOUT: CardLayout = "media-top";

export const CARD_LAYOUT_LABELS: Record<CardLayout, string> = {
  "media-top": "Media top / description below",
  "desc-top": "Description top / media below",
  "media-left": "Media left / description right",
  "text-only": "Text only",
};

export function isCardLayout(value: unknown): value is CardLayout {
  return (
    typeof value === "string" &&
    (CARD_LAYOUTS as readonly string[]).includes(value)
  );
}

// Resolve a stored card-layout value to a concrete preset, falling back to the
// default when unset or unrecognized.
export function resolveCardLayout(
  value: string | null | undefined,
): CardLayout {
  return isCardLayout(value) ? value : DEFAULT_CARD_LAYOUT;
}

// Coerce the raw Json hashtags-override column (JsonValue) to a string[] when
// it holds an array of strings, or null when unset/other. An empty array is a
// valid override ("show zero hashtags"), distinct from null ("unset").
export function coerceHashtagsOverride(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string");
}

// Normalize hashtag override input the same way real project hashtags are
// normalized (see normalizeInput in src/server/projects.ts): strip a leading
// "#", trim, lowercase, drop empties, and dedupe.
export function normalizeHashtags(tags: string[]): string[] {
  return [
    ...new Set(
      tags
        .map((tag) => tag.replace(/^#/, "").trim().toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  ];
}

// The subset of a project ProjectCard renders. Kept structural so both the
// editor's EditorProject and the public canvas element's project satisfy it.
export type ProjectCardData = {
  id: string;
  title: string;
  description: string;
  category: Category;
  hashtags: string[];
  media: { url: string; mimeType: string | null }[];
  user?: { username: string; displayName: string };
};

export type ProjectCardOverrides = {
  titleOverride: string | null;
  descriptionOverride: string | null;
  hashtagsOverride: string[] | null;
};

// Apply canvas-only overrides to a project, returning a NEW object (never
// mutating the input). A blank/unset title or description falls back to the
// real value; hashtags fall back only when the override is null — an empty
// array override wins and shows zero hashtags.
export function applyProjectCardOverrides<T extends ProjectCardData>(
  project: T,
  overrides: ProjectCardOverrides,
): T {
  const title = overrides.titleOverride?.trim()
    ? overrides.titleOverride
    : project.title;
  const description = overrides.descriptionOverride?.trim()
    ? overrides.descriptionOverride
    : project.description;
  // Null = unset (fall back); an empty array is a kept override (no hashtags).
  const hashtags = overrides.hashtagsOverride ?? project.hashtags;
  return { ...project, title, description, hashtags };
}
