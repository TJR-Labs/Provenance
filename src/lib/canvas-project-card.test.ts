import { describe, expect, it } from "vitest";

import {
  applyProjectCardOverrides,
  coerceHashtagsOverride,
  DEFAULT_CARD_LAYOUT,
  isCardLayout,
  normalizeHashtags,
  resolveCardLayout,
  type ProjectCardData,
} from "./canvas-project-card";

function baseProject(): ProjectCardData {
  return {
    id: "p1",
    title: "Real Title",
    description: "Real description",
    category: "DESIGNER",
    hashtags: ["alpha", "beta"],
    media: [],
  };
}

describe("applyProjectCardOverrides", () => {
  it("overrides only the title when only a title override is set", () => {
    const result = applyProjectCardOverrides(baseProject(), {
      titleOverride: "Canvas Title",
      descriptionOverride: null,
      hashtagsOverride: null,
    });
    expect(result.title).toBe("Canvas Title");
    expect(result.description).toBe("Real description");
    expect(result.hashtags).toEqual(["alpha", "beta"]);
  });

  it("overrides only the description when only a description override is set", () => {
    const result = applyProjectCardOverrides(baseProject(), {
      titleOverride: null,
      descriptionOverride: "Canvas blurb",
      hashtagsOverride: null,
    });
    expect(result.title).toBe("Real Title");
    expect(result.description).toBe("Canvas blurb");
  });

  it("falls back to the real hashtags when the override is unset (null)", () => {
    const result = applyProjectCardOverrides(baseProject(), {
      titleOverride: null,
      descriptionOverride: null,
      hashtagsOverride: null,
    });
    expect(result.hashtags).toEqual(["alpha", "beta"]);
  });

  it("shows zero hashtags for an explicit empty-list override (distinct from unset)", () => {
    const result = applyProjectCardOverrides(baseProject(), {
      titleOverride: null,
      descriptionOverride: null,
      hashtagsOverride: [],
    });
    expect(result.hashtags).toEqual([]);
  });

  it("uses a non-empty hashtags override when set", () => {
    const result = applyProjectCardOverrides(baseProject(), {
      titleOverride: null,
      descriptionOverride: null,
      hashtagsOverride: ["gamma"],
    });
    expect(result.hashtags).toEqual(["gamma"]);
  });

  it("clearing an override (null) reverts each field to the real value", () => {
    const cleared = applyProjectCardOverrides(baseProject(), {
      titleOverride: null,
      descriptionOverride: null,
      hashtagsOverride: null,
    });
    expect(cleared.title).toBe("Real Title");
    expect(cleared.description).toBe("Real description");
    expect(cleared.hashtags).toEqual(["alpha", "beta"]);
  });

  it("treats a blank/whitespace title override as unset", () => {
    const result = applyProjectCardOverrides(baseProject(), {
      titleOverride: "   ",
      descriptionOverride: null,
      hashtagsOverride: null,
    });
    expect(result.title).toBe("Real Title");
  });

  it("does not mutate the input project", () => {
    const project = baseProject();
    applyProjectCardOverrides(project, {
      titleOverride: "Changed",
      descriptionOverride: null,
      hashtagsOverride: [],
    });
    expect(project.title).toBe("Real Title");
    expect(project.hashtags).toEqual(["alpha", "beta"]);
  });
});

describe("coerceHashtagsOverride", () => {
  it("returns a string array unchanged", () => {
    expect(coerceHashtagsOverride(["a", "b"])).toEqual(["a", "b"]);
  });
  it("returns an empty array for an explicit empty override", () => {
    expect(coerceHashtagsOverride([])).toEqual([]);
  });
  it("returns null for a non-array (unset) value", () => {
    expect(coerceHashtagsOverride(null)).toBeNull();
    expect(coerceHashtagsOverride(undefined)).toBeNull();
    expect(coerceHashtagsOverride("nope")).toBeNull();
  });
  it("drops non-string members", () => {
    expect(coerceHashtagsOverride(["a", 1, "b"])).toEqual(["a", "b"]);
  });
});

describe("isCardLayout / resolveCardLayout", () => {
  it("recognizes valid layout ids", () => {
    expect(isCardLayout("media-left")).toBe(true);
    expect(isCardLayout("text-only")).toBe(true);
    expect(isCardLayout("bogus")).toBe(false);
    expect(isCardLayout(null)).toBe(false);
  });
  it("resolves unset/unknown to the default", () => {
    expect(resolveCardLayout(null)).toBe(DEFAULT_CARD_LAYOUT);
    expect(resolveCardLayout(undefined)).toBe(DEFAULT_CARD_LAYOUT);
    expect(resolveCardLayout("bogus")).toBe(DEFAULT_CARD_LAYOUT);
    expect(resolveCardLayout("desc-top")).toBe("desc-top");
  });
});

describe("normalizeHashtags", () => {
  it("strips leading #, lowercases, trims, drops empties, and dedupes", () => {
    expect(
      normalizeHashtags(["#Alpha", " beta ", "ALPHA", "", "#"]),
    ).toEqual(["alpha", "beta"]);
  });
});
