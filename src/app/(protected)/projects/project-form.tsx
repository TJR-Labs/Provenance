"use client";

import { useState } from "react";

type MediaItem = {
  kind: "UPLOAD" | "EXTERNAL";
  url: string;
  mimeType: string | null;
};

type ProjectFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  categories: { value: string; label: string }[];
  error?: string;
  initial?: {
    title: string;
    description: string;
    category: string;
    hashtags: string[];
    links: string[];
    layout: string;
    media: MediaItem[];
  };
};

export function ProjectForm({
  action,
  categories,
  error,
  initial,
}: ProjectFormProps) {
  const [media, setMedia] = useState<MediaItem[]>(initial?.media ?? []);
  const [externalUrl, setExternalUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function upload(file: File) {
    setUploading(true);
    setUploadError("");
    const body = new FormData();
    body.set("file", file);
    try {
      const response = await fetch("/api/upload", { method: "POST", body });
      const result = (await response.json()) as {
        url?: string;
        mimeType?: string;
        error?: string;
      };
      if (!response.ok || !result.url)
        throw new Error(result.error ?? "Upload failed.");
      setMedia((items) => [
        ...items,
        {
          kind: "UPLOAD",
          url: result.url!,
          mimeType: result.mimeType ?? file.type,
        },
      ]);
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
      <label className="block text-sm font-medium text-slate-200">
        Title
        <input
          name="title"
          required
          maxLength={160}
          defaultValue={initial?.title}
          className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
        />
      </label>
      <label className="block text-sm font-medium text-slate-200">
        Description
        <textarea
          name="description"
          required
          rows={8}
          defaultValue={initial?.description}
          className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-200">
          Category
          <select
            name="category"
            required
            defaultValue={initial?.category ?? categories[0]?.value}
            className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            {categories.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-200">
          Display layout
          <select
            name="layout"
            defaultValue={initial?.layout ?? "default"}
            className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            <option value="default">Default</option>
            <option value="gallery">Gallery</option>
            <option value="writeup">Write-up</option>
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-200">
        Hashtags{" "}
        <span className="text-slate-500">(comma or line separated)</span>
        <textarea
          name="hashtags"
          rows={3}
          defaultValue={initial?.hashtags.join(", ")}
          className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
        />
      </label>
      <label className="block text-sm font-medium text-slate-200">
        Project links <span className="text-slate-500">(one URL per line)</span>
        <textarea
          name="links"
          rows={3}
          defaultValue={initial?.links.join("\n")}
          className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
        />
      </label>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-white">
          Images and videos
        </legend>
        <p className="text-sm text-slate-400">
          Media is optional. Mix uploads and external links in any order.
        </p>
        <label className="block rounded-md border border-dashed border-slate-700 p-4 text-sm text-slate-300">
          {uploading ? "Uploading…" : "Upload an image or video"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
            disabled={uploading}
            className="mt-2 block w-full"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </label>
        {uploadError ? (
          <p role="alert" className="text-sm text-red-300">
            {uploadError}
          </p>
        ) : null}
        <div className="flex gap-2">
          <input
            value={externalUrl}
            onChange={(event) => setExternalUrl(event.target.value)}
            placeholder="External image, video, or YouTube URL"
            className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
          <button
            type="button"
            onClick={() => {
              if (!externalUrl.trim()) return;
              setMedia((items) => [
                ...items,
                { kind: "EXTERNAL", url: externalUrl.trim(), mimeType: null },
              ]);
              setExternalUrl("");
            }}
            className="rounded-md border border-slate-600 px-4 py-2 text-white hover:bg-slate-800"
          >
            Add
          </button>
        </div>
        {media.length ? (
          <ol className="space-y-2">
            {media.map((item, index) => (
              <li
                key={`${item.kind}-${item.url}-${index}`}
                className="flex items-center gap-3 rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-300"
              >
                <span className="rounded bg-slate-800 px-2 py-1 text-xs">
                  {item.kind}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.url}</span>
                <button
                  type="button"
                  onClick={() =>
                    setMedia((items) =>
                      items.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  className="text-red-300"
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">
            No media added. The project will use the text-only state.
          </p>
        )}
        <input type="hidden" name="media" value={JSON.stringify(media)} />
      </fieldset>

      <button
        disabled={uploading}
        className="rounded-md bg-sky-400 px-5 py-2.5 font-semibold text-slate-950 hover:bg-sky-300 disabled:opacity-50"
      >
        Save project
      </button>
    </form>
  );
}
