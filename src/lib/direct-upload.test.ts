import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadFileDirect } from "~/lib/direct-upload";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadFileDirect", () => {
  it("sends metadata to the app, bytes directly to Storage, then finalizes", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          intentId: "intent-1",
          uploadUrl: "https://storage.example.test/signed-upload",
          purpose: "project-media",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({
          url: "https://cdn.example.test/file.png",
          mimeType: "image/png",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([1, 2, 3])], "file.png", {
      type: "image/png",
    });

    await expect(uploadFileDirect(file, "project-media")).resolves.toEqual({
      url: "https://cdn.example.test/file.png",
      mimeType: "image/png",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/upload/intent");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        purpose: "project-media",
        mimeType: "image/png",
        byteSize: 3,
      }),
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://storage.example.test/signed-upload",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "PUT",
      body: file,
      headers: { "content-type": "image/png" },
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/upload/finalize");
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBe(
      JSON.stringify({ intentId: "intent-1" }),
    );
  });

  it("surfaces an intent error before sending file bytes", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: "File is too large." }, 413));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadFileDirect(
        new File(["x"], "file.png", { type: "image/png" }),
        "avatar",
      ),
    ).rejects.toThrow("File is too large.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
