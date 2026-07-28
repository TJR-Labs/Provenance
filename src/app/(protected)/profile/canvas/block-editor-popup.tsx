"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { safeExternalUrl } from "~/app/safe-external-url";
import { uploadFileDirect } from "~/lib/direct-upload";
import { isAllowedEmbedUrl } from "~/lib/site-style";
import type { EditorBlock } from "./site-editor";

type PopupAnchor = { left: number; top: number; bottom: number };
type PopupPosition = { left: number; top: number; ready: boolean };

type BlockEditorPopupProps = {
  block: EditorBlock;
  anchor: PopupAnchor;
  onSave: (patch: Partial<EditorBlock>) => void;
  onCancel: () => void;
};

const inputClass =
  "border-line-strong bg-canvas text-ink placeholder:text-faint focus:border-accent mt-2 block w-full rounded-md border px-3 py-2 text-sm outline-none";

function Actions({
  onCancel,
  disabled,
}: {
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        type="submit"
        disabled={disabled}
        className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
      >
        Save block
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="text-muted hover:text-ink text-sm font-medium transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="text-danger mt-2 text-sm break-words">
      {error}
    </p>
  ) : null;
}

function TextEditor({ block, onSave, onCancel }: BlockEditorPopupProps) {
  const [content, setContent] = useState(block.textContent ?? "");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!content.trim()) {
      setError("Add some text before saving.");
      return;
    }
    onSave({ textContent: content });
  }

  return (
    <form onSubmit={submit}>
      <label className="text-ink block text-sm font-medium">
        Text
        <textarea
          data-popup-initial-focus
          rows={9}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Write plain text or simple HTML."
          className={inputClass}
        />
      </label>
      <p className="text-muted mt-2 text-xs">
        Basic emphasis, lists, and links are sanitized when the draft saves.
      </p>
      <ErrorMessage error={error} />
      <Actions onCancel={onCancel} />
    </form>
  );
}

function ImageEditor({ block, onSave, onCancel }: BlockEditorPopupProps) {
  const [imageUrl, setImageUrl] = useState(block.imageUrl ?? "");
  const [resourceId, setResourceId] = useState(block.imageResourceId ?? "");
  const [caption, setCaption] = useState(block.imageCaption ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const result = await uploadFileDirect(file, "canvas-resource");
      if (!result.resource)
        throw new Error("Upload did not create a resource.");
      setImageUrl(result.url);
      setResourceId(result.resource.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!imageUrl || !resourceId) {
          setError("Upload an image before saving.");
          return;
        }
        onSave({
          imageUrl,
          imageResourceId: resourceId,
          imageCaption: caption.trim(),
        });
      }}
    >
      <label className="border-line-strong text-muted block rounded-md border border-dashed p-4 text-sm font-medium">
        {uploading ? "Uploading…" : imageUrl ? "Replace image" : "Upload image"}
        <input
          data-popup-initial-focus
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
          className="text-muted file:bg-raised file:text-ink mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
      </label>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="bg-raised mt-3 max-h-48 w-full rounded-md object-contain"
        />
      ) : null}
      <label className="text-ink mt-3 block text-sm font-medium">
        Caption <span className="text-faint font-normal">(optional)</span>
        <input
          value={caption}
          maxLength={300}
          onChange={(event) => setCaption(event.target.value)}
          className={inputClass}
        />
      </label>
      <ErrorMessage error={error} />
      <Actions onCancel={onCancel} disabled={uploading} />
    </form>
  );
}

type GalleryImage = NonNullable<EditorBlock["galleryImages"]>[number];

function GalleryEditor({ block, onSave, onCancel }: BlockEditorPopupProps) {
  const [images, setImages] = useState<GalleryImage[]>(
    block.galleryImages ?? [],
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    if (images.length >= 20) return;
    setUploading(true);
    setError("");
    try {
      const result = await uploadFileDirect(file, "canvas-resource");
      if (!result.resource)
        throw new Error("Upload did not create a resource.");
      setImages((current) => [
        ...current,
        { url: result.url, resourceId: result.resource!.id, caption: null },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ galleryImages: images });
      }}
    >
      <ol className="space-y-2">
        {images.map((image, index) => (
          <li
            key={`${image.resourceId ?? image.url}-${index}`}
            className="border-line bg-canvas flex items-center gap-3 rounded-md border p-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt=""
              className="bg-raised size-12 rounded object-cover"
            />
            <input
              aria-label={`Caption for image ${index + 1}`}
              value={image.caption ?? ""}
              placeholder="Optional caption"
              onChange={(event) =>
                setImages((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, caption: event.target.value }
                      : item,
                  ),
                )
              }
              className={`${inputClass} mt-0 min-w-0 flex-1`}
            />
            <button
              type="button"
              aria-label={`Remove image ${index + 1}`}
              onClick={() =>
                setImages((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index),
                )
              }
              className="text-danger hover:bg-raised rounded px-2 py-1 text-sm"
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      <label className="border-line-strong text-muted mt-3 block rounded-md border border-dashed p-3 text-sm font-medium">
        {uploading ? "Uploading…" : "Add image"}
        <input
          data-popup-initial-focus
          type="file"
          accept="image/*"
          disabled={uploading || images.length >= 20}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
          className="text-muted file:bg-raised file:text-ink mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5"
        />
      </label>
      <p className="text-muted mt-2 text-xs">{images.length} / 20 images</p>
      <ErrorMessage error={error} />
      <Actions onCancel={onCancel} disabled={uploading} />
    </form>
  );
}

function EmbedEditor({ block, onSave, onCancel }: BlockEditorPopupProps) {
  const [url, setUrl] = useState(block.embedUrl ?? "");
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const next = url.trim();
        if (!isAllowedEmbedUrl(next)) {
          setError(
            "Use an allowed HTTPS embed URL from YouTube, Vimeo, CodePen, Figma, Spotify, or Loom.",
          );
          return;
        }
        onSave({ embedUrl: next });
      }}
    >
      <label className="text-ink block text-sm font-medium">
        Embed URL
        <input
          data-popup-initial-focus
          type="url"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setError("");
          }}
          placeholder="https://www.youtube.com/embed/…"
          className={inputClass}
        />
      </label>
      <ErrorMessage error={error} />
      <Actions onCancel={onCancel} />
    </form>
  );
}

function CodeEditor({ block, onSave, onCancel }: BlockEditorPopupProps) {
  const [content, setContent] = useState(block.codeContent ?? "");
  const [language, setLanguage] = useState(block.codeLanguage ?? "");
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!content.trim()) {
          setError("Add code before saving.");
          return;
        }
        onSave({
          codeContent: content,
          codeLanguage: language.trim(),
        });
      }}
    >
      <label className="text-ink block text-sm font-medium">
        Language label
        <input
          data-popup-initial-focus
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          placeholder="TypeScript"
          className={inputClass}
        />
      </label>
      <label className="text-ink mt-3 block text-sm font-medium">
        Code
        <textarea
          rows={10}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          spellCheck={false}
          className={`${inputClass} font-mono`}
        />
      </label>
      <ErrorMessage error={error} />
      <Actions onCancel={onCancel} />
    </form>
  );
}

function QuoteEditor({ block, onSave, onCancel }: BlockEditorPopupProps) {
  const [text, setText] = useState(block.quoteText ?? "");
  const [attribution, setAttribution] = useState(block.quoteAttribution ?? "");
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) {
          setError("Add quote text before saving.");
          return;
        }
        onSave({
          quoteText: text,
          quoteAttribution: attribution.trim(),
        });
      }}
    >
      <label className="text-ink block text-sm font-medium">
        Quote
        <textarea
          data-popup-initial-focus
          rows={7}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="text-ink mt-3 block text-sm font-medium">
        Attribution <span className="text-faint font-normal">(optional)</span>
        <input
          value={attribution}
          onChange={(event) => setAttribution(event.target.value)}
          className={inputClass}
        />
      </label>
      <ErrorMessage error={error} />
      <Actions onCancel={onCancel} />
    </form>
  );
}

function LinkEditor({ block, onSave, onCancel }: BlockEditorPopupProps) {
  const [label, setLabel] = useState(block.linkLabel ?? "");
  const [url, setUrl] = useState(block.linkUrl ?? "");
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const nextLabel = label.trim();
        const nextUrl = safeExternalUrl(url.trim());
        if (!nextLabel) {
          setError("Add a label for the link.");
          return;
        }
        if (!nextUrl) {
          setError("Enter a valid http(s) URL.");
          return;
        }
        onSave({ linkLabel: nextLabel, linkUrl: nextUrl });
      }}
    >
      <label className="text-ink block text-sm font-medium">
        Label
        <input
          data-popup-initial-focus
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="text-ink mt-3 block text-sm font-medium">
        URL
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com"
          className={inputClass}
        />
      </label>
      <ErrorMessage error={error} />
      <Actions onCancel={onCancel} />
    </form>
  );
}

const BLOCK_LABELS: Record<EditorBlock["type"], string> = {
  TEXT: "Text",
  IMAGE: "Image",
  GALLERY: "Gallery",
  EMBED: "Embed",
  CODE: "Code",
  QUOTE: "Quote",
  PROJECT: "Project",
  LINK: "Link",
};

export function BlockEditorPopup(props: BlockEditorPopupProps) {
  const { block, anchor, onCancel } = props;
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PopupPosition>({
    left: anchor.left,
    top: anchor.top,
    ready: false,
  });

  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;
    const rect = popup.getBoundingClientRect();
    const margin = 8;
    const gap = 8;
    const left = Math.min(
      Math.max(anchor.left, margin),
      Math.max(margin, window.innerWidth - rect.width - margin),
    );
    const above = anchor.top - rect.height - gap;
    const top = Math.min(
      Math.max(above >= margin ? above : anchor.bottom + gap, margin),
      Math.max(margin, window.innerHeight - rect.height - margin),
    );
    setPosition({ left, top, ready: true });
  }, [anchor]);

  useEffect(() => {
    const popup = popupRef.current;
    const initial =
      popup?.querySelector<HTMLElement>("[data-popup-initial-focus]") ??
      popup?.querySelector<HTMLElement>("button, input, textarea");
    initial?.focus();

    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !popup) return;
      const focusable = [
        ...popup.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [onCancel]);

  return (
    <div
      ref={popupRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${BLOCK_LABELS[block.type]}`}
      className="border-line-strong bg-surface fixed z-[70] max-h-[calc(100vh-1rem)] w-[min(30rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border p-4 shadow-xl"
      style={{
        left: position.left,
        top: position.top,
        visibility: position.ready ? "visible" : "hidden",
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-ink font-display text-lg font-semibold">
          Edit {BLOCK_LABELS[block.type]}
        </h2>
        <button
          type="button"
          aria-label="Close block editor"
          onClick={onCancel}
          className="text-muted hover:bg-raised hover:text-ink rounded px-2 py-1 text-sm"
        >
          Close
        </button>
      </div>

      {block.type === "TEXT" ? (
        <TextEditor {...props} />
      ) : block.type === "IMAGE" ? (
        <ImageEditor {...props} />
      ) : block.type === "GALLERY" ? (
        <GalleryEditor {...props} />
      ) : block.type === "EMBED" ? (
        <EmbedEditor {...props} />
      ) : block.type === "CODE" ? (
        <CodeEditor {...props} />
      ) : block.type === "QUOTE" ? (
        <QuoteEditor {...props} />
      ) : block.type === "LINK" ? (
        <LinkEditor {...props} />
      ) : null}
    </div>
  );
}
