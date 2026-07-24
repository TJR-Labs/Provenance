import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  consumeRateLimit: vi.fn(),
  rateLimitAttempt: {},
}));

vi.mock("~/server/auth", () => ({ auth: mocks.auth }));
vi.mock("~/server/db", () => ({
  db: { rateLimitAttempt: mocks.rateLimitAttempt },
}));
vi.mock("~/server/rate-limit", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));
vi.mock("~/env", () => ({
  env: {
    SUPABASE_URL: "https://example.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    SUPABASE_STORAGE_BUCKET: "public-media",
    SUPABASE_STORAGE_STAGING_BUCKET: "upload-staging",
    NODE_ENV: "test",
  },
}));

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
  mocks.auth.mockReset();
  mocks.consumeRateLimit.mockReset();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  mocks.consumeRateLimit.mockResolvedValue(undefined);
});

describe("POST /api/upload/intent validation", () => {
  it("requires authentication", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await POST(
      request({ purpose: "project-media", mimeType: "image/png", byteSize: 8 }),
    );

    expect(response.status).toBe(401);
  });

  it("rate-limits authenticated requests by user id", async () => {
    mocks.consumeRateLimit.mockRejectedValueOnce(
      new TRPCError({ code: "TOO_MANY_REQUESTS" }),
    );

    const response = await POST(
      request({
        purpose: "project-media",
        mimeType: "image/png",
        byteSize: 8,
      }),
    );

    expect(response.status).toBe(429);
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith(
      {
        scope: "upload.intent",
        key: "user-1",
        limit: 60,
        windowMs: 60_000,
        lockoutMs: 60_000,
      },
      mocks.rateLimitAttempt,
    );
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
