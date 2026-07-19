/**
 * @vitest-environment jsdom
 *
 * Verifies that the public canvas view renders the four identity element types
 * from their derived content, and that per-element style columns are applied to
 * that element's canvas rendering (spec Requirements 2, 5-7, 9 and the matching
 * Definition-of-Done items). The fixed Grid-mode header is a separate code path
 * in page.tsx that never reads these rows, so styling here cannot affect it.
 */
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CanvasProfileLayout,
  type ProfileIdentity,
  type PublicCanvasElement,
} from "./canvas-profile-view";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("~/app/project-card", () => ({
  ProjectCard: () => <div data-testid="project-card" />,
}));

const identity: ProfileIdentity = {
  displayName: "Ada Lovelace",
  username: "ada",
  school: "MIT",
  avatarUrl: null,
  categories: ["SOFTWARE_ENGINEER", "DESIGNER"],
};

function el(overrides: Partial<PublicCanvasElement>): PublicCanvasElement {
  return {
    id: "e1",
    type: "NAME",
    x: 0,
    y: 0,
    width: 300,
    height: 64,
    zIndex: 1,
    project: null,
    textContent: null,
    imageUrl: null,
    imageCaption: null,
    linkLabel: null,
    linkUrl: null,
    textColor: null,
    backgroundColor: null,
    fontFamily: null,
    avatarShape: null,
    avatarZoom: null,
    avatarOffsetX: null,
    avatarOffsetY: null,
    projectTitleOverride: null,
    projectDescriptionOverride: null,
    projectHashtagsOverride: null,
    cardLayout: null,
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("public canvas identity elements", () => {
  it("renders derived identity content for the four new types", () => {
    const { container } = render(
      <CanvasProfileLayout
        elements={[
          el({ id: "avatar", type: "AVATAR", zIndex: 1 }),
          el({ id: "name", type: "NAME", zIndex: 2 }),
          el({ id: "username", type: "USERNAME", zIndex: 3 }),
          el({ id: "categories", type: "CATEGORIES", zIndex: 4 }),
        ]}
        bio={null}
        links={[]}
        identity={identity}
      />,
    );

    const scope = within(container);
    // Name is derived from displayName.
    expect(scope.getAllByText("Ada Lovelace").length).toBeGreaterThan(0);
    // Username is "@username · school".
    expect(scope.getAllByText(/@ada · MIT/).length).toBeGreaterThan(0);
    // Avatar with no image falls back to the initial.
    expect(scope.getAllByText("A").length).toBeGreaterThan(0);
    // Category badges are derived, read-only links.
    const badge = scope.getAllByText("Software Engineer")[0]!;
    expect(badge.closest("a")?.getAttribute("href")).toBe(
      "/?category=SOFTWARE_ENGINEER",
    );
  });

  it("applies per-element style to that element's canvas rendering", () => {
    const { container } = render(
      <CanvasProfileLayout
        elements={[
          el({
            id: "name",
            type: "NAME",
            textColor: "#ff0000",
            fontFamily: "serif",
          }),
          el({ id: "about", type: "ABOUT", y: 200 }),
        ]}
        bio="A bio"
        links={[]}
        identity={identity}
      />,
    );

    // The styled NAME element's wrapper carries the color + font it was given.
    const styledWrappers = Array.from(
      container.querySelectorAll<HTMLElement>("div[style]"),
    ).filter((node) => node.style.color === "rgb(255, 0, 0)");
    expect(styledWrappers.length).toBeGreaterThan(0);
    expect(styledWrappers[0]!.style.fontFamily).toContain("serif");

    // The unstyled ABOUT element gets no color — style is scoped per element.
    const coloredCount = Array.from(
      container.querySelectorAll<HTMLElement>("div[style]"),
    ).filter((node) => node.style.color !== "").length;
    // Only the NAME element (rendered once for desktop, once for mobile).
    expect(coloredCount).toBe(2);
  });
});
