export function classifyProjectMedia(media: {
  url: string;
  mimeType: string | null;
}): "image" | "video" | "link" {
  if (media.mimeType?.startsWith("image/")) return "image";
  if (media.mimeType?.startsWith("video/")) return "video";
  if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(media.url)) return "image";
  if (/\.(mp4|webm)(\?|$)/i.test(media.url)) return "video";
  return "link";
}
