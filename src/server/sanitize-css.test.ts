import { describe, expect, it } from "vitest";

import { sanitizeCustomCss } from "~/server/sanitize-css";

describe("custom CSS sanitization", () => {
  it("neutralizes imports, external resources, page selectors, and scopes overlays", () => {
    const malicious = `
      @import url("https://attacker.example/steal.css");
      body, html .outside { background: red; }
      .overlay { position: fixed; inset: 0; z-index: 999999; }
      .avatar { background-image: url("https://attacker.example/pixel"); color: blue; }
      .escape { content: "</style><script>alert(1)</script>"; }
    `;

    const result = sanitizeCustomCss(malicious, "Alice");
    expect(result).not.toContain("@import");
    expect(result).not.toContain("url(");
    expect(result.toLowerCase()).not.toContain("</style");
    expect(result).not.toMatch(/(^|[,\s])body([\s,{.#:]|$)/);
    expect(result).not.toMatch(/(^|[,\s])html([\s,{.#:]|$)/);
    expect(result).toContain(".profile-scope-alice .overlay { position: fixed");

    for (const selector of result.match(/[^{}]+(?=\s*\{)/g) ?? []) {
      expect(selector.trim()).toMatch(/^\.profile-scope-alice\b/);
    }
  });
});
