import { describe, expect, it } from "vitest";

import { classifyProjectMedia } from "./project-media";

describe("classifyProjectMedia", () => {
  it.each([
    ["image/png", "https://example.com/media", "image"],
    ["video/mp4", "https://example.com/media", "video"],
    [null, "https://example.com/photo.PNG?size=large", "image"],
    [null, "https://example.com/photo.jpeg", "image"],
    [null, "https://example.com/movie.WEBM?download=1", "video"],
    [null, "https://example.com/movie.mp4", "video"],
    [null, "https://example.com/file.pdf", "link"],
  ] as const)("classifies %s / %s as %s", (mimeType, url, expected) => {
    expect(classifyProjectMedia({ mimeType, url })).toBe(expected);
  });

  it("keeps MIME classification ahead of a conflicting extension", () => {
    expect(
      classifyProjectMedia({
        mimeType: "video/mp4",
        url: "https://example.com/photo.png",
      }),
    ).toBe("video");
  });
});
