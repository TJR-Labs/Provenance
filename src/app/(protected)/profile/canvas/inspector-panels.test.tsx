/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InspectorBlocks } from "./inspector-blocks";
import { InspectorSections } from "./inspector-sections";
import { InspectorStyles } from "./inspector-styles";
import type { EditorProject, EditorSection, EditorStyle } from "./site-editor";

const sections: EditorSection[] = [
  { kind: "HERO", order: 0, visible: true, blocks: [] },
  {
    kind: "PROJECT_GRID",
    order: 1,
    visible: true,
    blocks: [
      {
        type: "PROJECT",
        key: "project-1",
        order: 0,
        projectId: "placed",
      },
    ],
  },
  { kind: "ABOUT", order: 2, visible: true, blocks: [] },
  { kind: "BUILD_LOG", order: 3, visible: false, blocks: [] },
  { kind: "LINKS", order: 4, visible: false, blocks: [] },
];

const projects = [
  { id: "placed", title: "Placed", description: "Already on the page" },
  { id: "available", title: "Available", description: "Ready to add" },
] as EditorProject[];

const style: EditorStyle = {
  typefacePairing: "archivo-plexmono",
  colorBg: "#10100f",
  colorText: "#f1eee6",
  colorAccent: "#ed4b2a",
  colorLine: "#3a3935",
  cornerRadius: 10,
  motionLevel: "subtle",
};

afterEach(() => {
  cleanup();
});

describe("InspectorSections", () => {
  it("selects, reorders, toggles, and reveals sections", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onMove = vi.fn();
    const onToggleVisible = vi.fn();
    const onReveal = vi.fn();
    render(
      <InspectorSections
        sections={sections}
        selectedKind="HERO"
        onSelect={onSelect}
        onMove={onMove}
        onToggleVisible={onToggleVisible}
        onReveal={onReveal}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Select About section" }),
    );
    await user.click(screen.getByRole("button", { name: "Move About up" }));
    await user.click(screen.getByRole("button", { name: "Hide Hero" }));
    await user.click(screen.getByRole("button", { name: "+ Build log" }));

    expect(onSelect).toHaveBeenCalledWith("ABOUT");
    expect(onMove).toHaveBeenCalledWith("ABOUT", -1);
    expect(onToggleVisible).toHaveBeenCalledWith("HERO");
    expect(onReveal).toHaveBeenCalledWith("BUILD_LOG");
  });
});

describe("InspectorBlocks", () => {
  it("offers all seven About block types and opens the chosen editor", async () => {
    const user = userEvent.setup();
    const onAddBlock = vi.fn();
    render(
      <InspectorBlocks
        selectedSection={sections[2]!}
        projects={projects}
        onAddBlock={onAddBlock}
        onAddProject={vi.fn()}
      />,
    );

    for (const label of [
      "Text",
      "Image",
      "Gallery",
      "Embed",
      "Code",
      "Quote",
      "Link",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    await user.click(screen.getByRole("button", { name: "Quote" }));
    expect(onAddBlock).toHaveBeenCalledWith(
      "QUOTE",
      expect.objectContaining({ left: 0, top: 0, bottom: 0 }),
    );
  });

  it("only lists projects that are not already placed", async () => {
    const user = userEvent.setup();
    const onAddProject = vi.fn();
    render(
      <InspectorBlocks
        selectedSection={sections[1]!}
        projects={projects}
        onAddBlock={vi.fn()}
        onAddProject={onAddProject}
      />,
    );

    expect(screen.queryByRole("button", { name: /Placed/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Available/ }));
    expect(onAddProject).toHaveBeenCalledWith("available");
  });
});

describe("InspectorStyles", () => {
  it("reports typeface, color, radius, and motion changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<InspectorStyles style={style} onChange={onChange} />);

    await user.click(
      screen.getByRole("button", { name: /Newsreader.*Aa Bb 123/ }),
    );
    fireEvent.change(screen.getByDisplayValue("#ed4b2a"), {
      target: { value: "#123456" },
    });
    fireEvent.change(screen.getByRole("slider"), {
      target: { value: "18" },
    });
    await user.click(screen.getByRole("button", { name: "Full" }));

    expect(onChange).toHaveBeenCalledWith({
      typefacePairing: "newsreader-archivo",
    });
    expect(onChange).toHaveBeenCalledWith({ colorAccent: "#123456" });
    expect(onChange).toHaveBeenCalledWith({ cornerRadius: 18 });
    expect(onChange).toHaveBeenCalledWith({ motionLevel: "full" });
  });
});
