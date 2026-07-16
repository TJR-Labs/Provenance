/* eslint-disable @next/next/no-img-element */

import { safeExternalUrl } from "~/app/safe-external-url";

type Media = { url: string; mimeType: string | null };

function mediaType(media: Media) {
  if (media.mimeType?.startsWith("image/")) return "image";
  if (media.mimeType?.startsWith("video/")) return "video";
  if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(media.url)) return "image";
  if (/\.(mp4|webm)(\?|$)/i.test(media.url)) return "video";
  return "link";
}

export function ProjectMedia({
  media,
  title,
}: {
  media: Media;
  title: string;
}) {
  const type = mediaType(media);
  if (type === "image") {
    // User media has arbitrary Supabase/external hosts, so next/image cannot whitelist it.
    return (
      <img src={media.url} alt={title} className="h-full w-full object-cover" />
    );
  }
  if (type === "video") {
    return (
      <video
        src={media.url}
        controls
        className="h-full w-full object-contain"
      />
    );
  }
  const href = safeExternalUrl(media.url);
  if (!href) {
    return (
      <span className="flex h-full min-h-32 items-center justify-center bg-slate-950 p-6 text-center break-all text-slate-400">
        External media: {media.url}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex h-full min-h-32 items-center justify-center bg-slate-950 p-6 text-center break-all text-sky-300 underline"
    >
      Open external media
    </a>
  );
}
