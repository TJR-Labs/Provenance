/**
 * @vitest-environment node
 *
 * Exercises the Discover page's hashtag filter chips: the page renders the
 * popular hashtags returned by the discovery router as chips whose links carry
 * the same query params the text-input filter produces on submit (preserving an
 * active category), and marks the currently-filtered tag as pressed.
 */
import { type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  popularHashtags: vi.fn(),
}));

vi.mock("~/server/api/caller", () => ({
  getServerCaller: async () => ({
    discovery: { list: mocks.list, popularHashtags: mocks.popularHashtags },
  }),
}));

import Home from "./page";

// Collects every element carrying a string `href` prop (only the chips do on
// this page), preserving document order.
function collectLinks(node: unknown): { href: string; pressed: unknown }[] {
  if (!node || typeof node !== "object") return [];
  const element = node as { props?: Record<string, unknown> };
  const found: { href: string; pressed: unknown }[] = [];
  if (typeof element.props?.href === "string") {
    found.push({
      href: element.props.href,
      pressed: element.props["aria-pressed"],
    });
  }
  const children = element.props?.children;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) found.push(...collectLinks(child));
  return found;
}

async function renderHome(
  params: { category?: string; hashtag?: string } = {},
) {
  return (await Home({
    searchParams: Promise.resolve(params),
  })) as ReactElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ items: [], nextCursor: null });
});

describe("the Discover hashtag chips", () => {
  it("renders a chip per popular hashtag in the order returned, filtering by that tag", async () => {
    mocks.popularHashtags.mockResolvedValue(["robotics", "ai", "web"]);

    const chips = collectLinks(await renderHome());

    expect(chips.map((chip) => chip.href)).toEqual([
      "/?hashtag=robotics",
      "/?hashtag=ai",
      "/?hashtag=web",
    ]);
  });

  it("preserves an active category filter in each chip's link", async () => {
    mocks.popularHashtags.mockResolvedValue(["robotics"]);

    const chips = collectLinks(
      await renderHome({ category: "SOFTWARE_ENGINEER" }),
    );

    expect(chips[0]?.href).toBe(
      "/?category=SOFTWARE_ENGINEER&hashtag=robotics",
    );
  });

  it("marks the chip for the currently-filtered tag as pressed", async () => {
    mocks.popularHashtags.mockResolvedValue(["robotics", "ai"]);

    const chips = collectLinks(await renderHome({ hashtag: "robotics" }));

    expect(
      chips.find((chip) => chip.href.endsWith("hashtag=robotics"))?.pressed,
    ).toBe(true);
    expect(
      chips.find((chip) => chip.href.endsWith("hashtag=ai"))?.pressed,
    ).toBe(false);
  });

  it("renders no chips when no hashtags are in use", async () => {
    mocks.popularHashtags.mockResolvedValue([]);

    expect(collectLinks(await renderHome())).toHaveLength(0);
  });
});
