"use client";

import { useState } from "react";

type Section = "about" | "projects" | "links";

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
      className="mt-8 space-y-6 rounded-xl border border-slate-800 bg-slate-900 p-6 sm:p-8"
    >
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-200">
          Profile updated.
        </p>
      ) : null}
      <label className="block text-sm font-medium text-slate-200">
        Display name
        <input
          name="displayName"
          required
          defaultValue={initial.displayName}
          className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
        />
      </label>
      <label className="block text-sm font-medium text-slate-200">
        Bio
        <textarea
          name="bio"
          rows={6}
          defaultValue={initial.bio}
          className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
        />
      </label>
      <label className="block text-sm font-medium text-slate-200">
        School or affiliation
        <input
          name="school"
          defaultValue={initial.school}
          className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
        />
      </label>

      <div>
        <label className="block text-sm font-medium text-slate-200">
          Profile picture
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={uploading}
            className="mt-2 block w-full"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </label>
        {avatarUrl ? (
          <p className="mt-2 truncate text-sm text-slate-400">{avatarUrl}</p>
        ) : null}
        {uploadError ? (
          <p role="alert" className="mt-2 text-sm text-red-300">
            {uploadError}
          </p>
        ) : null}
        <input type="hidden" name="avatarUrl" value={avatarUrl} />
      </div>

      <label className="block text-sm font-medium text-slate-200">
        External links{" "}
        <span className="text-slate-500">
          (one per line: Label | https://url)
        </span>
        <textarea
          name="links"
          rows={5}
          defaultValue={initial.links}
          className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
        />
      </label>
      <label className="block text-sm font-medium text-slate-200">
        Theme
        <select
          name="theme"
          defaultValue={initial.theme}
          className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
        >
          <option value="default">Default dark</option>
          <option value="paper">Paper light</option>
          <option value="studio">Indigo studio</option>
        </select>
      </label>

      <fieldset>
        <legend className="text-sm font-medium text-slate-200">
          Profile sections
        </legend>
        <p className="mt-1 text-sm text-slate-500">
          Choose which sections appear and reorder them.
        </p>
        <ol className="mt-3 space-y-2">
          {sections.map((section, index) => (
            <li
              key={section}
              className="flex items-center gap-3 rounded-md bg-slate-950 px-3 py-2"
            >
              <span className="flex-1 text-slate-200">{labels[section]}</span>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="text-sm text-sky-300 disabled:text-slate-700"
              >
                Up
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === sections.length - 1}
                className="text-sm text-sky-300 disabled:text-slate-700"
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
                className="text-sm text-red-300"
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
                className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300"
              >
                Show {labels[section]}
              </button>
            ))}
        </div>
        <input type="hidden" name="sections" value={sections.join(",")} />
      </fieldset>

      <label className="block text-sm font-medium text-slate-200">
        Custom CSS
        <textarea
          name="customCss"
          rows={10}
          defaultValue={initial.customCss}
          spellCheck={false}
          className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
        />
        <span className="mt-2 block text-xs text-slate-500">
          CSS is automatically scoped to your profile. Imports and external
          resources are removed.
        </span>
      </label>
      <button
        disabled={uploading}
        className="rounded-md bg-sky-400 px-5 py-2.5 font-semibold text-slate-950 hover:bg-sky-300 disabled:opacity-50"
      >
        Save profile
      </button>
    </form>
  );
}
