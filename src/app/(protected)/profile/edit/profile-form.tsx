"use client";

import Link from "next/link";
import { useState } from "react";

import { api } from "~/trpc/react";

type Section = "about" | "projects" | "links";
type LayoutMode = "GRID" | "CANVAS";

type ProfileFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
  success?: boolean;
  initial: {
    displayName: string;
    bio: string;
    school: string;
    avatarUrl: string;
    links: string;
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
  const setMode = api.canvas.setMode.useMutation();

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

      <label className="text-ink block text-sm font-medium">
        External links{" "}
        <span className="text-faint font-normal">
          (one per line: Label | https://url)
        </span>
        <textarea
          name="links"
          rows={5}
          defaultValue={initial.links}
          className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
        />
      </label>
      <label className="text-ink block text-sm font-medium">
        Theme
        <select
          name="theme"
          defaultValue={initial.theme}
          className="border-line-strong bg-canvas text-ink mt-2 block w-full rounded-md border px-3 py-2"
        >
          <option value="default">Default dark</option>
          <option value="paper">Paper light</option>
          <option value="studio">Indigo studio</option>
        </select>
      </label>

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

      <fieldset>
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

      <label className="text-ink block text-sm font-medium">
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
          resources are removed.
        </span>
      </label>
      <button
        disabled={uploading}
        className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-5 py-2.5 font-semibold transition-colors disabled:opacity-50"
      >
        Save profile
      </button>
    </form>
  );
}
