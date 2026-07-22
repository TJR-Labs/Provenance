import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), finalize: vi.fn() }));

vi.mock("~/server/auth", () => ({ auth: mocks.auth }));
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
  mocks.finalize.mockReset();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
});

describe("POST /api/upload/finalize", () => {
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
