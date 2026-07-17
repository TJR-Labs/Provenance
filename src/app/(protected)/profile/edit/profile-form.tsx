"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { safeExternalUrl } from "~/app/safe-external-url";
import { api } from "~/trpc/react";

type Section = "about" | "projects" | "links";
type LayoutMode = "GRID" | "CANVAS";
type ProfileLink = { label: string; url: string };
type LinkRow = { id: number; label: string; url: string };

type ProfileFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
  success?: boolean;
  initial: {
    displayName: string;
    bio: string;
    school: string;
    avatarUrl: string;
    links: ProfileLink[];
    theme: string;
    sections: Section[];
    layoutMode: LayoutMode;
    customCss: string;
  };
};

const labels: Record<Section, string> = {
  about: "About",
  projects: "Projects",
  links: "Links",
};

// Fixed representative colors per profile theme (from the .profile-theme-*
// token sets in globals.css). Hard-coded hex so the swatches render
// identically regardless of the app's light/dark viewer theme.
const themeOptions: {
  value: string;
  label: string;
  bg: string;
  accent: string;
  ink: string;
}[] = [
  {
    value: "default",
    label: "Default dark",
    bg: "#131714",
    accent: "#5fc694",
    ink: "#e9e7db",
  },
  {
    value: "paper",
    label: "Paper light",
    bg: "#f6f1e6",
    accent: "#7a4a1e",
    ink: "#262218",
  },
  {
    value: "studio",
    label: "Indigo studio",
    bg: "#171732",
    accent: "#a5a1f0",
    ink: "#e9e9f7",
  },
];

const linkInputClass =
  "border-line-strong bg-canvas text-ink placeholder:text-faint focus:border-accent mt-2 block w-full rounded-md border px-3 py-2 text-sm";

export function ProfileForm({
  action,
  error,
  success,
  initial,
}: ProfileFormProps) {
  const [sections, setSections] = useState(initial.sections);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [layoutMode, setLayoutMode] = useState(initial.layoutMode);
  const [theme, setTheme] = useState(initial.theme);
  const setMode = api.canvas.setMode.useMutation();

  // Editable Label+URL rows replace the old pipe-delimited textarea. Rows
  // carry a stable id so React keys and per-row errors survive reordering.
  const [linkRows, setLinkRows] = useState<LinkRow[]>(() =>
    initial.links.map((link, index) => ({
      id: index,
      label: link.label,
      url: link.url,
    })),
  );
  const [linkErrors, setLinkErrors] = useState<Record<number, string>>({});
  const nextRowId = useRef(initial.links.length);

  // Custom CSS is hidden behind an advanced disclosure. It opens by default
  // only when the user already has saved CSS, so their own customization is
  // never hidden from them. Tracked in state so toggling survives re-renders.
  const [cssOpen, setCssOpen] = useState(Boolean(initial.customCss));

  function addLinkRow() {
    setLinkRows((rows) => [
      ...rows,
      { id: nextRowId.current++, label: "", url: "" },
    ]);
  }

  function removeLinkRow(id: number) {
    setLinkRows((rows) => rows.filter((row) => row.id !== id));
    setLinkErrors((errors) => {
      const next = { ...errors };
      delete next[id];
      return next;
    });
  }

  function updateLinkRow(id: number, patch: Partial<Omit<LinkRow, "id">>) {
    setLinkRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  // Serialize rows into the pipe-delimited format the server action already
  // parses, so actions.ts is unchanged. Fully-empty rows are dropped.
  const serializedLinks = linkRows
    .filter((row) => row.label.trim() || row.url.trim())
    .map((row) => `${row.label.trim()} | ${row.url.trim()}`)
    .join("\n");

  // Validate every non-empty row via safeExternalUrl before allowing save,
  // mirroring the canvas LinkPanel. Each bad row gets its own inline error;
  // valid rows keep their values so one bad row does not discard the others.
  function validateLinks(event: React.FormEvent<HTMLFormElement>) {
    const errors: Record<number, string> = {};
    for (const row of linkRows) {
      const label = row.label.trim();
      const url = row.url.trim();
      if (!label && !url) continue;
      if (!label) {
        errors[row.id] = "Add a label for the link.";
        continue;
      }
      if (!safeExternalUrl(url)) {
        errors[row.id] = "Enter a valid http(s) URL.";
      }
    }
    if (Object.keys(errors).length > 0) {
      event.preventDefault();
      setLinkErrors(errors);
      return;
    }
    setLinkErrors({});
  }

  // Layout mode is its own immediate action (tRPC mutation), separate from
  // the server-action form submit that saves the rest of the profile.
  function chooseLayoutMode(mode: LayoutMode) {
    if (mode === layoutMode || setMode.isPending) return;
    const previous = layoutMode;
    setLayoutMode(mode);
    setMode.mutate({ mode }, { onError: () => setLayoutMode(previous) });
  }

  function move(index: number, direction: -1 | 1) {
    setSections((items) => {
      const target = index + direction;
      if (target < 0 || target >= items.length) return items;
      const next = [...items];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function upload(file: File) {
    setUploading(true);
    setUploadError("");
    const formData = new FormData();
    formData.set("file", file);
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.url)
        throw new Error(result.error ?? "Upload failed.");
      setAvatarUrl(result.url);
    } catch (caught) {
      setUploadError(
        caught instanceof Error ? caught.message : "Upload failed.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      action={action}
      onSubmit={validateLinks}
      className="border-line bg-surface mt-8 space-y-6 rounded-lg border p-6 sm:p-8"
    >
      {error ? (
        <p
          role="alert"
          className="border-danger-line bg-danger-surface text-danger rounded-md border px-4 py-3 text-sm break-words"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="border-success-line bg-success-surface text-success rounded-md border px-4 py-3 text-sm">
          Profile updated.
        </p>
      ) : null}
      <label className="text-ink block text-sm font-medium">
        Display name
        <input
          name="displayName"
          required
          defaultValue={initial.displayName}
          className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
        />
      </label>
      <label className="text-ink block text-sm font-medium">
        Bio
        <textarea
          name="bio"
          rows={6}
          defaultValue={initial.bio}
          className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
        />
      </label>
      <label className="text-ink block text-sm font-medium">
        School or affiliation
        <input
          name="school"
          defaultValue={initial.school}
          className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
        />
      </label>

      <div>
        <label className="text-ink block text-sm font-medium">
          Profile picture
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={uploading}
            className="text-muted file:bg-raised file:text-ink mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </label>
        {avatarUrl ? (
          <p className="text-muted mt-2 truncate font-mono text-xs">
            {avatarUrl}
          </p>
        ) : null}
        {uploadError ? (
          <p role="alert" className="text-danger mt-2 text-sm break-words">
            {uploadError}
          </p>
        ) : null}
        <input type="hidden" name="avatarUrl" value={avatarUrl} />
      </div>

      <fieldset>
        <legend className="text-ink text-sm font-medium">External links</legend>
        <p className="text-muted mt-1 text-sm">
          Add links to your work elsewhere. Each needs a label and an http(s)
          URL.
        </p>
        <ul className="mt-3 space-y-3">
          {linkRows.map((row) => (
            <li key={row.id} className="border-line rounded-md border p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="text-ink block text-sm font-medium">
                  Label
                  <input
                    value={row.label}
                    maxLength={40}
                    onChange={(event) =>
                      updateLinkRow(row.id, { label: event.target.value })
                    }
                    className={linkInputClass}
                  />
                </label>
                <label className="text-ink block text-sm font-medium">
                  URL
                  <input
                    value={row.url}
                    placeholder="https://example.com"
                    onChange={(event) =>
                      updateLinkRow(row.id, { url: event.target.value })
                    }
                    className={linkInputClass}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeLinkRow(row.id)}
                  className="text-danger border-line-strong hover:bg-raised h-fit rounded-md border px-3 py-2 text-sm font-medium transition-colors"
                >
                  Remove
                </button>
              </div>
              {linkErrors[row.id] ? (
                <p role="alert" className="text-danger mt-2 text-sm">
                  {linkErrors[row.id]}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addLinkRow}
          className="border-line-strong text-muted hover:bg-raised hover:text-ink mt-3 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          Add link
        </button>
        <input type="hidden" name="links" value={serializedLinks} />
      </fieldset>

      <div>
        <label htmlFor="theme" className="text-ink block text-sm font-medium">
          Theme
        </label>
        <select
          id="theme"
          name="theme"
          value={theme}
          onChange={(event) => setTheme(event.target.value)}
          className="border-line-strong bg-canvas text-ink mt-2 block w-full rounded-md border px-3 py-2"
        >
          {themeOptions.map((option) => (
            <option
              key={option.value}
              value={option.value}
              style={{ backgroundColor: option.bg, color: option.ink }}
            >
              {option.label}
            </option>
          ))}
        </select>
        <div className="mt-3 flex flex-wrap gap-2">
          {themeOptions.map((option) => {
            const selected = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setTheme(option.value)}
                className={
                  selected
                    ? "border-accent bg-raised flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
                    : "border-line-strong hover:bg-raised flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
                }
              >
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                  style={{ backgroundColor: option.bg }}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: option.accent }}
                  />
                </span>
                <span className="text-ink">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <fieldset>
        <legend className="text-ink text-sm font-medium">
          Profile sections
        </legend>
        <p className="text-muted mt-1 text-sm">
          Choose which sections appear and reorder them.
        </p>
        <ol className="mt-3 space-y-2">
          {sections.map((section, index) => (
            <li
              key={section}
              className="border-line bg-canvas flex items-center gap-3 rounded-md border px-3 py-2"
            >
              <span className="text-ink flex-1">{labels[section]}</span>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="text-accent hover:text-accent-strong disabled:text-faint text-sm font-medium transition-colors"
              >
                Up
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === sections.length - 1}
                className="text-accent hover:text-accent-strong disabled:text-faint text-sm font-medium transition-colors"
              >
                Down
              </button>
              <button
                type="button"
                onClick={() =>
                  setSections((items) =>
                    items.filter((item) => item !== section),
                  )
                }
                className="text-danger text-sm font-medium underline-offset-4 hover:underline"
              >
                Hide
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(labels) as Section[])
            .filter((section) => !sections.includes(section))
            .map((section) => (
              <button
                key={section}
                type="button"
                onClick={() => setSections((items) => [...items, section])}
                className="border-line-strong text-muted hover:bg-raised hover:text-ink rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
              >
                Show {labels[section]}
              </button>
            ))}
        </div>
        <input type="hidden" name="sections" value={sections.join(",")} />
      </fieldset>

      <fieldset id="layout-mode">
        <legend className="text-ink text-sm font-medium">Layout mode</legend>
        <p className="text-muted mt-1 text-sm">
          Grid uses the classic sections above. Canvas lets you freely arrange
          your profile. Changes apply immediately.
        </p>
        <div className="mt-3 flex gap-2">
          {(["GRID", "CANVAS"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={layoutMode === mode}
              disabled={setMode.isPending}
              onClick={() => chooseLayoutMode(mode)}
              className={
                layoutMode === mode
                  ? "bg-accent text-on-accent rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  : "border-line-strong text-muted hover:bg-raised hover:text-ink rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
              }
            >
              {mode === "GRID" ? "Grid" : "Canvas"}
            </button>
          ))}
        </div>
        {setMode.isPending ? (
          <p className="text-muted mt-2 text-sm">Switching layout mode…</p>
        ) : null}
        {setMode.isError ? (
          <p role="alert" className="text-danger mt-2 text-sm">
            Could not switch layout mode. Please try again.
          </p>
        ) : null}
        {layoutMode === "CANVAS" ? (
          <Link
            href="/profile/canvas"
            className="text-accent hover:text-accent-strong mt-3 inline-block text-sm font-semibold transition-colors"
          >
            Edit canvas layout →
          </Link>
        ) : null}
      </fieldset>

      <details
        open={cssOpen}
        onToggle={(event) => setCssOpen(event.currentTarget.open)}
        className="border-line rounded-md border p-4"
      >
        <summary className="text-ink cursor-pointer text-sm font-medium">
          Advanced: custom CSS
        </summary>
        <label className="text-ink mt-3 block text-sm font-medium">
          Custom CSS
          <textarea
            name="customCss"
            rows={10}
            defaultValue={initial.customCss}
            spellCheck={false}
            className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2 font-mono text-sm"
          />
          <span className="text-faint mt-2 block text-xs font-normal">
            CSS is automatically scoped to your profile. Imports and external
            resources are removed. Example:{" "}
            <code className="text-muted font-mono">
              .profile-muted {"{ color: #666; }"}
            </code>
          </span>
        </label>
      </details>
      <button
        disabled={uploading}
        className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-5 py-2.5 font-semibold transition-colors disabled:opacity-50"
      >
        Save profile
      </button>
    </form>
  );
}
