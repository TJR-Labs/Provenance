/**
 * @vitest-environment jsdom
 *
 * Component tests for the canvas editor's discoverability features: the "⋯"
 * menu button (a second entry point to the right-click Edit/Delete menu), the
 * first-run hint strip, and the Add Component flow that must work at every
 * viewport width. These run in jsdom via the docblock above so the rest of
 * the suite keeps its node environment.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasEditor } from "./canvas-editor";

type ServerElement = {
  id: string;
  type: "ABOUT" | "LINKS" | "PROJECT" | "TEXT" | "IMAGE" | "LINK";
  projectId: string | null;
  textContent: string | null;
  imageUrl: string | null;
  imageCaption: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

type EditorStateData = {
  mode: "CANVAS" | "GRID";
  shouldShowHint: boolean;
  bounds: {
    width: number;
    maxHeight: number;
    minWidth: number;
    minHeight: number;
  };
  elements: ServerElement[];
  library: ({ type: "ABOUT" } | { type: "LINKS" })[];
};

type EditorStateResult = {
  isPending: boolean;
  data: EditorStateData | undefined;
};

const mocks = vi.hoisted(() => ({
  editorState: vi.fn<() => EditorStateResult>(),
  saveDraftMutateAsync: vi.fn<(payload: unknown) => Promise<unknown[]>>(),
  publishMutateAsync: vi.fn<(payload: unknown) => Promise<unknown[]>>(),
  dismissHintMutate: vi.fn<() => void>(),
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
      dismissHint: {
        useMutation: () => ({
          mutate: mocks.dismissHintMutate,
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
    bounds: { width: 1080, maxHeight: 2400, minWidth: 120, minHeight: 80 },
    elements: [],
    library: [{ type: "ABOUT" }, { type: "LINKS" }],
    ...overrides,
  };
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
    x: 24,
    y: 24,
    width: 320,
    height: 160,
    zIndex: 1,
  };
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
  mocks.saveDraftMutateAsync.mockResolvedValue([]);
  mocks.publishMutateAsync.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe("the ⋯ menu button", () => {
  it("opens the same Edit/Delete menu right-click opens, without right-clicking", async () => {
    mocks.editorState.mockReturnValue({
      isPending: false,
      data: baseData({ elements: [placedTextElement()] }),
    });
    const user = userEvent.setup();
    renderEditor();

    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open menu for Text" }));

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
    await user.click(screen.getByRole("button", { name: "Open menu for Text" }));
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    // Text is a styleable element, so its menu offers Edit, Style, and Delete.
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
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
