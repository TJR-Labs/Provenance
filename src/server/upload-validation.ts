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

// Fixed mapping from validated MIME type to stored file extension. The
// storage path extension must come from this map (derived from the
// content-sniffed, validated type), never from the user-supplied filename.
export const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

const UNSUPPORTED_TYPE_MESSAGE =
  "Unsupported file type. Upload a PNG, JPEG, WebP, GIF, MP4, or WebM file.";

// Number of leading bytes read to sniff the file's real content type. All six
// allowed signatures are found within the first 12 bytes; 32 leaves margin
// without meaningfully buffering large files.
const SNIFF_BYTES = 32;

function matchesAsciiAt(bytes: Uint8Array, offset: number, ascii: string) {
  if (bytes.length < offset + ascii.length) return false;
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Sniffs the real content type of a file from its magic bytes/signature.
 * Returns the detected MIME type, or null if the bytes don't match any
 * allowed type's signature (including truncated/empty input).
 */
export function detectContentType(bytes: Uint8Array): string | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  // GIF: "GIF87a" or "GIF89a"
  if (
    matchesAsciiAt(bytes, 0, "GIF87a") ||
    matchesAsciiAt(bytes, 0, "GIF89a")
  ) {
    return "image/gif";
  }

  // WebP: "RIFF" .... "WEBP"
  if (matchesAsciiAt(bytes, 0, "RIFF") && matchesAsciiAt(bytes, 8, "WEBP")) {
    return "image/webp";
  }

  // MP4 (ISO base media file format): 4-byte box size, then "ftyp"
  if (matchesAsciiAt(bytes, 4, "ftyp")) {
    return "video/mp4";
  }

  // WebM (EBML/Matroska header): 1A 45 DF A3
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }

  return null;
}

export class UploadValidationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UploadValidationError";
  }
}

export async function validateUpload(
  file: Pick<File, "size" | "type" | "slice">,
) {
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
    throw new UploadValidationError(UNSUPPORTED_TYPE_MESSAGE, 415);
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

  const header = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const detectedType = detectContentType(header);
  if (!detectedType || detectedType !== file.type) {
    throw new UploadValidationError(UNSUPPORTED_TYPE_MESSAGE, 415);
  }
}
