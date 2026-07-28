"use client";

import type { EditorStyle } from "./site-editor";

const TYPEFACE_OPTIONS: {
  value: EditorStyle["typefacePairing"];
  label: string;
  family: string;
}[] = [
  {
    value: "archivo-plexmono",
    label: "Archivo / Plex Mono",
    family: "var(--font-archivo)",
  },
  {
    value: "newsreader-archivo",
    label: "Newsreader / Archivo",
    family: "var(--font-newsreader)",
  },
  {
    value: "schibsted-plexmono",
    label: "Schibsted / Plex Mono",
    family: "var(--font-schibsted-grotesk)",
  },
];

const COLOR_FIELDS: {
  key: "colorBg" | "colorText" | "colorAccent" | "colorLine";
  label: string;
}[] = [
  { key: "colorBg", label: "BG" },
  { key: "colorText", label: "TEXT" },
  { key: "colorAccent", label: "ACCENT" },
  { key: "colorLine", label: "LINE" },
];

type InspectorStylesProps = {
  style: EditorStyle;
  onChange: (patch: Partial<EditorStyle>) => void;
};

function colorInputValue(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
}

export function InspectorStyles({ style, onChange }: InspectorStylesProps) {
  return (
    <div className="flex flex-col gap-6 p-4">
      <section>
        <h2 className="text-ink font-semibold">Typeface pairing</h2>
        <div className="mt-3 space-y-2">
          {TYPEFACE_OPTIONS.map((option) => {
            const selected = style.typefacePairing === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ typefacePairing: option.value })}
                className={`bg-surface w-full rounded-lg border p-3 text-left transition-colors ${
                  selected
                    ? "border-accent border-2"
                    : "border-line hover:border-line-strong"
                }`}
              >
                <span className="text-muted block font-mono text-[10px] tracking-[0.12em] uppercase">
                  {option.label}
                </span>
                <span
                  className="text-ink mt-2 block text-2xl"
                  style={{ fontFamily: option.family }}
                >
                  Aa Bb 123
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-ink font-semibold">Color set</h2>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {COLOR_FIELDS.map((field) => (
            <label key={field.key} className="min-w-0 text-center">
              <input
                type="color"
                value={colorInputValue(style[field.key])}
                onChange={(event) =>
                  onChange({ [field.key]: event.target.value })
                }
                className="border-line bg-surface h-12 w-full cursor-pointer rounded-md border p-1"
              />
              <span className="text-muted mt-1.5 block truncate font-mono text-[9px] tracking-[0.12em] uppercase">
                {field.label}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-ink font-semibold">Corner radius</h2>
          <span className="text-muted font-mono text-[10px] tracking-[0.12em]">
            {style.cornerRadius} PX
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={24}
          value={style.cornerRadius}
          onChange={(event) =>
            onChange({ cornerRadius: Number(event.target.value) })
          }
          className="accent-accent mt-3 w-full"
        />
        <div className="text-muted mt-1 flex justify-between font-mono text-[9px] tracking-[0.12em] uppercase">
          <span>Sharp</span>
          <span>Round</span>
        </div>
      </section>

      <section>
        <h2 className="text-ink font-semibold">Motion level</h2>
        <div className="border-line bg-canvas mt-3 grid grid-cols-3 rounded-lg border p-1">
          {(["none", "subtle", "full"] as const).map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={style.motionLevel === level}
              onClick={() => onChange({ motionLevel: level })}
              className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                style.motionLevel === level
                  ? "bg-raised text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              {level === "none"
                ? "None"
                : level === "subtle"
                  ? "Subtle"
                  : "Full"}
            </button>
          ))}
        </div>
        <p className="text-muted mt-2 text-xs">
          Every option should earn its place.
        </p>
      </section>
    </div>
  );
}
