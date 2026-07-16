import { describe, expect, it } from "vitest";

import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  UploadValidationError,
  validateUpload,
} from "~/server/upload-validation";

describe("upload validation", () => {
  it("accepts allowed image and video files within their limits", () => {
    expect(() =>
      validateUpload({ type: "image/png", size: 1000 }),
    ).not.toThrow();
    expect(() =>
      validateUpload({ type: "video/mp4", size: 1000 }),
    ).not.toThrow();
  });

  it("rejects a disallowed type before storage", () => {
    expect(() => validateUpload({ type: "text/html", size: 100 })).toThrowError(
      UploadValidationError,
    );
    expect(() => validateUpload({ type: "text/html", size: 100 })).toThrow(
      "Unsupported file type",
    );
  });

  it("rejects oversized images and videos with a specific error", () => {
    expect(() =>
      validateUpload({ type: "image/jpeg", size: MAX_IMAGE_BYTES + 1 }),
    ).toThrow("10MB");
    expect(() =>
      validateUpload({ type: "video/webm", size: MAX_VIDEO_BYTES + 1 }),
    ).toThrow("50MB");
  });
});
