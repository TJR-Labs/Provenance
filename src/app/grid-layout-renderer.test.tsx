/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { GridBlock } from "~/lib/grid-layout";
import {
  GridLayoutRenderer,
  type GridProjectView,
} from "./grid-layout-renderer";

function block(
  key: string,
  type: GridBlock["type"],
  overrides: Partial<GridBlock> = {},
): GridBlock {
  return {
    key,
    order: 0,
    type,
    x: 0,
    y: 0,
    width: type === "PROJECT" ? 3 : 2,
    height: type === "PROJECT" || type === "IMAGE" ? 2 : 1,
    projectId: null,
    textContent: null,
    imageUrl: null,
    imageMimeType: null,
    imageAlt: null,
    linkLabel: null,
    linkUrl: null,
    ...overrides,
  };
}

const projects: GridProjectView[] = [
  {
    id: "current-project",
    title: "Current project title",
    description: "Current project description",
    private: false,
    media: [
      { url: "https://example.com/current-cover.png", mimeType: "image/png" },
    ],
  },
  {
    id: "private-project",
    title: "Secret project title",
    description: "Secret project description",
    private: true,
    media: [
      { url: "https://example.com/secret-cover.png", mimeType: "image/png" },
    ],
  },
];

afterEach(() => cleanup());

describe("GridLayoutRenderer", () => {
  it("renders saved 12-column geometry with 80px rows in desktop mode", () => {
    const { container } = render(
      <GridLayoutRenderer
        blocks={[
          block("placed", "TEXT", {
            x: 3,
            y: 2,
            width: 5,
            height: 3,
            textContent: "Placed content",
          }),
        ]}
        projects={[]}
        mode="desktop"
        ownerView={false}
      />,
    );

    const grid = container.firstElementChild as HTMLElement;
    const placed = screen.getByText("Placed content").parentElement!;
    expect(grid.style.gridTemplateColumns).toBe("repeat(12, minmax(0, 1fr))");
    expect(grid.style.gridAutoRows).toBe("80px");
    expect(placed.style.gridColumn).toBe("4 / span 5");
    expect(placed.style.gridRow).toBe("3 / span 3");
    expect(container.children).toHaveLength(1);
  });

  it("renders responsive desktop and mobile wrappers hidden at opposite breakpoints", () => {
    const { container } = render(
      <GridLayoutRenderer
        blocks={[block("text", "TEXT", { textContent: "Responsive" })]}
        projects={[]}
        mode="responsive"
        ownerView={false}
      />,
    );

    expect(container.children).toHaveLength(2);
    expect(container.children[0]?.className).toContain("md:grid");
    expect(container.children[0]?.className).toContain("hidden");
    expect(container.children[1]?.className).toContain("md:hidden");
    expect(screen.getAllByText("Responsive")).toHaveLength(2);
  });

  it("uses one mobile column ordered by y, x, order, and key", () => {
    const { container } = render(
      <GridLayoutRenderer
        blocks={[
          block("right", "TEXT", {
            order: 0,
            x: 5,
            y: 0,
            textContent: "Right",
          }),
          block("same-b", "TEXT", {
            order: 1,
            x: 1,
            y: 0,
            textContent: "Same B",
          }),
          block("later-row", "TEXT", {
            order: 0,
            x: 0,
            y: 2,
            textContent: "Later row",
          }),
          block("same-a", "TEXT", {
            order: 1,
            x: 1,
            y: 0,
            textContent: "Same A",
          }),
          block("earlier-order", "TEXT", {
            order: 0,
            x: 1,
            y: 0,
            textContent: "Earlier order",
          }),
        ]}
        projects={[]}
        mode="mobile"
        ownerView={false}
      />,
    );

    const mobile = container.firstElementChild as HTMLElement;
    expect(mobile.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(
      within(mobile)
        .getAllByText(/Earlier order|Same A|Same B|Right|Later row/)
        .map((node) => node.textContent),
    ).toEqual(["Earlier order", "Same A", "Same B", "Right", "Later row"]);
  });

  it("renders text as escaped plain paragraphs", () => {
    const { container } = render(
      <GridLayoutRenderer
        blocks={[
          block("plain", "TEXT", {
            textContent:
              '<strong>Not markup</strong>\n<script>alert("x")</script>',
          }),
        ]}
        projects={[]}
        mode="mobile"
        ownerView={false}
      />,
    );

    expect(container.querySelector("p")?.textContent).toBe(
      '<strong>Not markup</strong>\n<script>alert("x")</script>',
    );
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("uses a referenced project's current cover, fields, and project-page destination", () => {
    render(
      <GridLayoutRenderer
        blocks={[block("project", "PROJECT", { projectId: "current-project" })]}
        projects={projects}
        mode="mobile"
        ownerView={false}
      />,
    );

    expect(screen.getByText("Current project title")).not.toBeNull();
    expect(screen.getByText("Current project description")).not.toBeNull();
    expect(
      screen
        .getByRole("img", { name: "Current project title" })
        .getAttribute("src"),
    ).toBe("https://example.com/current-cover.png");
    expect(
      screen
        .getByRole("link", { name: "Current project title" })
        .getAttribute("href"),
    ).toBe("/projects/current-project");
  });

  it("renders migrated image and safe link content with safe new-tab attributes", () => {
    render(
      <GridLayoutRenderer
        blocks={[
          block("image", "IMAGE", {
            imageUrl: "https://example.com/migrated.png",
            imageMimeType: "image/png",
            imageAlt: "Migrated image",
          }),
          block("link", "LINK", {
            y: 2,
            linkLabel: "Migrated link",
            linkUrl: "https://example.com/path",
          }),
        ]}
        projects={[]}
        mode="mobile"
        ownerView={false}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Migrated image" }).getAttribute("src"),
    ).toBe("https://example.com/migrated.png");
    const link = screen.getByRole("link", { name: "Migrated link" });
    expect(link.getAttribute("href")).toBe("https://example.com/path");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("keeps unsafe legacy link and media values visible but inert", () => {
    const { container } = render(
      <GridLayoutRenderer
        blocks={[
          block("unsafe-link", "LINK", {
            linkLabel: "Legacy project link",
            linkUrl: "javascript:alert(1)",
          }),
          block("unsafe-image", "IMAGE", {
            y: 1,
            imageUrl: "javascript:legacy-media",
            imageMimeType: "image/png",
            imageAlt: "Legacy media",
          }),
        ]}
        projects={[]}
        mode="mobile"
        ownerView={false}
      />,
    );

    expect(screen.getByText("Legacy project link")).not.toBeNull();
    expect(screen.getByText("javascript:alert(1)")).not.toBeNull();
    expect(screen.getByText("javascript:legacy-media")).not.toBeNull();
    expect(container.querySelector('[href^="javascript:"]')).toBeNull();
    expect(container.querySelector('[src^="javascript:"]')).toBeNull();
  });

  it("hides private data from viewers while owners see private projects and generic missing refs", () => {
    const inaccessible = [
      block("private", "PROJECT", { projectId: "private-project" }),
      block("deleted", "PROJECT", { y: 2, projectId: "deleted-project" }),
    ];

    const viewer = render(
      <GridLayoutRenderer
        blocks={inaccessible}
        projects={projects}
        mode="mobile"
        ownerView={false}
      />,
    );
    expect(screen.queryByText("Secret project title")).toBeNull();
    expect(screen.queryByText("Project unavailable")).toBeNull();
    expect(screen.getByText("Nothing here yet.")).not.toBeNull();
    viewer.unmount();

    render(
      <GridLayoutRenderer
        blocks={inaccessible}
        projects={projects}
        mode="mobile"
        ownerView
      />,
    );
    expect(screen.getByText("Secret project title")).not.toBeNull();
    expect(screen.getByText("Secret project description")).not.toBeNull();
    expect(screen.getAllByText("Project unavailable")).toHaveLength(1);
  });

  it("uses the existing empty state and never renders editor chrome or metadata", () => {
    const { container } = render(
      <GridLayoutRenderer
        blocks={[block("empty-text", "TEXT")]}
        projects={[]}
        mode="responsive"
        ownerView={false}
      />,
    );

    expect(screen.getByText("No records yet")).not.toBeNull();
    expect(screen.getByText("Nothing here yet.")).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(container.textContent).not.toMatch(
      /delete|resize|draft|publish|column|row/i,
    );
  });
});
