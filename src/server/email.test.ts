import { describe, expect, it } from "vitest";

describe("@react-email/render dependency", () => {
  it("resolves as a module (resend's internal render() call depends on this)", async () => {
    await expect(import("@react-email/render")).resolves.toBeDefined();
  });
});
