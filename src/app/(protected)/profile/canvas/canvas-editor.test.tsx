/**
 * @vitest-environment jsdom
 *
 * Component tests for the canvas editor's discoverability features: the "⋯"
 * menu button (a second entry point to the shared card menu), the
 * first-run hint strip, and the Add Component flow that must work at every
 * viewport width. These run in jsdom via the docblock above so the rest of
 * the suite keeps its node environment.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasEditor } from "./canvas-editor";

type ServerElement = {
  id: string;
  type:
    | "ABOUT"
    | "LINKS"
    | "PROJECT"
    | "TEXT"
    | "IMAGE"
    | "LINK"
    | "AVATAR"
    | "NAME"
    | "USERNAME"
    | "CATEGORIES";
  projectId: string | null;
  textContent: string | null;
  imageUrl: string | null;
  imageCaption: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  projectTitleOverride: string | null;
  projectDescriptionOverride: string | null;
  projectHashtagsOverride: string[] | null;
  cardLayout: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  locked: boolean;
};

type EditorStateData = {
  mode: "CANVAS" | "GRID";
  shouldShowHint: boolean;
  ownerUserId: string;
  username: string;
  bounds: {
    width: number;
    maxHeight: number;
    minWidth: number;
    minHeight: number;
  };
  elements: ServerElement[];
  library: ({ type: "ABOUT" } | { type: "LINKS" })[];
  resources: {
    id: string;
    url: string;
    mimeType: string;
    createdAt: string;
  }[];
  snapshot: {
    revision: number;
    theme: "default" | "mist";
    backgroundColor: string | null;
    backgroundImageUrl: string | null;
    backgroundImageResourceId: string | null;
    profile: {
      displayName: string;
      bio?: string;
      school?: string;
      avatarUrl?: string;
      links: { label: string; url: string }[];
    };
    projects: unknown[];
  };
};

type EditorStateResult = {
  isPending: boolean;
  data: EditorStateData | undefined;
};

const mocks = vi.hoisted(() => ({
  editorState: vi.fn<() => EditorStateResult>(),
  saveDraftMutateAsync:
    vi.fn<
      (payload: unknown) => Promise<{ elements: unknown[]; revision: number }>
    >(),
  publishMutateAsync:
    vi.fn<
      (payload: unknown) => Promise<{ elements: unknown[]; revision: number }>
    >(),
  validateClipboardMutateAsync:
    vi.fn<(payload: unknown) => Promise<unknown[]>>(),
  dismissHintMutate: vi.fn<() => void>(),
  setResourceRemovedMutate:
    vi.fn<(input: { id: string; removed: boolean }) => void>(),
  routerPush: vi.fn<(href: string) => void>(),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    canvas: {
      getEditorState: {
        useQuery: () => mocks.editorState(),
      },
      saveDraft: {
        useMutation: () => ({
          mutateAsync: mocks.saveDraftMutateAsync,
          isPending: false,
          isError: false,
        }),
      },
      publish: {
        useMutation: () => ({
          mutateAsync: mocks.publishMutateAsync,
          isPending: false,
          isError: false,
        }),
      },
      validateClipboard: {
        useMutation: () => ({
          mutateAsync: mocks.validateClipboardMutateAsync,
          isPending: false,
          isError: false,
        }),
      },
      dismissHint: {
        useMutation: () => ({
          mutate: mocks.dismissHintMutate,
          isPending: false,
          isError: false,
        }),
      },
      setResourceRemoved: {
        useMutation: () => ({
          mutate: mocks.setResourceRemovedMutate,
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("~/app/project-card", () => ({
  ProjectCard: () => <div />,
}));

function baseData(overrides: Partial<EditorStateData> = {}): EditorStateData {
  return {
    mode: "CANVAS",
    shouldShowHint: false,
    ownerUserId: "owner-1",
    username: "test",
    bounds: { width: 1080, maxHeight: 2400, minWidth: 120, minHeight: 80 },
    elements: [],
    library: [{ type: "ABOUT" }, { type: "LINKS" }],
    resources: [],
    snapshot: {
      revision: 7,
      theme: "default",
      backgroundColor: null,
      backgroundImageUrl: null,
      backgroundImageResourceId: null,
      profile: {
        displayName: "Test User",
        bio: "",
        school: "",
        avatarUrl: "",
        links: [],
      },
      projects: [],
    },
    ...overrides,
  };
}

function directUploadFetchMock(result: Record<string, unknown>) {
  return vi
    .fn<
      (
        input: string,
        init?: RequestInit,
      ) => Promise<{
        ok: boolean;
        json?: () => Promise<Record<string, unknown>>;
      }>
    >()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intentId: "intent-1",
        uploadUrl: "https://storage.example.test/signed-upload",
        purpose: "canvas-resource",
      }),
    })
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ ok: true, json: async () => result });
}

function placedTextElement(): ServerElement {
  return {
    id: "element-1",
    type: "TEXT",
    projectId: null,
    textContent: "<p>Hello world</p>",
    imageUrl: null,
    imageCaption: null,
    linkLabel: null,
    linkUrl: null,
    projectTitleOverride: null,
    projectDescriptionOverride: null,
    projectHashtagsOverride: null,
    cardLayout: null,
    x: 24,
    y: 24,
    width: 320,
    height: 160,
    zIndex: 1,
    locked: false,
  };
}

function secondTextElement(
  overrides: Partial<ServerElement> = {},
): ServerElement {
  return {
    ...placedTextElement(),
    id: "element-2",
    textContent: "<p>Second card</p>",
    x: 500,
    y: 100,
    zIndex: 2,
    ...overrides,
  };
}

function thirdTextElement(
  overrides: Partial<ServerElement> = {},
): ServerElement {
  return {
    ...placedTextElement(),
    id: "element-3",
    textContent: "<p>Third card</p>",
    x: 800,
    y: 200,
    zIndex: 3,
    ...overrides,
  };
}

function placedIdentityElement(
  type: "ABOUT" | "LINKS" | "AVATAR" | "NAME" | "USERNAME" | "CATEGORIES",
  overrides: Partial<ServerElement> = {},
): ServerElement {
  return {
    ...placedTextElement(),
    id: `element-${type.toLowerCase()}`,
    type,
    textContent: null,
    x: 80,
    y: 300,
    ...overrides,
  };
}

function placedProjectElement(): ServerElement {
  return {
    id: "element-project",
    type: "PROJECT",
    projectId: "p1",
    textContent: null,
    imageUrl: null,
    imageCaption: null,
    linkLabel: null,
    linkUrl: null,
    projectTitleOverride: null,
    projectDescriptionOverride: null,
    projectHashtagsOverride: null,
    cardLayout: null,
    x: 24,
    y: 24,
    width: 320,
    height: 240,
    zIndex: 1,
    locked: false,
  };
}

function resource(
  overrides: Partial<{
    id: string;
    url: string;
    mimeType: string;
    createdAt: string;
  }> = {},
) {
  return {
    id: "resource-1",
    url: "https://example.com/uploads/photo.png",
    mimeType: "image/png",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function canvasCard(key: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-canvas-element-key="${key}"]`,
  );
  if (!element) throw new Error(`Missing canvas card ${key}`);
  return element;
}

function pointerClick(
  element: HTMLElement,
  pointerId: number,
  options: { shiftKey?: boolean; clientX?: number; clientY?: number } = {},
) {
  const event = {
    button: 0,
    pointerId,
    clientX: options.clientX ?? 30,
    clientY: options.clientY ?? 30,
    shiftKey: options.shiftKey ?? false,
  };
  fireEvent.pointerDown(element, event);
  fireEvent.pointerUp(element, event);
}

function moveCard(
  key: string,
  pointerId: number,
  from = { x: 30, y: 30 },
  to = { x: 50, y: 60 },
) {
  const card = canvasCard(key);
  fireEvent.pointerDown(card, {
    button: 0,
    pointerId,
    clientX: from.x,
    clientY: from.y,
  });
  fireEvent.pointerMove(card, {
    pointerId,
    clientX: to.x,
    clientY: to.y,
  });
  fireEvent.pointerUp(card, { pointerId });
}

function domRect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  };
}

function zIndex(key: string) {
  return Number(canvasCard(key).style.zIndex);
}

const projectProps = [
  {
    id: "p1",
    title: "Real Title",
    description: "Real description",
    category: "DESIGNER" as const,
    hashtags: ["alpha", "beta"],
    media: [],
  },
];

function renderEditorWithProject() {
  return render(
    <CanvasEditor
      bio={null}
      links={[]}
      projects={projectProps}
      displayName="Test User"
      username="test"
      school={null}
      avatarUrl={null}
      categories={[]}
    />,
  );
}

function renderEditor() {
  return render(
    <CanvasEditor
      bio={null}
      links={[]}
      projects={[]}
      displayName="Test User"
      username="test"
      school={null}
      avatarUrl={null}
      categories={[]}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "innerWidth", {
    value: 1024,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: 768,
    configurable: true,
  });
  mocks.saveDraftMutateAsync.mockResolvedValue({ elements: [], revision: 8 });
  mocks.publishMutateAsync.mockResolvedValue({ elements: [], revision: 8 });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the ⋯ menu button", () => {
  it("opens the same card menu right-click opens, without right-clicking", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    const user = userEvent.setup();
    renderEditor();

    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Open menu for Text" }),
    );

    expect(screen.getByRole("menu")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Edit" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Delete" })).not.toBeNull();
  });

  it("keeps right-click working, with only one menu open at a time", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    const user = userEvent.setup();
    renderEditor();

    // Right-click alone still opens the menu.
    fireEvent.contextMenu(screen.getByText("Hello world"));
    expect(screen.getByRole("menuitem", { name: "Edit" })).not.toBeNull();

    // Opening via the ⋯ button afterwards replaces it: still a single menu.
    await user.click(
      screen.getByRole("button", { name: "Open menu for Text" }),
    );
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    // Both entry points share Edit, Cut, Copy, Paste, Layer, and Delete.
    expect(screen.getAllByRole("menuitem")).toHaveLength(6);
  });

  it("is keyboard operable: Enter opens, focus lands in the menu, Escape closes and restores focus", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    const user = userEvent.setup();
    renderEditor();

    const moreButton = screen.getByRole("button", {
      name: "Open menu for Text",
    });
    moreButton.focus();
    await user.keyboard("{Enter}");

    // Focus moves into the menu so Tab reaches Edit/Delete directly.
    const editItem = screen.getByRole("menuitem", { name: "Edit" });
    expect(document.activeElement).toBe(editItem);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(moreButton);
  });
});

describe("shared menu targeting and Edit availability", () => {
  it("the ⋯ button selects an unselected target before opening the menu", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [placedTextElement(), secondTextElement()],
      }),
    });
    const user = userEvent.setup();
    renderEditor();
    pointerClick(canvasCard("element-1"), 1);

    await user.click(
      screen.getAllByRole("button", { name: "Open menu for Text" })[1]!,
    );

    expect(canvasCard("element-1").className).not.toContain("border-2");
    expect(canvasCard("element-2").className).toContain("border-2");
  });

  it("right-click selects an unselected target before opening the menu", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [placedTextElement(), secondTextElement()],
      }),
    });
    renderEditor();
    pointerClick(canvasCard("element-1"), 1);

    fireEvent.contextMenu(canvasCard("element-2"), {
      clientX: 520,
      clientY: 120,
    });

    expect(canvasCard("element-1").className).not.toContain("border-2");
    expect(canvasCard("element-2").className).toContain("border-2");
    expect(screen.getByRole("menuitem", { name: "Layer" })).not.toBeNull();
  });

  it.each(["button", "right-click"] as const)(
    "%s preserves an existing multi-selection and disables Edit",
    async (entryPoint) => {
      mocks.editorState.mockReturnValue({
        isPending: false,
        data: baseData({
          elements: [placedTextElement(), secondTextElement()],
        }),
      });
      const user = userEvent.setup();
      renderEditor();
      pointerClick(canvasCard("element-1"), 1);
      pointerClick(canvasCard("element-2"), 2, { shiftKey: true });

      if (entryPoint === "button") {
        const buttons = screen.getAllByRole("button", {
          name: "Open menu for Text",
        });
        await user.click(buttons[0]!);
      } else {
        fireEvent.contextMenu(canvasCard("element-1"), {
          clientX: 30,
          clientY: 30,
        });
      }

      expect(canvasCard("element-1").className).toContain("border-2");
      expect(canvasCard("element-2").className).toContain("border-2");
      const edit = screen.getByRole<HTMLButtonElement>("menuitem", {
        name: "Edit",
      });
      expect(edit.disabled).toBe(true);
      expect(edit.getAttribute("aria-disabled")).toBe("true");
      if (entryPoint === "button") {
        // Edit is disabled for a multi-selection, so focus lands on the first
        // enabled item (Cut).
        expect(document.activeElement).toBe(
          screen.getByRole("menuitem", { name: "Cut" }),
        );
      }
    },
  );
});

describe("the positioned Edit popup", () => {
  it("opens above the target, focuses its first field, and Escape restores the trigger", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.dataset.canvasElementKey === "element-1") {
          return domRect({ left: 100, top: 500, width: 320, height: 160 });
        }
        if (this.dataset.testid === "edit-popup") {
          return domRect({ left: 0, top: 0, width: 400, height: 240 });
        }
        return domRect({ left: 0, top: 0, width: 0, height: 0 });
      },
    );
    const user = userEvent.setup();
    renderEditor();
    const trigger = screen.getByRole("button", { name: "Open menu for Text" });

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    const popup = screen.getByTestId("edit-popup");
    expect(popup.style.left).toBe("100px");
    expect(popup.style.top).toBe("252px");
    expect(popup.style.position).toBe("");
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Text content" }),
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("edit-popup")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("moves below a top-edge card and shifts inward at the right viewport edge", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.dataset.canvasElementKey === "element-1") {
          return domRect({ left: 900, top: 20, width: 320, height: 160 });
        }
        if (this.dataset.testid === "edit-popup") {
          return domRect({ left: 0, top: 0, width: 400, height: 240 });
        }
        return domRect({ left: 0, top: 0, width: 0, height: 0 });
      },
    );
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", { name: "Open menu for Text" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    const popup = screen.getByTestId("edit-popup");
    expect(popup.style.left).toBe("616px");
    expect(popup.style.top).toBe("188px");
  });
});

describe("the first-run hint strip", () => {
  it("renders when shouldShowHint is true and dismisses optimistically", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ shouldShowHint: true }),
    });
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByText("New to the canvas?")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Got it" }));

    // Hidden immediately, without waiting for the mutation to resolve.
    expect(screen.queryByText("New to the canvas?")).toBeNull();
    expect(mocks.dismissHintMutate).toHaveBeenCalledTimes(1);
  });

  it("does not render when shouldShowHint is false", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ shouldShowHint: false }),
    });
    renderEditor();

    expect(screen.queryByText("New to the canvas?")).toBeNull();
  });

  it("does not render when an element is already placed, even if shouldShowHint is true", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ shouldShowHint: true, elements: [placedTextElement()] }),
    });
    renderEditor();

    expect(screen.queryByText("New to the canvas?")).toBeNull();
  });
});

describe("the Add Component flow", () => {
  it("renders its trigger buttons unconditionally (CSS-gated, not JS-gated, so they exist at mobile widths)", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData(),
    });
    renderEditor();

    expect(screen.getByRole("button", { name: "Text" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Image" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Link" })).not.toBeNull();
  });

  it("places a Link element on completion and hides the hint once the first element exists", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ shouldShowHint: true }),
    });
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByText("New to the canvas?")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Link" }));
    await user.type(screen.getByLabelText(/^Label/), "My portfolio");
    await user.type(screen.getByLabelText(/^URL/), "https://example.com");
    await user.click(screen.getByRole("button", { name: "Save link" }));

    // The element is placed via the default position + clamping logic and
    // rendered on the canvas, with its own ⋯ menu button.
    expect(screen.getByText("My portfolio")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Open menu for Link" }),
    ).not.toBeNull();

    // Placing a first element suppresses the hint without any dismissal.
    expect(screen.queryByText("New to the canvas?")).toBeNull();
  });
});

describe("canvas selection and group actions", () => {
  it("plain card clicks replace the selection", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [placedTextElement(), secondTextElement()],
      }),
    });
    renderEditor();

    expect(canvasCard("element-1").className).not.toContain("bg-surface");
    expect(document.querySelectorAll('[role="presentation"]')).toHaveLength(0);
    pointerClick(canvasCard("element-1"), 1);
    expect(canvasCard("element-1").className).toContain("border-2");
    expect(document.querySelectorAll('[role="presentation"]')).toHaveLength(4);

    pointerClick(canvasCard("element-2"), 2);
    expect(canvasCard("element-1").className).not.toContain("border-2");
    expect(canvasCard("element-2").className).toContain("border-2");
  });

  it("Shift-click toggles cards without starting a drag", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [placedTextElement(), secondTextElement()],
      }),
    });
    renderEditor();

    pointerClick(canvasCard("element-1"), 1);
    pointerClick(canvasCard("element-2"), 2, { shiftKey: true });
    expect(canvasCard("element-1").className).toContain("border-2");
    expect(canvasCard("element-2").className).toContain("border-2");

    pointerClick(canvasCard("element-1"), 3, { shiftKey: true });
    expect(canvasCard("element-1").className).not.toContain("border-2");
    expect(canvasCard("element-2").className).toContain("border-2");
  });

  it("defers collapsing a multi-selection until pointerup without movement", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [placedTextElement(), secondTextElement()],
      }),
    });
    renderEditor();
    pointerClick(canvasCard("element-1"), 1);
    pointerClick(canvasCard("element-2"), 2, { shiftKey: true });

    pointerClick(canvasCard("element-1"), 3);

    expect(canvasCard("element-1").className).toContain("border-2");
    expect(canvasCard("element-2").className).not.toContain("border-2");
  });

  it("clicking empty canvas space clears the selection", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    renderEditor();

    pointerClick(canvasCard("element-1"), 1);
    pointerClick(screen.getByTestId("canvas-surface"), 2, {
      clientX: 900,
      clientY: 900,
    });

    expect(canvasCard("element-1").className).not.toContain("border-2");
    expect(
      screen.queryByRole("button", { name: "Duplicate selected cards" }),
    ).toBeNull();
  });

  it("marquee selection includes every intersecting card", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [placedTextElement(), secondTextElement()],
      }),
    });
    renderEditor();
    const surface = screen.getByTestId("canvas-surface");

    fireEvent.pointerDown(surface, {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 30,
      clientY: 30,
    });

    expect(screen.getByTestId("selection-marquee")).not.toBeNull();
    expect(canvasCard("element-1").className).toContain("border-2");
    expect(canvasCard("element-2").className).not.toContain("border-2");

    fireEvent.pointerUp(surface, { pointerId: 1 });
    expect(screen.queryByTestId("selection-marquee")).toBeNull();
  });

  it("Shift-drag adds marquee intersections to the existing selection", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [placedTextElement(), secondTextElement()],
      }),
    });
    renderEditor();
    pointerClick(canvasCard("element-2"), 1);
    const surface = screen.getByTestId("canvas-surface");

    fireEvent.pointerDown(surface, {
      button: 0,
      pointerId: 2,
      clientX: 10,
      clientY: 10,
      shiftKey: true,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 2,
      clientX: 30,
      clientY: 30,
    });
    fireEvent.pointerUp(surface, { pointerId: 2 });

    expect(canvasCard("element-1").className).toContain("border-2");
    expect(canvasCard("element-2").className).toContain("border-2");
  });

  it("adds marquee intersections to the selection while Select multiple is active", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [placedTextElement(), secondTextElement()],
      }),
    });
    const user = userEvent.setup();
    renderEditor();
    // Touch has no Shift key, so "Select multiple" is the additive modifier.
    await user.click(screen.getByRole("button", { name: "Select multiple" }));
    pointerClick(canvasCard("element-2"), 1);
    const surface = screen.getByTestId("canvas-surface");

    // A plain (no-shift) marquee drag over element-1 must extend, not replace.
    fireEvent.pointerDown(surface, {
      button: 0,
      pointerId: 2,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 2,
      clientX: 30,
      clientY: 30,
    });
    fireEvent.pointerUp(surface, { pointerId: 2 });

    expect(canvasCard("element-1").className).toContain("border-2");
    expect(canvasCard("element-2").className).toContain("border-2");
  });

  it("suppresses the browser touch-scroll only while a marquee drag is active", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    renderEditor();
    const surface = screen.getByTestId("canvas-surface");

    // fireEvent returns false when the handler called preventDefault. With no
    // marquee in progress the move handler bails out and leaves scroll intact.
    expect(
      fireEvent.pointerMove(surface, { pointerId: 9, clientX: 30, clientY: 30 }),
    ).toBe(true);

    fireEvent.pointerDown(surface, {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    // Once a marquee owns the pointer, the move is preventDefault-ed so the
    // page underneath the finger does not scroll (spec 19/57/58).
    expect(
      fireEvent.pointerMove(surface, { pointerId: 1, clientX: 30, clientY: 30 }),
    ).toBe(false);
  });

  it("moves a multi-selection with one group-clamped delta", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [placedTextElement(), secondTextElement()],
      }),
    });
    renderEditor();
    pointerClick(canvasCard("element-1"), 1);
    pointerClick(canvasCard("element-2"), 2, { shiftKey: true });
    const first = canvasCard("element-1");
    const second = canvasCard("element-2");

    fireEvent.pointerDown(first, {
      button: 0,
      pointerId: 3,
      clientX: 30,
      clientY: 30,
    });
    fireEvent.pointerMove(first, {
      pointerId: 3,
      clientX: -1000,
      clientY: -1000,
    });
    fireEvent.pointerUp(first, { pointerId: 3 });

    expect(first.style.left).toBe("0px");
    expect(first.style.top).toBe("0px");
    expect(second.style.left).toBe("476px");
    expect(second.style.top).toBe("76px");
  });

  it("blocks the whole group drag when one selected card is locked", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [
          { ...placedTextElement(), locked: true },
          secondTextElement(),
        ],
      }),
    });
    renderEditor();
    pointerClick(canvasCard("element-1"), 1);
    pointerClick(canvasCard("element-2"), 2, { shiftKey: true });
    const second = canvasCard("element-2");

    fireEvent.pointerDown(second, {
      button: 0,
      pointerId: 3,
      clientX: 510,
      clientY: 110,
    });
    fireEvent.pointerMove(second, {
      pointerId: 3,
      clientX: 700,
      clientY: 400,
    });
    fireEvent.pointerUp(second, { pointerId: 3 });

    expect(canvasCard("element-1").style.left).toBe("24px");
    expect(second.style.left).toBe("500px");
  });

  it("locks every card in a mixed selection, then offers Unlock", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [
          { ...placedTextElement(), locked: true },
          secondTextElement(),
        ],
      }),
    });
    const user = userEvent.setup();
    renderEditor();
    pointerClick(canvasCard("element-1"), 1);
    pointerClick(canvasCard("element-2"), 2, { shiftKey: true });

    await user.click(
      screen.getByRole("button", { name: "Lock selected cards" }),
    );

    expect(screen.getAllByRole("img", { name: /locked/ })).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Unlock selected cards" }),
    ).not.toBeNull();
  });

  it("duplicates the selection as unlocked copies that become selected", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [{ ...placedTextElement(), locked: true }],
      }),
    });
    const user = userEvent.setup();
    renderEditor();
    pointerClick(canvasCard("element-1"), 1);

    await user.click(
      screen.getByRole("button", { name: "Duplicate selected cards" }),
    );

    expect(screen.getAllByText("Hello world")).toHaveLength(2);
    expect(screen.getAllByRole("img", { name: "Text locked" })).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Lock selected cards" }),
    ).not.toBeNull();
  });

  it("deletes the whole current selection immediately", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [placedTextElement(), secondTextElement()],
      }),
    });
    const user = userEvent.setup();
    renderEditor();
    pointerClick(canvasCard("element-1"), 1);
    pointerClick(canvasCard("element-2"), 2, { shiftKey: true });

    await user.click(
      screen.getByRole("button", { name: "Delete selected cards" }),
    );

    expect(screen.queryByText("Hello world")).toBeNull();
    expect(screen.queryByText("Second card")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Duplicate selected cards" }),
    ).toBeNull();
  });

  it("Select multiple mode toggles tapped cards", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [placedTextElement(), secondTextElement()],
      }),
    });
    const user = userEvent.setup();
    renderEditor();

    const toggle = screen.getByRole("button", { name: "Select multiple" });
    await user.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    pointerClick(canvasCard("element-1"), 1);
    pointerClick(canvasCard("element-2"), 2);

    expect(canvasCard("element-1").className).toContain("border-2");
    expect(canvasCard("element-2").className).toContain("border-2");
  });
});

describe("explicit Layer menu actions", () => {
  it.each([
    {
      action: "Bring to front",
      targetIndex: 0,
      expected: [3, 1, 2],
    },
    {
      action: "Bring forward",
      targetIndex: 0,
      expected: [2, 1, 3],
    },
    {
      action: "Send backward",
      targetIndex: 2,
      expected: [1, 3, 2],
    },
    {
      action: "Send to back",
      targetIndex: 2,
      expected: [2, 3, 1],
    },
  ])(
    "$action changes one card's stacking order",
    async ({ action, targetIndex, expected }) => {
      mocks.editorState.mockReturnValue({
        isPending: false,
        data: baseData({
          elements: [
            placedTextElement(),
            secondTextElement(),
            thirdTextElement(),
          ],
        }),
      });
      const user = userEvent.setup();
      renderEditor();
      const menuButtons = screen.getAllByRole("button", {
        name: "Open menu for Text",
      });

      await user.click(menuButtons[targetIndex]!);
      await user.click(screen.getByRole("menuitem", { name: "Layer" }));
      await user.click(screen.getByRole("menuitem", { name: action }));

      expect([
        zIndex("element-1"),
        zIndex("element-2"),
        zIndex("element-3"),
      ]).toEqual(expected);
    },
  );

  it.each([
    {
      action: "Bring to front",
      selected: ["element-1", "element-3"],
      expected: [2, 1, 3],
    },
    {
      action: "Bring forward",
      selected: ["element-1", "element-2"],
      expected: [2, 3, 1],
    },
    {
      action: "Send backward",
      selected: ["element-2", "element-3"],
      expected: [3, 1, 2],
    },
    {
      action: "Send to back",
      selected: ["element-1", "element-3"],
      expected: [1, 3, 2],
    },
  ])(
    "$action moves a multi-selection as a group without reversing it",
    async ({ action, selected, expected }) => {
      mocks.editorState.mockReturnValue({
        isPending: false,
        data: baseData({
          elements: [
            placedTextElement(),
            secondTextElement(),
            thirdTextElement(),
          ],
        }),
      });
      const user = userEvent.setup();
      renderEditor();
      pointerClick(canvasCard(selected[0]!), 1);
      pointerClick(canvasCard(selected[1]!), 2, { shiftKey: true });

      fireEvent.contextMenu(canvasCard(selected[0]!), {
        clientX: 30,
        clientY: 30,
      });
      await user.click(screen.getByRole("menuitem", { name: "Layer" }));
      await user.click(screen.getByRole("menuitem", { name: action }));

      expect([
        zIndex("element-1"),
        zIndex("element-2"),
        zIndex("element-3"),
      ]).toEqual(expected);
      expect(zIndex(selected[0]!)).toBeLessThan(zIndex(selected[1]!));
    },
  );

  it("does not create history for a boundary no-op", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [
          placedTextElement(),
          secondTextElement(),
          thirdTextElement(),
        ],
      }),
    });
    const user = userEvent.setup();
    renderEditor();
    const undo = screen.getByRole<HTMLButtonElement>("button", { name: "Undo" });

    fireEvent.contextMenu(canvasCard("element-3"), {
      clientX: 810,
      clientY: 210,
    });
    await user.click(screen.getByRole("menuitem", { name: "Layer" }));
    await user.click(screen.getByRole("menuitem", { name: "Bring to front" }));

    expect(zIndex("element-3")).toBe(3);
    expect(undo.disabled).toBe(true);
    expect(mocks.saveDraftMutateAsync).not.toHaveBeenCalled();
  });
});

describe("undo and redo history", () => {
  it("undo reverses a move", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    const user = userEvent.setup();
    renderEditor();

    moveCard("element-1", 1);
    expect(canvasCard("element-1").style.left).toBe("44px");
    expect(canvasCard("element-1").style.top).toBe("54px");

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(canvasCard("element-1").style.left).toBe("24px");
    expect(canvasCard("element-1").style.top).toBe("24px");
  });

  it("undo reverses a delete so the element reappears", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    const user = userEvent.setup();
    renderEditor();
    pointerClick(canvasCard("element-1"), 1);

    await user.click(
      screen.getByRole("button", { name: "Delete selected cards" }),
    );
    expect(screen.queryByText("Hello world")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.getByText("Hello world")).not.toBeNull();
  });

  it("redo re-applies a change after undo", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    const user = userEvent.setup();
    renderEditor();
    moveCard("element-1", 1);

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await user.click(screen.getByRole("button", { name: "Redo" }));

    expect(canvasCard("element-1").style.left).toBe("44px");
    expect(canvasCard("element-1").style.top).toBe("54px");
  });

  it("clears the redo stack when a new edit follows an undo", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    const user = userEvent.setup();
    renderEditor();
    moveCard("element-1", 1);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Redo" }).disabled,
    ).toBe(false);

    pointerClick(canvasCard("element-1"), 2);
    await user.click(
      screen.getByRole("button", { name: "Duplicate selected cards" }),
    );

    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Redo" }).disabled,
    ).toBe(true);
  });

  it("disables and enables the Undo and Redo buttons with their stacks", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    const user = userEvent.setup();
    renderEditor();
    const undoButton = screen.getByRole<HTMLButtonElement>("button", {
      name: "Undo",
    });
    const redoButton = screen.getByRole<HTMLButtonElement>("button", {
      name: "Redo",
    });

    expect(undoButton.disabled).toBe(true);
    expect(redoButton.disabled).toBe(true);
    pointerClick(canvasCard("element-1"), 1);
    expect(undoButton.disabled).toBe(true);
    expect(redoButton.disabled).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "Duplicate selected cards" }),
    );
    expect(undoButton.disabled).toBe(false);
    expect(redoButton.disabled).toBe(true);

    await user.click(undoButton);
    expect(undoButton.disabled).toBe(true);
    expect(redoButton.disabled).toBe(false);
  });

  it("supports Ctrl+Z, Ctrl+Y, and Ctrl+Shift+Z", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    renderEditor();
    moveCard("element-1", 1);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(canvasCard("element-1").style.left).toBe("24px");
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(canvasCard("element-1").style.left).toBe("44px");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(canvasCard("element-1").style.left).toBe("44px");
  });

  it("does not intercept Ctrl+Z while typing in a text input", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    const user = userEvent.setup();
    renderEditor();
    moveCard("element-1", 1);
    await user.click(screen.getByRole("button", { name: "Link" }));
    const input = screen.getByLabelText(/^Label/);

    const event = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(canvasCard("element-1").style.left).toBe("44px");
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Undo" }).disabled,
    ).toBe(false);
  });
});

describe("the operating-system clipboard", () => {
  const CLIPBOARD_KIND = "provenance.canvas.cards";

  function stubClipboard(
    overrides: Partial<{
      writeText: ReturnType<typeof vi.fn>;
      read: ReturnType<typeof vi.fn>;
    }> = {},
  ) {
    const clipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
      read: vi.fn(),
      ...overrides,
    };
    Object.defineProperty(navigator, "clipboard", {
      value: clipboard,
      configurable: true,
    });
    return clipboard;
  }

  function firePaste(
    target: EventTarget,
    { text, image }: { text?: string; image?: File },
  ) {
    const items = image
      ? [{ kind: "file", type: image.type, getAsFile: () => image }]
      : [];
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) => (type === "text/plain" ? (text ?? "") : ""),
        items,
      },
    });
    target.dispatchEvent(event);
    return event;
  }

  function cardPayload(
    cards: Partial<ServerElement>[] = [{ textContent: "<p>Pasted card</p>" }],
    overrides: Record<string, unknown> = {},
  ) {
    return JSON.stringify({
      kind: CLIPBOARD_KIND,
      version: 1,
      ownerUserId: "owner-1",
      profileUsername: "test",
      cards: cards.map((card) => ({ ...placedTextElement(), ...card })),
      ...overrides,
    });
  }

  it("Copy writes the versioned structured payload for the selection", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    const clipboard = stubClipboard();
    renderEditor();
    pointerClick(canvasCard("element-1"), 1);

    fireEvent.keyDown(window, { key: "c", ctrlKey: true });

    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(
      clipboard.writeText.mock.calls[0]![0] as string,
    ) as {
      kind: string;
      version: number;
      ownerUserId: string;
      profileUsername: string;
      cards: { type: string; textContent: string }[];
    };
    expect(payload).toMatchObject({
      kind: CLIPBOARD_KIND,
      version: 1,
      ownerUserId: "owner-1",
      profileUsername: "test",
    });
    expect(payload.cards).toHaveLength(1);
    expect(payload.cards[0]).toMatchObject({
      type: "TEXT",
      textContent: "<p>Hello world</p>",
    });
  });

  it("Cut removes the selection as one undo step after a successful write", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    // userEvent.setup() installs its own navigator.clipboard, so stub after it.
    const user = userEvent.setup();
    const clipboard = stubClipboard();
    renderEditor();
    pointerClick(canvasCard("element-1"), 1);

    fireEvent.keyDown(window, { key: "x", ctrlKey: true });

    await waitFor(() => expect(screen.queryByText("Hello world")).toBeNull());
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    const undo = screen.getByRole<HTMLButtonElement>("button", {
      name: "Undo",
    });
    expect(undo.disabled).toBe(false);

    await user.click(undo);
    expect(screen.getByText("Hello world")).not.toBeNull();
    expect(undo.disabled).toBe(true);
  });

  it("Cut does not delete anything when the clipboard write fails", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    renderEditor();
    pointerClick(canvasCard("element-1"), 1);

    fireEvent.keyDown(window, { key: "x", ctrlKey: true });

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByText("Hello world")).not.toBeNull();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Undo" }).disabled,
    ).toBe(true);
  });

  it("pasting a valid same-owner payload adds offset, unlocked, selected cards", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    mocks.validateClipboardMutateAsync.mockResolvedValue([
      {
        type: "TEXT",
        textContent: "<p>Pasted card</p>",
        x: 24,
        y: 24,
        width: 320,
        height: 160,
        zIndex: 1,
        locked: true,
      },
    ]);
    stubClipboard();
    renderEditor();

    await act(async () => {
      firePaste(window, { text: cardPayload() });
    });

    expect(mocks.validateClipboardMutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Pasted card")).not.toBeNull();
    const pasted = canvasCard("new-1");
    // Offset by the group offset (24) from the original 24,24.
    expect(pasted.style.left).toBe("48px");
    expect(pasted.style.top).toBe("48px");
    // Pasted copies start unlocked even though the source card was locked.
    expect(screen.queryByRole("img", { name: /locked/ })).toBeNull();
    expect(pasted.className).toContain("border-2");
  });

  it("rejects a payload from another user without creating anything", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    mocks.validateClipboardMutateAsync.mockRejectedValue(
      new Error("Cards copied from another profile cannot be pasted here."),
    );
    stubClipboard();
    renderEditor();

    await act(async () => {
      firePaste(window, {
        text: cardPayload([{ textContent: "<p>Foreign card</p>" }], {
          ownerUserId: "someone-else",
        }),
      });
    });

    expect(mocks.validateClipboardMutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Foreign card")).toBeNull();
    expect(screen.queryByText("new-1")).toBeNull();
    expect(await screen.findByRole("alert")).not.toBeNull();
  });

  it("ignores a malformed payload with an error and no server call", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    stubClipboard();
    renderEditor();

    await act(async () => {
      // Contains the marker substring so the handler intercepts it, but is not
      // valid JSON, so it never reaches the server and nothing is added.
      firePaste(window, { text: `broken ${CLIPBOARD_KIND} {{{` });
    });

    expect(mocks.validateClipboardMutateAsync).not.toHaveBeenCalled();
    expect(document.querySelector('[data-canvas-element-key="new-1"]')).toBeNull();
    expect(await screen.findByRole("alert")).not.toBeNull();
  });

  it("pasting an image uploads it and adds an Image card with the resourceId", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData(),
    });
    const fetchMock = directUploadFetchMock({
      url: "https://example.com/pasted.png",
      mimeType: "image/png",
      resource: { id: "resource-9", url: "https://example.com/pasted.png" },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    stubClipboard();
    renderEditor();

    const file = new File(["img"], "pasted.png", { type: "image/png" });
    await act(async () => {
      firePaste(window, { image: file });
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/upload/intent");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(
      JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string),
    ).toMatchObject({
      purpose: "canvas-resource",
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://storage.example.test/signed-upload",
    );
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(file);
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/upload/finalize");
    expect(canvasCard("new-1")).not.toBeNull();

    // The resourceId flows into the published snapshot for the Image card.
    await user.click(screen.getByRole("button", { name: "Save Layout" }));
    await waitFor(() => expect(mocks.publishMutateAsync).toHaveBeenCalled());
    const published = mocks.publishMutateAsync.mock.calls[0]?.[0] as {
      elements: { type: string; imageUrl?: string; resourceId?: string }[];
    };
    expect(published.elements).toContainEqual(
      expect.objectContaining({
        type: "IMAGE",
        imageUrl: "https://example.com/pasted.png",
        resourceId: "resource-9",
      }),
    );
  });

  it("creates neither a resource nor a card when the image upload fails", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData(),
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Resources must be images." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    stubClipboard();
    renderEditor();

    const file = new File(["img"], "pasted.png", { type: "image/png" });
    await act(async () => {
      firePaste(window, { image: file });
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(document.querySelector('[data-canvas-element-key="new-1"]')).toBeNull();
    expect(await screen.findByRole("alert")).not.toBeNull();
  });

  it("does not intercept a paste into an open text input", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData(),
    });
    stubClipboard();
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Link" }));
    const input = screen.getByLabelText(/^Label/);
    const event = firePaste(input, { text: cardPayload() });

    expect(event.defaultPrevented).toBe(false);
    expect(mocks.validateClipboardMutateAsync).not.toHaveBeenCalled();
  });

  it("menu Copy, Cut, and Paste match their keyboard equivalents", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    mocks.validateClipboardMutateAsync.mockResolvedValue([
      {
        type: "TEXT",
        textContent: "<p>Pasted card</p>",
        x: 24,
        y: 24,
        width: 320,
        height: 160,
        zIndex: 1,
        locked: false,
      },
    ]);
    // userEvent.setup() installs its own navigator.clipboard, so stub after it.
    const user = userEvent.setup();
    const clipboard = stubClipboard({
      read: vi.fn().mockResolvedValue([
        {
          types: ["text/plain"],
          getType: async () =>
            ({ text: async () => cardPayload() }) as unknown as Blob,
        },
      ]),
    });
    renderEditor();

    // Menu Copy writes the payload, exactly like Ctrl+C.
    await user.click(screen.getByRole("button", { name: "Open menu for Text" }));
    await user.click(screen.getByRole("menuitem", { name: "Copy" }));
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledTimes(1));

    // Menu Paste reads the clipboard and adds an offset card.
    await user.click(screen.getByRole("button", { name: "Open menu for Text" }));
    await user.click(screen.getByRole("menuitem", { name: "Paste" }));
    await waitFor(() => expect(screen.getByText("Pasted card")).not.toBeNull());

    // Menu Cut removes the original selection after writing it.
    pointerClick(canvasCard("element-1"), 5);
    await user.click(
      screen.getAllByRole("button", { name: "Open menu for Text" })[0]!,
    );
    await user.click(screen.getByRole("menuitem", { name: "Cut" }));
    await waitFor(() => expect(screen.queryByText("Hello world")).toBeNull());
    expect(clipboard.writeText).toHaveBeenCalledTimes(2);
  });
});

describe("profile content in the Edit popup", () => {
  it("patches display name, bio, avatar, and validated links into the published snapshot", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [
          placedIdentityElement("NAME", { zIndex: 1 }),
          placedIdentityElement("ABOUT", { zIndex: 2, x: 260 }),
          placedIdentityElement("LINKS", { zIndex: 3, x: 440 }),
          placedIdentityElement("AVATAR", { zIndex: 4, x: 620 }),
        ],
      }),
    });
    const fetchMock = directUploadFetchMock({
      url: "https://example.com/new-avatar.png",
      mimeType: "image/png",
      resource: { id: "avatar-resource" },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", { name: "Open menu for Name" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const displayNameInput = screen.getByLabelText("Display name");
    await user.clear(displayNameInput);
    await user.type(displayNameInput, "Canvas Name");
    await user.click(screen.getByRole("button", { name: "Close edit popup" }));

    await user.click(
      screen.getByRole("button", { name: "Open menu for About" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const bioInput = screen.getByLabelText("Bio");
    await user.clear(bioInput);
    await user.type(bioInput, "Canvas bio");
    await user.click(screen.getByRole("button", { name: "Close edit popup" }));

    await user.click(
      screen.getByRole("button", { name: "Open menu for Links" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Add link" }));
    await user.type(screen.getByLabelText("Label"), "Portfolio");
    await user.type(screen.getByLabelText("URL"), "https://example.com/work");
    await user.click(screen.getByRole("button", { name: "Apply links" }));
    await user.click(screen.getByRole("button", { name: "Close edit popup" }));

    await user.click(
      screen.getByRole("button", { name: "Open menu for Avatar" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Profile picture"), file);
    await screen.findByText("https://example.com/new-avatar.png");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/upload/intent");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(
      JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string),
    ).toMatchObject({
      purpose: "canvas-resource",
    });
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(file);
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/upload/finalize");
    await user.click(screen.getByRole("button", { name: "Close edit popup" }));

    expect(screen.getByText("Canvas Name")).not.toBeNull();
    expect(screen.getByText("Canvas bio")).not.toBeNull();
    expect(screen.getByText("Portfolio")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Save Layout" }));
    await waitFor(() => expect(mocks.publishMutateAsync).toHaveBeenCalled());
    const published = mocks.publishMutateAsync.mock.calls[0]?.[0] as {
      profile: EditorStateData["snapshot"]["profile"];
    };
    expect(published.profile).toEqual({
      displayName: "Canvas Name",
      bio: "Canvas bio",
      school: "",
      avatarUrl: "https://example.com/new-avatar.png",
      links: [{ label: "Portfolio", url: "https://example.com/work" }],
    });
  });

  it("keeps an invalid links row out of the draft snapshot", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedIdentityElement("LINKS")] }),
    });
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", { name: "Open menu for Links" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Add link" }));
    await user.type(screen.getByLabelText("Label"), "Unsafe");
    await user.type(screen.getByLabelText("URL"), "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Apply links" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Enter a valid http(s) URL.",
    );
    await user.click(screen.getByRole("button", { name: "Close edit popup" }));
    await user.click(screen.getByRole("button", { name: "Save Layout" }));
    await waitFor(() => expect(mocks.publishMutateAsync).toHaveBeenCalled());
    const published = mocks.publishMutateAsync.mock.calls[0]?.[0] as {
      profile: EditorStateData["snapshot"]["profile"];
    };
    expect(published.profile.links).toEqual([]);
  });

  it.each(["USERNAME", "CATEGORIES"] as const)(
    "%s exposes appearance only and no editable profile content",
    async (type) => {
      mocks.editorState.mockReturnValue({
        isPending: false,
        data: baseData({ elements: [placedIdentityElement(type)] }),
      });
      const user = userEvent.setup();
      renderEditor();

      await user.click(
        screen.getByRole("button", {
          name: `Open menu for ${type === "USERNAME" ? "Username" : "Categories"}`,
        }),
      );
      await user.click(screen.getByRole("menuitem", { name: "Edit" }));

      expect(screen.getByLabelText("Text color")).not.toBeNull();
      expect(screen.queryByLabelText("Display name")).toBeNull();
      expect(screen.queryByLabelText("Bio")).toBeNull();
      expect(screen.queryByLabelText("Profile picture")).toBeNull();
      expect(screen.queryByText("External links")).toBeNull();
    },
  );

  it("autosaves an edited profile field from the local snapshot", async () => {
    vi.useFakeTimers();
    try {
      mocks.editorState.mockReturnValue({
        isPending: false,
        data: baseData({ elements: [placedIdentityElement("NAME")] }),
      });
      renderEditor();
      fireEvent.click(
        screen.getByRole("button", { name: "Open menu for Name" }),
      );
      fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
      fireEvent.change(screen.getByLabelText("Display name"), {
        target: { value: "Autosaved Name" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Close edit popup" }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });

      const saved = mocks.saveDraftMutateAsync.mock.calls[0]?.[0] as {
        profile: EditorStateData["snapshot"]["profile"];
      };
      expect(saved.profile.displayName).toBe("Autosaved Name");
    } finally {
      vi.useRealTimers();
    }
  });

  it("commits a profile edit session as one undo history entry", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedIdentityElement("NAME")] }),
    });
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", { name: "Open menu for Name" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const input = screen.getByLabelText("Display name");
    await user.clear(input);
    await user.type(input, "Many keystrokes");
    await user.click(screen.getByRole("button", { name: "Close edit popup" }));
    const undo = screen.getByRole<HTMLButtonElement>("button", {
      name: "Undo",
    });
    expect(undo.disabled).toBe(false);

    await user.click(undo);

    expect(screen.getByText("Test User")).not.toBeNull();
    expect(undo.disabled).toBe(true);
  });
});

describe("snapshot publishing", () => {
  it("publishes the complete editor snapshot and navigates to the profile", async () => {
    const element = placedTextElement();
    element.locked = true;
    const snapshot = {
      revision: 7,
      theme: "mist" as const,
      backgroundColor: "#112233",
      backgroundImageUrl: "https://example.com/background.png",
      backgroundImageResourceId: "resource-1",
      profile: {
        displayName: "Draft Name",
        bio: "Draft bio",
        school: "Draft school",
        avatarUrl: "https://example.com/avatar.png",
        links: [{ label: "Site", url: "https://example.com" }],
      },
      projects: [
        {
          id: "p1",
          title: "Draft project",
          description: "Draft description",
          category: "DESIGNER",
          hashtags: ["draft"],
          links: [],
          layout: "default",
          private: false,
          excludeFromFeed: false,
          media: [],
        },
      ],
    };
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [element], snapshot }),
    });
    mocks.publishMutateAsync.mockImplementation(async (payload) => ({
      elements: (payload as { elements: unknown[] }).elements,
      revision: 8,
    }));
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Save Layout" }));

    await waitFor(() => expect(mocks.publishMutateAsync).toHaveBeenCalled());
    expect(mocks.publishMutateAsync).toHaveBeenCalledWith({
      revision: 8,
      elements: [
        {
          type: "TEXT",
          textContent: "<p>Hello world</p>",
          x: 24,
          y: 24,
          width: 320,
          height: 160,
          zIndex: 1,
          locked: true,
        },
      ],
      theme: snapshot.theme,
      backgroundColor: snapshot.backgroundColor,
      backgroundImageUrl: snapshot.backgroundImageUrl,
      backgroundImageResourceId: snapshot.backgroundImageResourceId,
      profile: snapshot.profile,
      projects: snapshot.projects,
    });
    expect(mocks.routerPush).toHaveBeenCalledWith("/test");
  });

  it("keeps the local draft unchanged and stays in the editor when publish fails", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    mocks.publishMutateAsync.mockRejectedValueOnce(new Error("publish failed"));
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Save Layout" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Publish failed. Try again.",
    );
    expect(screen.getByText("Hello world")).not.toBeNull();
    expect(mocks.routerPush).not.toHaveBeenCalled();
    const failedPayload = mocks.publishMutateAsync.mock.calls[0]![0];

    mocks.publishMutateAsync.mockResolvedValueOnce({
      elements: [],
      revision: 8,
    });
    await user.click(screen.getByRole("button", { name: "Save Layout" }));

    await waitFor(() =>
      expect(mocks.publishMutateAsync).toHaveBeenCalledTimes(2),
    );
    expect(mocks.publishMutateAsync.mock.calls[1]![0]).toEqual(failedPayload);
  });

  it("uses the autosave response revision for the next publish", async () => {
    vi.useFakeTimers();
    try {
      mocks.editorState.mockReturnValue({
        isPending: false,
        data: baseData(),
      });
      mocks.saveDraftMutateAsync.mockResolvedValue({
        elements: [],
        revision: 8,
      });
      renderEditor();

      fireEvent.click(screen.getByRole("button", { name: "Link" }));
      fireEvent.change(screen.getByLabelText(/^Label/), {
        target: { value: "Portfolio" },
      });
      fireEvent.change(screen.getByLabelText(/^URL/), {
        target: { value: "https://example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save link" }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(mocks.saveDraftMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ revision: 8 }),
      );

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save Layout" }));
        await Promise.resolve();
      });
      expect(mocks.publishMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ revision: 9 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the PROJECT card panel", () => {
  it("Edit opens the inline panel instead of navigating to the project edit page", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedProjectElement()], library: [] }),
    });
    const user = userEvent.setup();
    renderEditorWithProject();

    await user.click(
      screen.getByRole("button", { name: "Open menu for Project" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    // The inline panel is shown (its controls exist) and no navigation happened.
    expect(screen.getByLabelText("Card layout")).not.toBeNull();
    expect(screen.getByLabelText("Override hashtags")).not.toBeNull();
    expect(mocks.routerPush).not.toHaveBeenCalled();
  });

  it("pre-fills override fields with the real project's values as placeholders", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedProjectElement()], library: [] }),
    });
    const user = userEvent.setup();
    renderEditorWithProject();

    await user.click(
      screen.getByRole("button", { name: "Open menu for Project" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(
      screen.getByLabelText("Title override").getAttribute("placeholder"),
    ).toBe("Real Title");
    expect(
      screen.getByLabelText("Description override").getAttribute("placeholder"),
    ).toBe("Real description");
  });

  it("offers an Edit full project link to the project's edit page", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedProjectElement()], library: [] }),
    });
    const user = userEvent.setup();
    renderEditorWithProject();

    await user.click(
      screen.getByRole("button", { name: "Open menu for Project" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    const link = screen.getByRole("link", { name: /Edit full project/ });
    expect(link.getAttribute("href")).toBe("/projects/p1/edit");
  });
});

describe("the Resources library section", () => {
  const DRAG_MIME = "application/x-canvas-item";

  function fireResourceDrop(
    surface: HTMLElement,
    payload: unknown,
    { clientX = 200, clientY = 200 }: { clientX?: number; clientY?: number } = {},
  ) {
    const dataTransfer = {
      getData: (type: string) =>
        type === DRAG_MIME ? JSON.stringify(payload) : "",
      types: [DRAG_MIME],
      setData: () => undefined,
      dropEffect: "",
      effectAllowed: "",
    };
    fireEvent.drop(surface, { dataTransfer, clientX, clientY });
  }

  it("renders each stored resource as a draggable thumbnail with a Remove control", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        resources: [
          resource(),
          resource({
            id: "resource-2",
            url: "https://example.com/uploads/diagram.jpg",
            mimeType: "image/jpeg",
          }),
        ],
      }),
    });
    renderEditor();

    expect(screen.getByText("photo.png")).not.toBeNull();
    expect(screen.getByText("diagram.jpg")).not.toBeNull();
    // Each row carries the resource image as its thumbnail src.
    const thumbnails = document.querySelectorAll<HTMLImageElement>(
      'aside img[src="https://example.com/uploads/photo.png"]',
    );
    expect(thumbnails).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Remove photo.png from Resources" }),
    ).not.toBeNull();
    // Resources never show a "Placed" badge — they stay reusable.
    expect(
      screen.getByText("photo.png").closest("li")?.textContent,
    ).not.toContain("Placed");
  });

  it("shows an empty state when there are no resources", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ resources: [] }),
    });
    renderEditor();

    expect(
      screen.getByText("No resources yet — paste or upload an image to add one."),
    ).not.toBeNull();
  });

  it("dragging a resource onto the canvas places an Image card referencing its resourceId", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ resources: [resource()] }),
    });
    const user = userEvent.setup();
    renderEditor();

    fireResourceDrop(screen.getByTestId("canvas-surface"), {
      type: "RESOURCE_IMAGE",
      resourceId: "resource-1",
      imageUrl: "https://example.com/uploads/photo.png",
    });

    expect(canvasCard("new-1")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Save Layout" }));
    await waitFor(() => expect(mocks.publishMutateAsync).toHaveBeenCalled());
    const published = mocks.publishMutateAsync.mock.calls[0]?.[0] as {
      elements: { type: string; imageUrl?: string; resourceId?: string }[];
    };
    expect(published.elements).toContainEqual(
      expect.objectContaining({
        type: "IMAGE",
        imageUrl: "https://example.com/uploads/photo.png",
        resourceId: "resource-1",
      }),
    );
  });

  it("tapping a resource also places an Image card (touch path)", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ resources: [resource()] }),
    });
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByText("photo.png").closest("li")!);

    expect(canvasCard("new-1")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Save Layout" }));
    await waitFor(() => expect(mocks.publishMutateAsync).toHaveBeenCalled());
    const published = mocks.publishMutateAsync.mock.calls[0]?.[0] as {
      elements: { type: string; resourceId?: string }[];
    };
    expect(published.elements).toContainEqual(
      expect.objectContaining({ type: "IMAGE", resourceId: "resource-1" }),
    );
  });

  it("placing the same resource twice creates two independent cards and never marks it used", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ resources: [resource()] }),
    });
    const user = userEvent.setup();
    renderEditor();
    const item = screen.getByText("photo.png").closest("li")!;

    await user.click(item);
    await user.click(item);

    expect(canvasCard("new-1")).not.toBeNull();
    expect(canvasCard("new-2")).not.toBeNull();
    // The resource stays in the list, still draggable and removable — never
    // marked "Placed"/exhausted the way single-placement Library items are.
    expect(item.getAttribute("draggable")).toBe("true");
    expect(
      screen.getByRole("button", { name: "Remove photo.png from Resources" }),
    ).not.toBeNull();
  });

  it("removing a resource calls the mutation and drops it from the list", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ resources: [resource()] }),
    });
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", { name: "Remove photo.png from Resources" }),
    );

    expect(mocks.setResourceRemovedMutate).toHaveBeenCalledTimes(1);
    expect(mocks.setResourceRemovedMutate).toHaveBeenCalledWith({
      id: "resource-1",
      removed: true,
    });
    // Gone from the list for new placements, without a refetch.
    expect(screen.queryByText("photo.png")).toBeNull();
    expect(
      screen.getByText("No resources yet — paste or upload an image to add one."),
    ).not.toBeNull();
  });
});

describe("cross-device Library placement", () => {
  it("tapping an unplaced Library item places it on the canvas (touch path)", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ library: [{ type: "ABOUT" }] }),
    });
    const user = userEvent.setup();
    renderEditor();

    // Native drag never fires on touch, so the unplaced item's <li> must place
    // it on click, matching the Resources tap-to-place fallback (spec 57/58).
    await user.click(screen.getByText("About").closest("li")!);

    expect(canvasCard("new-1")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Save Layout" }));
    await waitFor(() => expect(mocks.publishMutateAsync).toHaveBeenCalled());
    const published = mocks.publishMutateAsync.mock.calls[0]?.[0] as {
      elements: { type: string }[];
    };
    expect(published.elements).toContainEqual(
      expect.objectContaining({ type: "ABOUT" }),
    );
  });

  it("does not place an already-placed Library item on tap", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        elements: [placedIdentityElement("ABOUT")],
        library: [{ type: "ABOUT" }],
      }),
    });
    const user = userEvent.setup();
    renderEditor();

    // The placed item shows its "Placed" badge and stays non-interactive.
    const item = screen.getAllByText("About")[0]!.closest("li")!;
    expect(item.textContent).toContain("Placed");
    await user.click(item);

    expect(document.querySelector('[data-canvas-element-key="new-1"]')).toBeNull();
  });
});

describe("the canvas is available at every viewport", () => {
  it("never shows the old desktop-only limitation message (spec 57)", () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData(),
    });
    renderEditor();

    expect(screen.queryByText(/larger screen/i)).toBeNull();
    expect(screen.getByTestId("canvas-surface")).not.toBeNull();
  });
});

describe("theme and custom background", () => {
  function surface(): HTMLElement {
    return screen.getByTestId("canvas-surface");
  }

  async function publishSnapshot(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Save Layout" }));
    await waitFor(() => expect(mocks.publishMutateAsync).toHaveBeenCalled());
    return mocks.publishMutateAsync.mock.calls[0]?.[0] as {
      theme: string;
      backgroundColor: string | null;
      backgroundImageUrl: string | null;
      backgroundImageResourceId: string | null;
    };
  }

  it("selecting a built-in theme updates the preview class and the publish snapshot", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData(),
    });
    const user = userEvent.setup();
    renderEditor();

    // Default theme resolves to no profile-theme-* class on the preview surface.
    expect(surface().className).not.toContain("profile-theme-");

    await user.click(screen.getByRole("button", { name: "Theme Mist cool" }));

    // The preview reskins immediately, before any publish.
    expect(surface().className).toContain("profile-theme-mist");
    expect(mocks.publishMutateAsync).not.toHaveBeenCalled();

    const published = await publishSnapshot(user);
    expect(published.theme).toBe("mist");
  });

  it("clicking Custom opens the background panel without changing the theme", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData(),
    });
    const user = userEvent.setup();
    renderEditor();

    expect(screen.queryByLabelText("Background color")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Custom background" }));

    // The four controls appear; none of them selected a fabricated theme value.
    expect(screen.getByLabelText("Background color")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Remove background image" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Reset to theme default" }),
    ).not.toBeNull();

    const published = await publishSnapshot(user);
    expect(published.theme).toBe("default");
  });

  it("setting a background color updates the preview and publish snapshot", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData(),
    });
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Custom background" }));
    fireEvent.change(screen.getByLabelText("Background color"), {
      target: { value: "#123456" },
    });

    expect(surface().style.backgroundColor).not.toBe("");

    const published = await publishSnapshot(user);
    expect(published.backgroundColor).toBe("#123456");
  });

  it("uploading a background image sets the url and resourceId in the snapshot", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData(),
    });
    const fetchMock = directUploadFetchMock({
      url: "https://example.com/bg.png",
      mimeType: "image/png",
      resource: { id: "resource-bg", url: "https://example.com/bg.png" },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Custom background" }));
    const file = new File(["bg"], "bg.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Upload background image"), file);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/upload/intent");
    expect(
      JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string),
    ).toMatchObject({
      purpose: "canvas-resource",
    });
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(file);
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/upload/finalize");
    await waitFor(() =>
      expect(surface().style.backgroundImage).toContain(
        "https://example.com/bg.png",
      ),
    );

    const published = await publishSnapshot(user);
    expect(published.backgroundImageUrl).toBe("https://example.com/bg.png");
    expect(published.backgroundImageResourceId).toBe("resource-bg");
  });

  it("keeps the prior background and shows an error when the upload fails", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        snapshot: {
          ...baseData().snapshot,
          backgroundColor: "#0a0a0a",
        },
      }),
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Resources must be images." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Custom background" }));
    // A valid image type so `accept` lets it through; the server rejects it.
    const file = new File(["bad"], "bad.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Upload background image"), file);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Resources must be images.",
    );

    const published = await publishSnapshot(user);
    // Prior color is untouched; no image url/resource was recorded.
    expect(published.backgroundColor).toBe("#0a0a0a");
    expect(published.backgroundImageUrl).toBeNull();
    expect(published.backgroundImageResourceId).toBeNull();
  });

  it("Remove background image clears the image but keeps a configured color", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        snapshot: {
          ...baseData().snapshot,
          backgroundColor: "#0a0a0a",
          backgroundImageUrl: "https://example.com/old.png",
          backgroundImageResourceId: "resource-old",
        },
      }),
    });
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Custom background" }));
    await user.click(
      screen.getByRole("button", { name: "Remove background image" }),
    );

    const published = await publishSnapshot(user);
    expect(published.backgroundColor).toBe("#0a0a0a");
    expect(published.backgroundImageUrl).toBeNull();
    expect(published.backgroundImageResourceId).toBeNull();
  });

  it("Reset to theme default clears both the color and the image", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        snapshot: {
          ...baseData().snapshot,
          backgroundColor: "#0a0a0a",
          backgroundImageUrl: "https://example.com/old.png",
          backgroundImageResourceId: "resource-old",
        },
      }),
    });
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Custom background" }));
    await user.click(
      screen.getByRole("button", { name: "Reset to theme default" }),
    );

    const published = await publishSnapshot(user);
    expect(published.backgroundColor).toBeNull();
    expect(published.backgroundImageUrl).toBeNull();
    expect(published.backgroundImageResourceId).toBeNull();
  });

  it("falls back to the default theme for an invalid value without losing the color", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({
        snapshot: {
          ...baseData().snapshot,
          // A corrupted/unknown theme identifier.
          theme: "not-a-real-theme" as "default",
          backgroundColor: "#abcdef",
        },
      }),
    });
    renderEditor();

    // resolveProfileTheme drops to the default (no profile-theme-* class)...
    expect(surface().className).not.toContain("profile-theme-");
    // ...while the independent custom background color is preserved.
    expect(surface().style.backgroundColor).not.toBe("");
  });
});
