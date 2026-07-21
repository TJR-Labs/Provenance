/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GridBlock } from "~/lib/grid-layout";
import type { GridEditorPayload } from "~/server/grid-layouts";
import { GridLayoutEditor } from "./grid-layout-editor";

const mocks = vi.hoisted(() => ({
  saveProfileDraft: vi.fn(),
  publishProfile: vi.fn(),
  publishProject: vi.fn(),
  renderer: vi.fn(),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    grid: {
      saveProfileDraft: {
        useMutation: () => ({ mutateAsync: mocks.saveProfileDraft }),
      },
      publishProfile: {
        useMutation: () => ({ mutateAsync: mocks.publishProfile }),
      },
      publishProject: {
        useMutation: () => ({ mutateAsync: mocks.publishProject }),
      },
    },
  },
}));

vi.mock("./grid-layout-renderer", () => ({
  GridLayoutRenderer: (props: { mode: string; blocks: GridBlock[] }) => {
    mocks.renderer(props);
    return (
      <div data-testid="grid-layout-renderer" data-mode={props.mode}>
        {props.blocks.map((item) => item.key).join(",")}
      </div>
    );
  },
}));

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

function payload(blocks: GridBlock[] = []): GridEditorPayload {
  return {
    scope: "profile",
    revision: 4,
    blocks,
    projects: [
      {
        id: "owned-project",
        title: "Owned project",
        description: "Current project description",
        private: false,
        media: [],
      },
      {
        id: "private-project",
        title: "Private project",
        description: "Private project description",
        private: true,
        media: [],
      },
    ],
  };
}

function profileProps(
  blocks: GridBlock[] = [],
): ComponentProps<typeof GridLayoutEditor> {
  return { scope: "profile", initial: payload(blocks) };
}

function projectProps(
  blocks: GridBlock[] = [],
): ComponentProps<typeof GridLayoutEditor> {
  return {
    scope: "project",
    projectId: "page-project",
    initial: { ...payload(blocks), scope: "project" },
  };
}

function gridRect(width = 1200): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: 800,
    width,
    height: 800,
    toJSON: () => ({}),
  };
}

beforeEach(() => {
  mocks.saveProfileDraft.mockReset();
  mocks.publishProfile.mockReset();
  mocks.publishProject.mockReset();
  mocks.renderer.mockClear();
  mocks.saveProfileDraft.mockResolvedValue({ revision: 5, blocks: [] });
  mocks.publishProfile.mockResolvedValue({ revision: 5, blocks: [] });
  mocks.publishProject.mockResolvedValue({ revision: 5, blocks: [] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GridLayoutEditor responsive controls", () => {
  it("shows a mobile notice and limits editing controls to desktop", () => {
    render(<GridLayoutEditor {...profileProps()} />);

    const mobileNotice = screen.getByTestId("grid-mobile-editor-notice");
    expect(mobileNotice.classList).toContain("lg:hidden");
    expect(mobileNotice.textContent).toMatch(/desktop/i);

    const desktopEditor = screen.getByTestId("grid-desktop-editor");
    expect(desktopEditor.classList).toContain("hidden");
    expect(desktopEditor.classList).toContain("lg:block");
  });
});

describe("GridLayoutEditor placement and layout history", () => {
  it("adds minimum-sized shells by palette click and by an explicit HTML drop", async () => {
    const user = userEvent.setup();
    render(<GridLayoutEditor {...profileProps()} />);

    await user.click(screen.getByRole("button", { name: "Add text block" }));
    const textBlock = screen.getByRole("button", {
      name: /select text block/i,
    }) as HTMLElement;
    expect(textBlock.style.gridColumn).toBe("1 / span 2");
    expect(textBlock.style.gridRow).toBe("1 / span 1");

    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(() => "LINK"),
      effectAllowed: "all",
      dropEffect: "none",
    };
    const paletteLink = screen.getByRole("button", {
      name: "Add link block",
    });
    const grid = screen.getByTestId("grid-editor-surface");
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue(gridRect());
    fireEvent.dragStart(paletteLink, { dataTransfer });
    const dragOver = createEvent.dragOver(grid, { dataTransfer });
    Object.defineProperties(dragOver, {
      clientX: { value: 405 },
      clientY: { value: 165 },
    });
    fireEvent(grid, dragOver);
    const dropPreview = screen.getByTestId("grid-operation-preview");
    expect(dropPreview.textContent).toBe("Valid add preview.");
    expect(dropPreview.getAttribute("aria-label")).toBe(
      "Valid placement preview",
    );
    const drop = createEvent.drop(grid, { dataTransfer });
    Object.defineProperties(drop, {
      clientX: { value: 405 },
      clientY: { value: 165 },
    });
    fireEvent(grid, drop);

    const linkBlock = screen.getByRole("button", {
      name: /select link block/i,
    }) as HTMLElement;
    expect(linkBlock.style.gridColumn).toBe("5 / span 2");
    expect(linkBlock.style.gridRow).toBe("3 / span 1");
  });

  it("disables every add control at 50 blocks and explains the limit without color alone", () => {
    const blocks = Array.from({ length: 50 }, (_, index) =>
      block(`text-${index}`, "TEXT", {
        order: index,
        x: (index % 6) * 2,
        y: Math.floor(index / 6),
      }),
    );
    render(<GridLayoutEditor {...profileProps(blocks)} />);

    for (const control of screen.getAllByRole("button", {
      name: /add .* block/i,
    })) {
      expect((control as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getByRole("status").textContent).toContain(
      "50-block limit reached",
    );
  });

  it("shows snapped valid move and resize previews, including nearby integer edge snap", () => {
    render(
      <GridLayoutEditor
        {...profileProps([
          block("moving", "TEXT", { order: 0 }),
          block("neighbor", "TEXT", { order: 1, x: 4 }),
        ])}
      />,
    );
    const grid = screen.getByTestId("grid-editor-surface");
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue(gridRect());
    const moving = screen.getByRole("button", {
      name: /select text block moving/i,
    });

    fireEvent.pointerDown(moving, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(window, {
      clientX: 194,
      clientY: 82,
      pointerId: 1,
    });
    const movePreview = screen.getByTestId(
      "grid-operation-preview",
    ) as HTMLElement;
    expect(movePreview.style.gridColumn).toBe("3 / span 2");
    expect(movePreview.style.gridRow).toBe("2 / span 1");
    expect(movePreview.textContent).toMatch(/valid move/i);
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect((moving as HTMLElement).style.gridColumn).toBe("3 / span 2");
    expect((moving as HTMLElement).style.gridRow).toBe("2 / span 1");

    const resize = screen.getByRole("button", {
      name: "Resize text block moving",
    });
    fireEvent.pointerDown(resize, {
      clientX: 0,
      clientY: 0,
      pointerId: 2,
    });
    fireEvent.pointerMove(window, {
      clientX: 99,
      clientY: 80,
      pointerId: 2,
    });
    const resizePreview = screen.getByTestId(
      "grid-operation-preview",
    ) as HTMLElement;
    expect(resizePreview.style.gridColumn).toBe("3 / span 3");
    expect(resizePreview.style.gridRow).toBe("2 / span 2");
    fireEvent.pointerUp(window, { pointerId: 2 });
    expect((moving as HTMLElement).style.gridColumn).toBe("3 / span 3");

    fireEvent.pointerDown(resize, {
      clientX: 0,
      clientY: 0,
      pointerId: 3,
    });
    fireEvent.pointerMove(window, {
      clientX: -200,
      clientY: -160,
      pointerId: 3,
    });
    expect(
      screen.getByTestId("grid-operation-preview").getAttribute("aria-label"),
    ).toBe("Invalid placement preview");
    fireEvent.pointerUp(window, { pointerId: 3 });
    expect((moving as HTMLElement).style.gridColumn).toBe("3 / span 3");
    expect((moving as HTMLElement).style.gridRow).toBe("2 / span 2");
    expect(screen.getByTestId("placement-status").textContent).toContain(
      "cannot be resized",
    );
  });

  it("commits a valid swap and rolls an invalid differently-sized swap back with live text", () => {
    const view = render(
      <GridLayoutEditor
        {...profileProps([
          block("left", "TEXT", { order: 0 }),
          block("right", "TEXT", { order: 1, x: 4 }),
        ])}
      />,
    );
    let grid = screen.getByTestId("grid-editor-surface");
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue(gridRect());
    let left = screen.getByRole("button", { name: /select text block left/i });
    fireEvent.pointerDown(left, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 400, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect((left as HTMLElement).style.gridColumn).toBe("5 / span 2");
    expect(
      (
        screen.getByRole("button", {
          name: /select text block right/i,
        }) as HTMLElement
      ).style.gridColumn,
    ).toBe("1 / span 2");

    view.unmount();
    render(
      <GridLayoutEditor
        {...profileProps([
          block("wide", "PROJECT", { order: 0 }),
          block("edge", "TEXT", { order: 1, x: 10 }),
        ])}
      />,
    );
    grid = screen.getByTestId("grid-editor-surface");
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue(gridRect());
    const wide = screen.getByRole("button", {
      name: /select project block wide/i,
    });
    fireEvent.pointerDown(wide, { clientX: 0, clientY: 0, pointerId: 3 });
    fireEvent.pointerMove(window, {
      clientX: 1000,
      clientY: 0,
      pointerId: 3,
    });
    expect(
      screen.getByTestId("grid-operation-preview").getAttribute("aria-label"),
    ).toBe("Invalid placement preview");
    fireEvent.pointerUp(window, { pointerId: 3 });
    expect((wide as HTMLElement).style.gridColumn).toBe("1 / span 3");
    expect(screen.getByTestId("placement-status").textContent).toContain(
      "Those blocks cannot exchange positions here.",
    );
  });

  it("keeps the inspector beside the mounted grid and supports keyboard geometry outside typing controls", async () => {
    const user = userEvent.setup();
    render(
      <GridLayoutEditor
        {...profileProps([
          block("copy", "TEXT", { textContent: "Draft paragraph" }),
        ])}
      />,
    );

    expect(screen.getByRole("heading", { name: "Inspector" })).not.toBeNull();
    expect(screen.getByTestId("grid-editor-surface")).not.toBeNull();
    const text = screen.getByRole("button", {
      name: /select text block copy/i,
    });
    await user.click(text);
    const textarea = screen.getByRole("textbox", { name: "Plain text" });
    expect((textarea as HTMLTextAreaElement).value).toBe("Draft paragraph");

    fireEvent.keyDown(text, { key: "ArrowRight" });
    expect((text as HTMLElement).style.gridColumn).toBe("2 / span 2");
    fireEvent.keyDown(textarea, { key: "ArrowRight", shiftKey: true });
    expect((text as HTMLElement).style.gridColumn).toBe("2 / span 2");
    expect((text as HTMLElement).style.gridRow).toBe("1 / span 1");
    fireEvent.keyDown(text, { key: "ArrowDown", shiftKey: true });
    expect((text as HTMLElement).style.gridRow).toBe("1 / span 2");
  });

  it("deletes immediately, offers a brief Undo, and supports layout undo/redo", async () => {
    vi.useFakeTimers();
    render(<GridLayoutEditor {...profileProps([block("remove", "TEXT")])} />);
    fireEvent.click(
      screen.getByRole("button", { name: /select text block remove/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete block" }));
    expect(
      screen.queryByRole("button", { name: /select text block/i }),
    ).toBeNull();
    expect(screen.getAllByText("Block deleted.")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Undo deletion" }));
    expect(
      screen.getByRole("button", { name: /select text block remove/i }),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add link block" }));
    expect(
      screen.getByRole("button", { name: /select link block/i }),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo layout change" }));
    expect(
      screen.queryByRole("button", { name: /select link block/i }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Redo layout change" }));
    expect(
      screen.getByRole("button", { name: /select link block/i }),
    ).not.toBeNull();

    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.queryByRole("button", { name: "Undo deletion" })).toBeNull();
  });
});

describe("GridLayoutEditor content and preview", () => {
  it("edits plain text and selects only projects supplied by the owned-project payload", async () => {
    const user = userEvent.setup();
    render(
      <GridLayoutEditor
        {...profileProps([
          block("text", "TEXT", { order: 0 }),
          block("project", "PROJECT", { order: 1, x: 3 }),
        ])}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /select text block text/i }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Plain text" }),
      "Safe <b>text</b>",
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Plain text",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Safe <b>text</b>");

    await user.click(
      screen.getByRole("button", { name: /select project block project/i }),
    );
    const select = screen.getByRole("combobox", { name: "Owned project" });
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "No project selected",
      "Owned project",
      "Private project (private)",
    ]);
    await user.selectOptions(select, "owned-project");
    expect((select as HTMLSelectElement).value).toBe("owned-project");
  });

  it("shows imported image/link details as server-read-only and labels new empty shells", async () => {
    const user = userEvent.setup();
    render(
      <GridLayoutEditor
        {...profileProps([
          block("image", "IMAGE", {
            order: 0,
            imageUrl: "https://example.com/imported.png",
            imageMimeType: "image/png",
            imageAlt: "Imported alt",
          }),
          block("link", "LINK", {
            order: 1,
            x: 3,
            linkLabel: "Imported link",
            linkUrl: "https://example.com/legacy",
          }),
          block("empty", "IMAGE", { order: 2, x: 6 }),
        ])}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /select image block image/i }),
    );
    expect(
      screen.getByText("Imported image details (read-only)"),
    ).not.toBeNull();
    expect(
      screen.getAllByText("https://example.com/imported.png"),
    ).toHaveLength(2);
    expect(screen.queryByRole("textbox", { name: /image/i })).toBeNull();

    await user.click(
      screen.getByRole("button", { name: /select link block link/i }),
    );
    expect(
      screen.getByText("Imported link details (read-only)"),
    ).not.toBeNull();
    expect(screen.getAllByText("https://example.com/legacy")).toHaveLength(1);

    await user.click(
      screen.getByRole("button", { name: /select image block empty/i }),
    );
    expect(screen.getAllByText("Empty image shell")).toHaveLength(2);
    expect(
      screen.getByText(/image content controls are not included/i),
    ).not.toBeNull();
  });

  it("opens full-screen desktop and mobile previews through GridLayoutRenderer", () => {
    render(<GridLayoutEditor {...profileProps([block("preview", "TEXT")])} />);
    fireEvent.click(screen.getByRole("button", { name: "Preview layout" }));
    const dialog = screen.getByRole("dialog", { name: "Layout preview" });
    expect(dialog.classList.contains("fixed")).toBe(true);
    expect(dialog.classList.contains("bg-canvas")).toBe(true);
    expect(
      screen.getByTestId("grid-layout-renderer").getAttribute("data-mode"),
    ).toBe("desktop");
    fireEvent.click(screen.getByRole("button", { name: "Mobile preview" }));
    expect(
      screen.getByTestId("grid-layout-renderer").getAttribute("data-mode"),
    ).toBe("mobile");
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(screen.queryByRole("dialog", { name: "Layout preview" })).toBeNull();
  });
});

describe("GridLayoutEditor persistence", () => {
  it("autosaves a dirty profile at 30 seconds and stays idle while clean", async () => {
    vi.useFakeTimers();
    render(<GridLayoutEditor {...profileProps()} />);
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.saveProfileDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add text block" }));
    await act(async () => vi.advanceTimersByTimeAsync(29_999));
    expect(mocks.saveProfileDraft).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(mocks.saveProfileDraft).toHaveBeenCalledTimes(1);
    expect(mocks.saveProfileDraft).toHaveBeenCalledWith({
      expectedRevision: 4,
      blocks: [expect.objectContaining({ type: "TEXT", width: 2, height: 1 })],
    });
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.saveProfileDraft).toHaveBeenCalledTimes(1);
  });

  it("keeps dirty state after a failed autosave and retries on the next interval", async () => {
    vi.useFakeTimers();
    mocks.saveProfileDraft
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce({ revision: 5, blocks: [] });
    render(<GridLayoutEditor {...profileProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add text block" }));

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByRole("alert").textContent).toContain(
      "network unavailable",
    );
    expect(screen.getByText("Unsaved changes")).not.toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(mocks.saveProfileDraft).toHaveBeenCalledTimes(2);
  });

  it("supports Save Draft and Publish, retaining local state and a persistent error on failure", async () => {
    const user = userEvent.setup();
    mocks.saveProfileDraft.mockResolvedValue({
      revision: 5,
      blocks: [block("saved", "TEXT")],
    });
    mocks.publishProfile.mockRejectedValueOnce(new Error("publish failed"));
    render(<GridLayoutEditor {...profileProps([block("saved", "TEXT")])} />);

    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    expect(mocks.saveProfileDraft).toHaveBeenCalledWith({
      expectedRevision: 4,
      blocks: [block("saved", "TEXT")],
    });
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(mocks.publishProfile).toHaveBeenCalledWith({
      expectedRevision: 5,
      blocks: [block("saved", "TEXT")],
    });
    expect((await screen.findByRole("alert")).textContent).toContain(
      "publish failed",
    );
    expect(
      screen.getByRole("button", { name: /select text block saved/i }),
    ).not.toBeNull();
    expect(
      (screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("never autosaves projects and uses only Save & Publish", async () => {
    vi.useFakeTimers();
    render(<GridLayoutEditor {...projectProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add text block" }));
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(mocks.saveProfileDraft).not.toHaveBeenCalled();
    expect(mocks.publishProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save & Publish" }));
    await act(async () => Promise.resolve());
    expect(mocks.publishProject).toHaveBeenCalledTimes(1);
    expect(mocks.publishProject).toHaveBeenCalledWith({
      projectId: "page-project",
      expectedRevision: 4,
      blocks: [expect.objectContaining({ type: "TEXT" })],
    });
    expect(screen.queryByRole("button", { name: "Save Draft" })).toBeNull();
  });

  it("locks all saving after a conflict without discarding local blocks", async () => {
    const user = userEvent.setup();
    mocks.saveProfileDraft.mockRejectedValue({
      message: "This Grid layout changed in another tab.",
      data: { code: "CONFLICT" },
    });
    render(<GridLayoutEditor {...profileProps()} />);
    await user.click(screen.getByRole("button", { name: "Add text block" }));
    await user.click(screen.getByRole("button", { name: "Save Draft" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /reload or reopen/i,
    );
    expect(
      screen.getByRole("button", { name: /select text block/i }),
    ).not.toBeNull();
    expect(
      (screen.getByRole("button", { name: "Save Draft" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(mocks.publishProfile).not.toHaveBeenCalled();
  });
});
