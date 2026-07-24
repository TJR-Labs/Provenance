/**
 * @vitest-environment jsdom
 *
 * Verifies the four canvas card layout presets each render distinctly
 * (spec Requirement 6 / Definition-of-Done "at least four layout presets…
 * each rendering distinctly"). media-top is the default and must match today.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Category } from "../../generated/prisma";
import { ProjectCard } from "./project-card";

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

vi.mock("./project-media", () => ({
  ProjectMedia: () => <div data-testid="media" />,
}));

const withMedia = {
  id: "p1",
  title: "Card Title",
  description: "Unique blurb text",
  category: "DESIGNER" as Category,
  hashtags: ["alpha"],
  media: [{ url: "https://example.com/a.png", mimeType: "image/png" }],
};

const noMedia = { ...withMedia, media: [] };

afterEach(() => cleanup());

describe("ProjectCard layout presets", () => {
  it("media-top (default) renders the media above the description", () => {
    const { container } = render(<ProjectCard project={withMedia} />);
    const html = container.innerHTML;
    expect(within(container).getByTestId("media")).not.toBeNull();
    expect(html.indexOf('data-testid="media"')).toBeLessThan(
      html.indexOf("Unique blurb text"),
    );
  });

  it("desc-top renders the description above the media (distinct order)", () => {
    const { container } = render(
      <ProjectCard project={withMedia} layout="desc-top" />,
    );
    const html = container.innerHTML;
    expect(within(container).getByTestId("media")).not.toBeNull();
    expect(html.indexOf("Unique blurb text")).toBeLessThan(
      html.indexOf('data-testid="media"'),
    );
  });

  it("media-left keeps the media side even with no media (No media placeholder)", () => {
    const { container } = render(
      <ProjectCard project={noMedia} layout="media-left" />,
    );
    // Side-by-side wrapper present, and the placeholder occupies the media side.
    expect(container.querySelector("article.sm\\:flex-row")).not.toBeNull();
    expect(within(container).getByText("No media on record")).not.toBeNull();
  });

  it("media-left shows the media when the project has some", () => {
    render(<ProjectCard project={withMedia} layout="media-left" />);
    expect(screen.getByTestId("media")).not.toBeNull();
  });

  it("text-only renders neither media nor the No-media placeholder", () => {
    const { container } = render(
      <ProjectCard project={withMedia} layout="text-only" />,
    );
    expect(within(container).queryByTestId("media")).toBeNull();
    expect(within(container).queryByText("No media on record")).toBeNull();
    // The text body still renders.
    expect(within(container).getByText("Unique blurb text")).not.toBeNull();
  });
});
