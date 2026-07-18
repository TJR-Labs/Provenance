import { describe, expect, it } from "vitest";

import { safeReturnTo } from "~/app/safe-return-to";

describe("safe return paths", () => {
  it("defaults missing and empty values to the root path", () => {
    expect(safeReturnTo(undefined)).toBe("/");
    expect(safeReturnTo("")).toBe("/");
  });

  it("rejects protocol-relative and backslash-based redirects", () => {
    expect(safeReturnTo("/\\evil.com")).toBe("/");
    expect(safeReturnTo("/\\/evil.com")).toBe("/");
    expect(safeReturnTo("//evil.com")).toBe("/");
  });

  it("rejects absolute external URLs", () => {
    expect(safeReturnTo("https://evil.com")).toBe("/");
  });

  it("rejects an already-decoded URL-encoded backslash", () => {
    expect(safeReturnTo("/a\\evil.com")).toBe("/");
  });

  it("preserves a normal same-origin path", () => {
    expect(safeReturnTo("/profile/edit")).toBe("/profile/edit");
  });
});
