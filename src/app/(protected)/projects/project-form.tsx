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
      <label className="text-ink block text-sm font-medium">
        Title
        <input
          name="title"
          required
          maxLength={160}
          defaultValue={initial?.title}
          className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
        />
      </label>
      <label className="text-ink block text-sm font-medium">
        Description
        <textarea
          name="description"
          required
          rows={8}
          defaultValue={initial?.description}
          className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-ink block text-sm font-medium">
          Category
          <select
            name="category"
            required
            defaultValue={initial?.category ?? categories[0]?.value}
            className="border-line-strong bg-canvas text-ink mt-2 block w-full rounded-md border px-3 py-2"
          >
            {categories.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-ink block text-sm font-medium">
          Display layout
          <select
            name="layout"
            defaultValue={initial?.layout ?? "default"}
            className="border-line-strong bg-canvas text-ink mt-2 block w-full rounded-md border px-3 py-2"
          >
            <option value="default">Default</option>
            <option value="gallery">Gallery</option>
            <option value="writeup">Write-up</option>
          </select>
        </label>
      </div>
      <label className="text-ink block text-sm font-medium">
        Hashtags{" "}
        <span className="text-faint font-normal">
          (comma or line separated)
        </span>
        <textarea
          name="hashtags"
          rows={3}
          defaultValue={initial?.hashtags.join(", ")}
          className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
        />
      </label>
      <label className="text-ink block text-sm font-medium">
        Project links{" "}
        <span className="text-faint font-normal">(one URL per line)</span>
        <textarea
          name="links"
          rows={3}
          defaultValue={initial?.links.join("\n")}
          className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
        />
      </label>

      <fieldset className="space-y-4">
        <legend className="font-display text-ink text-lg font-semibold">
          Images and videos
        </legend>
        <p className="text-muted text-sm">
          Media is optional. Mix uploads and external links in any order.
        </p>
        <label className="border-line-strong text-muted block rounded-md border border-dashed p-4 text-sm font-medium">
          {uploading ? "Uploading…" : "Upload an image or video"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
            disabled={uploading}
            className="text-muted file:bg-raised file:text-ink mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </label>
        {uploadError ? (
          <p role="alert" className="text-danger text-sm break-words">
            {uploadError}
          </p>
        ) : null}
        <div className="flex gap-2">
          <input
            value={externalUrl}
            onChange={(event) => setExternalUrl(event.target.value)}
            placeholder="External image, video, or YouTube URL"
            className="border-line-strong bg-canvas text-ink placeholder:text-faint focus:border-accent min-w-0 flex-1 rounded-md border px-3 py-2"
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
            className="border-line-strong text-ink hover:bg-raised rounded-md border px-4 py-2 font-medium transition-colors"
          >
            Add
          </button>
        </div>
        {media.length ? (
          <ol className="space-y-2">
            {media.map((item, index) => (
              <li
                key={`${item.kind}-${item.url}-${index}`}
                className="border-line bg-canvas text-muted flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <span className="bg-raised text-muted rounded px-2 py-1 font-mono text-xs tracking-wide uppercase">
                  {item.kind}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {item.url}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setMedia((items) =>
                      items.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  className="text-danger font-medium underline-offset-4 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-faint text-sm">
            No media added. The project will use the text-only state.
          </p>
        )}
        <input type="hidden" name="media" value={JSON.stringify(media)} />
      </fieldset>

      <button
        disabled={uploading}
        className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-5 py-2.5 font-semibold transition-colors disabled:opacity-50"
      >
        Save project
      </button>
    </form>
  );
}
