import type { CSSProperties } from "react";

export const PROFILE_THEMES = [
  "default",
  "paper",
  "studio",
  "ember",
  "rose",
  "mist",
  "terminal",
] as const;

export type ProfileTheme = (typeof PROFILE_THEMES)[number];

export const PROFILE_THEME_CLASSES: Record<ProfileTheme, string> = {
  default: "",
  paper: "profile-theme-paper",
  studio: "profile-theme-studio",
  ember: "profile-theme-ember",
  rose: "profile-theme-rose",
  mist: "profile-theme-mist",
  terminal: "profile-theme-terminal",
};

export const PROFILE_THEME_OPTIONS: {
  value: ProfileTheme;
  label: string;
  background: string;
  accent: string;
  ink: string;
}[] = [
  { value: "default", label: "Default dark", background: "#131714", accent: "#5fc694", ink: "#e9e7db" },
  { value: "paper", label: "Paper light", background: "#f6f1e6", accent: "#7a4a1e", ink: "#262218" },
  { value: "studio", label: "Indigo studio", background: "#171732", accent: "#a5a1f0", ink: "#e9e9f7" },
  { value: "ember", label: "Ember warm", background: "#17110e", accent: "#f2864b", ink: "#f2e6dc" },
  { value: "rose", label: "Rose blush", background: "#fbeef0", accent: "#b02a5b", ink: "#3a1f28" },
  { value: "mist", label: "Mist cool", background: "#eef2f5", accent: "#0f7d8c", ink: "#1c2a33" },
  { value: "terminal", label: "Terminal mono", background: "#000000", accent: "#33e07a", ink: "#d6ffe0" },
];

export function resolveProfileTheme(value: unknown): ProfileTheme {
  return PROFILE_THEMES.includes(value as ProfileTheme)
    ? (value as ProfileTheme)
    : "default";
}

export function profileThemeClass(value: unknown): string {
  return PROFILE_THEME_CLASSES[resolveProfileTheme(value)];
}

export function profileBackgroundStyle(
  color: string | null | undefined,
  imageUrl: string | null | undefined,
): CSSProperties {
  return {
    ...(color ? { backgroundColor: color } : {}),
    ...(imageUrl
      ? {
          backgroundImage: `url(${JSON.stringify(imageUrl)})`,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundAttachment: "scroll",
        }
      : {}),
  };
}
