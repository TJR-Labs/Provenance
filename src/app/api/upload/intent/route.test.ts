import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());

vi.mock("~/server/auth", () => ({ auth: authMock }));

import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "~/server/upload-validation";
import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/upload/intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "user-1" } });
});

describe("POST /api/upload/intent validation", () => {
  it("requires authentication", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(
      request({ purpose: "project-media", mimeType: "image/png", byteSize: 8 }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects an unknown purpose", async () => {
    const response = await POST(
      request({ purpose: "unknown", mimeType: "image/png", byteSize: 8 }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects an unsupported declared MIME type", async () => {
    const response = await POST(
      request({ purpose: "project-media", mimeType: "text/html", byteSize: 8 }),
    );

    expect(response.status).toBe(415);
  });

  it.each([
    ["image/png", MAX_IMAGE_BYTES + 1],
    ["video/mp4", MAX_VIDEO_BYTES + 1],
  ])("rejects an oversized %s declaration", async (mimeType, byteSize) => {
    const response = await POST(
      request({ purpose: "project-media", mimeType, byteSize }),
    );

    expect(response.status).toBe(413);
  });
});
