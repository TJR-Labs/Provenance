// Colors are restricted to short/long hex literals or the keyword "transparent"
// so a stored value can never inject arbitrary CSS when applied inline.
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isSafeCanvasColor(value: string): boolean {
  return value === "transparent" || HEX_COLOR.test(value);
}

export function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(Math.round(value), max));
}

export const TYPEFACE_PAIRINGS = [
  "archivo-plexmono",
  "newsreader-archivo",
  "schibsted-plexmono",
] as const;

export const MOTION_LEVELS = ["none", "subtle", "full"] as const;

export type SiteStyle = {
  typefacePairing: (typeof TYPEFACE_PAIRINGS)[number];
  colorBg: string;
  colorText: string;
  colorAccent: string;
  colorLine: string;
  cornerRadius: number;
  motionLevel: (typeof MOTION_LEVELS)[number];
};

// Each typeface pairing maps to the `next/font` CSS variables declared in
// src/app/layout.tsx. Shared by the editor preview and the published site so
// both resolve a pairing to exactly the same stack.
export const HEADING_FONTS: Record<SiteStyle["typefacePairing"], string> = {
  "archivo-plexmono": "var(--font-archivo)",
  "newsreader-archivo": "var(--font-newsreader)",
  "schibsted-plexmono": "var(--font-schibsted-grotesk)",
};

export const BODY_FONTS: Record<SiteStyle["typefacePairing"], string> = {
  "archivo-plexmono": "var(--font-archivo)",
  "newsreader-archivo": "var(--font-archivo)",
  "schibsted-plexmono": "var(--font-schibsted-grotesk)",
};

export const DEFAULT_SITE_STYLE: SiteStyle = {
  typefacePairing: "archivo-plexmono",
  colorBg: "#10100f",
  colorText: "#f1eee6",
  colorAccent: "#ed4b2a",
  colorLine: "#3a3935",
  cornerRadius: 10,
  motionLevel: "subtle",
};

export const LEGACY_THEME_STYLE_PRESETS = {
  default: {
    colorBg: "#10100f",
    colorText: "#f1eee6",
    colorAccent: "#ed4b2a",
    colorLine: "#3a3935",
  },
  cream: {
    colorBg: "#f1eee6",
    colorText: "#17150f",
    colorAccent: "#ed4b2a",
    colorLine: "#c9c2b0",
  },
  "warm-black": {
    colorBg: "#10100f",
    colorText: "#f1eee6",
    colorAccent: "#ed4b2a",
    colorLine: "#3a3935",
  },
  "contact-sheet": {
    colorBg: "#252522",
    colorText: "#f1eee6",
    colorAccent: "#ed4b2a",
    colorLine: "#4a4943",
  },
  broadsheet: {
    colorBg: "#e4e0d5",
    colorText: "#1a1916",
    colorAccent: "#ed4b2a",
    colorLine: "#bab3a2",
  },
  workbench: {
    colorBg: "#1d1d1b",
    colorText: "#f1eee6",
    colorAccent: "#ed4b2a",
    colorLine: "#45443e",
  },
} satisfies Record<
  | "default"
  | "cream"
  | "warm-black"
  | "contact-sheet"
  | "broadsheet"
  | "workbench",
  Pick<SiteStyle, "colorBg" | "colorText" | "colorAccent" | "colorLine">
>;

export type SiteStylePreset = keyof typeof LEGACY_THEME_STYLE_PRESETS;

export const SITE_STYLE_PRESET_OPTIONS = [
  {
    value: "cream",
    label: "Editorial cream",
    background: "#f1eee6",
    ink: "#17150f",
  },
  {
    value: "warm-black",
    label: "Warm black",
    background: "#10100f",
    ink: "#f1eee6",
  },
  {
    value: "contact-sheet",
    label: "Contact sheet",
    background: "#252522",
    ink: "#f1eee6",
  },
  {
    value: "broadsheet",
    label: "Broadsheet",
    background: "#e4e0d5",
    ink: "#1a1916",
  },
  {
    value: "workbench",
    label: "Workbench",
    background: "#1d1d1b",
    ink: "#f1eee6",
  },
] as const satisfies readonly {
  value: Exclude<SiteStylePreset, "default">;
  label: string;
  background: string;
  ink: string;
}[];

export const EMBED_ALLOWED_HOSTS = [
  "www.youtube.com",
  "player.vimeo.com",
  "codepen.io",
  "www.figma.com",
  "open.spotify.com",
  "www.loom.com",
] as const;

export function isAllowedEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      EMBED_ALLOWED_HOSTS.includes(
        url.hostname as (typeof EMBED_ALLOWED_HOSTS)[number],
      )
    );
  } catch {
    return false;
  }
}
