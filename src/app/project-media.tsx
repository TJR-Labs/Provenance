"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

import { safeExternalUrl } from "~/app/safe-external-url";

type Media = { url: string; mimeType: string | null };

function mediaType(media: Media) {
  if (media.mimeType?.startsWith("image/")) return "image";
  if (media.mimeType?.startsWith("video/")) return "video";
  if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(media.url)) return "image";
  if (/\.(mp4|webm)(\?|$)/i.test(media.url)) return "video";
  return "link";
}

function MediaFallback({ label }: { label: string }) {
  return (
    <span className="bg-raised text-muted flex h-full min-h-32 w-full items-center justify-center p-6 text-center font-mono text-xs tracking-[0.14em] uppercase">
      {label}
    </span>
  );
}

export function ProjectMedia({
  media,
  title,
}: {
  media: Media;
  title: string;
}) {
  const [failed, setFailed] = useState(false);
  const type = mediaType(media);
  if (type === "image") {
    if (failed) return <MediaFallback label="Image unavailable" />;
    // User media has arbitrary Supabase/external hosts, so next/image cannot whitelist it.
    return (
      <img
        src={media.url}
        alt={title}
        loading="lazy"
        onError={() => setFailed(true)}
        className="bg-raised h-full w-full object-cover"
      />
    );
  }
  if (type === "video") {
    if (failed) return <MediaFallback label="Video unavailable" />;
    return (
      <video
        src={media.url}
        controls
        onError={() => setFailed(true)}
        className="bg-raised h-full w-full object-contain"
      />
    );
  }
  const href = safeExternalUrl(media.url);
  if (!href) {
    return (
      <span className="bg-raised text-muted flex h-full min-h-32 items-center justify-center p-6 text-center break-all">
        External media: {media.url}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="bg-raised text-accent hover:text-accent-strong flex h-full min-h-32 items-center justify-center p-6 text-center break-all underline underline-offset-4 transition-colors"
    >
      Open external media
    </a>
  );
}
