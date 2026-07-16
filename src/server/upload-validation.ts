export const ALLOWED_UPLOAD_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export class UploadValidationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UploadValidationError";
  }
}

export function validateUpload(file: Pick<File, "size" | "type">) {
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
    throw new UploadValidationError(
      "Unsupported file type. Upload a PNG, JPEG, WebP, GIF, MP4, or WebM file.",
      415,
    );
  }

  const maximum = file.type.startsWith("video/")
    ? MAX_VIDEO_BYTES
    : MAX_IMAGE_BYTES;
  if (file.size > maximum) {
    const limit = maximum === MAX_VIDEO_BYTES ? "50MB" : "10MB";
    throw new UploadValidationError(
      `File is too large. The limit for this file type is ${limit}.`,
      413,
    );
  }
}
