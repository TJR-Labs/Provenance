import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  consumeRateLimit: vi.fn(),
  finalize: vi.fn(),
  rateLimitAttempt: {},
}));

vi.mock("~/server/auth", () => ({ auth: mocks.auth }));
vi.mock("~/server/db", () => ({
  db: { rateLimitAttempt: mocks.rateLimitAttempt },
}));
vi.mock("~/server/rate-limit", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));
vi.mock("~/server/upload-intents", () => {
  class UploadIntentError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }

  return {
    UploadIntentError,
    finalizeUploadIntent: mocks.finalize,
  };
});

import { UploadIntentError } from "~/server/upload-intents";
import { UploadValidationError } from "~/server/upload-validation";
import { POST } from "./route";

function request() {
  return new Request("http://localhost/api/upload/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intentId: "intent-1" }),
  });
}

beforeEach(() => {
  mocks.auth.mockReset();
  mocks.consumeRateLimit.mockReset();
  mocks.finalize.mockReset();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  mocks.consumeRateLimit.mockResolvedValue(undefined);
});

describe("POST /api/upload/finalize", () => {
  it("rate-limits authenticated requests by user id", async () => {
    mocks.consumeRateLimit.mockRejectedValueOnce(
      new TRPCError({ code: "TOO_MANY_REQUESTS" }),
    );

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith(
      {
        scope: "upload.finalize",
        key: "user-1",
        limit: 60,
        windowMs: 60_000,
        lockoutMs: 60_000,
      },
      mocks.rateLimitAttempt,
    );
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it("maps ownership and expiry failures to 403/410", async () => {
    mocks.finalize.mockRejectedValueOnce(
      new UploadIntentError(403, "This upload intent belongs to another user."),
    );
    expect((await POST(request())).status).toBe(403);

    mocks.finalize.mockRejectedValueOnce(
      new UploadIntentError(410, "This upload intent has expired."),
    );
    expect((await POST(request())).status).toBe(410);
  });

  it("preserves content-validation status and message", async () => {
    mocks.finalize.mockRejectedValue(
      new UploadValidationError("Unsupported file type.", 415),
    );

    const response = await POST(request());

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported file type.",
    });
  });

  it("returns the finalized legacy response shape", async () => {
    mocks.finalize.mockResolvedValue({
      url: "https://cdn.example.test/file.png",
      mimeType: "image/png",
      resource: { id: "resource-1" },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://cdn.example.test/file.png",
      mimeType: "image/png",
      resource: { id: "resource-1" },
    });
  });
});
