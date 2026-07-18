import { describe, expect, it, vi } from "vitest";

// upload.ts reads ~/env for Supabase config; mock it so this test doesn't
// require a real DATABASE_URL/DIRECT_URL, matching this repo's existing
// pattern of mocking module boundaries (see users.test.ts for ~/server/db).
vi.mock("~/env", () => ({
  env: {
    SUPABASE_URL: "https://example.test",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    SUPABASE_STORAGE_BUCKET: "test-bucket",
  },
}));

import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  UploadValidationError,
  detectContentType,
  validateUpload,
} from "~/server/upload-validation";
import { uploadFile } from "~/server/upload";
import type { createStorageClient } from "~/server/upload";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const GIF_SIGNATURE = [
  0x47,
  0x49,
  0x46,
  0x38,
  0x39,
  0x61, // "GIF89a"
];
const WEBM_SIGNATURE = [0x1a, 0x45, 0xdf, 0xa3];

function asciiBytes(text: string) {
  return Array.from(text).map((char) => char.charCodeAt(0));
}

function webpBytes() {
  return [
    ...asciiBytes("RIFF"),
    0x00,
    0x00,
    0x00,
    0x00, // chunk size (unused by the sniffer)
    ...asciiBytes("WEBP"),
  ];
}

function mp4Bytes() {
  return [
    0x00,
    0x00,
    0x00,
    0x18, // box size (unused by the sniffer)
    ...asciiBytes("ftyp"),
    ...asciiBytes("isom"),
  ];
}

function makeFile(
  bytes: number[],
  type: string,
  { name = "upload", padTo }: { name?: string; padTo?: number } = {},
) {
  const length = padTo && padTo > bytes.length ? padTo : bytes.length;
  // Build directly on a pre-sized typed array (zero-filled by default)
  // instead of a JS array + spread, which is far too slow at MB+ sizes.
  const content = new Uint8Array(length);
  content.set(bytes, 0);
  return new File([content], name, { type });
}

describe("detectContentType", () => {
  it("recognizes the signature of every allowed type", () => {
    expect(detectContentType(new Uint8Array(PNG_SIGNATURE))).toBe("image/png");
    expect(detectContentType(new Uint8Array(JPEG_SIGNATURE))).toBe(
      "image/jpeg",
    );
    expect(detectContentType(new Uint8Array(GIF_SIGNATURE))).toBe("image/gif");
    expect(detectContentType(new Uint8Array(webpBytes()))).toBe("image/webp");
    expect(detectContentType(new Uint8Array(mp4Bytes()))).toBe("video/mp4");
    expect(detectContentType(new Uint8Array(WEBM_SIGNATURE))).toBe(
      "video/webm",
    );
  });

  it("returns null for unrecognized or truncated bytes", () => {
    expect(detectContentType(new Uint8Array(asciiBytes("<html>")))).toBeNull();
    expect(
      detectContentType(new Uint8Array(PNG_SIGNATURE.slice(0, 2))),
    ).toBeNull();
    expect(detectContentType(new Uint8Array())).toBeNull();
  });
});

describe("upload validation", () => {
  it("accepts allowed image and video files whose content matches the declared type", async () => {
    await expect(
      validateUpload(makeFile(PNG_SIGNATURE, "image/png", { padTo: 100 })),
    ).resolves.toBeUndefined();
    await expect(
      validateUpload(makeFile(mp4Bytes(), "video/mp4", { padTo: 100 })),
    ).resolves.toBeUndefined();
    await expect(
      validateUpload(makeFile(JPEG_SIGNATURE, "image/jpeg", { padTo: 100 })),
    ).resolves.toBeUndefined();
    await expect(
      validateUpload(makeFile(GIF_SIGNATURE, "image/gif", { padTo: 100 })),
    ).resolves.toBeUndefined();
    await expect(
      validateUpload(makeFile(webpBytes(), "image/webp", { padTo: 100 })),
    ).resolves.toBeUndefined();
    await expect(
      validateUpload(makeFile(WEBM_SIGNATURE, "video/webm", { padTo: 100 })),
    ).resolves.toBeUndefined();
  });

  it("rejects a disallowed declared type before storage", async () => {
    const file = makeFile(asciiBytes("<html></html>"), "text/html");
    await expect(validateUpload(file)).rejects.toThrow(UploadValidationError);
    await expect(validateUpload(file)).rejects.toThrow("Unsupported file type");
  });

  it("rejects oversized images and videos with a specific error", async () => {
    const oversizedImage = makeFile(PNG_SIGNATURE, "image/jpeg", {
      padTo: MAX_IMAGE_BYTES + 1,
    });
    await expect(validateUpload(oversizedImage)).rejects.toThrow("10MB");

    const oversizedVideo = makeFile(WEBM_SIGNATURE, "video/webm", {
      padTo: MAX_VIDEO_BYTES + 1,
    });
    await expect(validateUpload(oversizedVideo)).rejects.toThrow("50MB");
  });

  it("rejects a file whose real content disagrees with the declared type", async () => {
    // Declared as image/png but the bytes are actually HTML.
    const file = makeFile(
      asciiBytes("<html><body>hi</body></html>"),
      "image/png",
    );
    await expect(validateUpload(file)).rejects.toThrow(UploadValidationError);
    await expect(validateUpload(file)).rejects.toMatchObject({ status: 415 });
  });

  it("rejects a truncated file too short to contain a valid signature", async () => {
    const file = makeFile(PNG_SIGNATURE.slice(0, 2), "image/png");
    await expect(validateUpload(file)).rejects.toThrow(UploadValidationError);
    await expect(validateUpload(file)).rejects.toMatchObject({ status: 415 });
  });

  it("rejects an empty file cleanly instead of crashing", async () => {
    const file = makeFile([], "image/png");
    await expect(validateUpload(file)).rejects.toThrow(UploadValidationError);
    await expect(validateUpload(file)).rejects.toMatchObject({ status: 415 });
  });
});

describe("uploadFile", () => {
  function fakeGetClient() {
    const uploadedPaths: string[] = [];
    const fakeClient = {
      storage: {
        from: () => ({
          upload: vi.fn((path: string) => {
            uploadedPaths.push(path);
            return Promise.resolve({ error: null });
          }),
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://example.test/${path}` },
          }),
        }),
      },
    };
    const getClient = vi.fn(() => fakeClient) as unknown as () => ReturnType<
      typeof createStorageClient
    >;
    return { getClient, uploadedPaths };
  }

  it("derives the stored extension from the validated type, not a misleading filename", async () => {
    const { getClient, uploadedPaths } = fakeGetClient();
    // Filename claims .html, but the declared type and real bytes are a PNG.
    const file = makeFile(PNG_SIGNATURE, "image/png", {
      name: "photo.html",
      padTo: 100,
    });

    const result = await uploadFile(file, "user-1", getClient);

    expect(uploadedPaths).toHaveLength(1);
    expect(uploadedPaths[0]).toMatch(/^user-1\/[0-9a-f-]+\.png$/);
    expect(result.mimeType).toBe("image/png");
  });

  it("propagates validation failures without contacting storage", async () => {
    const { getClient, uploadedPaths } = fakeGetClient();
    const file = makeFile(asciiBytes("<html></html>"), "image/png", {
      name: "photo.png",
    });

    await expect(uploadFile(file, "user-1", getClient)).rejects.toThrow(
      UploadValidationError,
    );
    expect(uploadedPaths).toHaveLength(0);
  });
});
