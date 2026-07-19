/**
 * @vitest-environment jsdom
 *
 * Tests for the grid/canvas mode toggle now living on /profile/canvas. It must
 * switch modes through the same api.canvas.setMode mutation the old profile-edit
 * toggle used, and refresh the page on success so the editor/grid state swaps
 * without a further navigation.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LayoutModeToggle } from "./layout-mode-toggle";

const mocks = vi.hoisted(() => ({
  setModeMutate: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    canvas: {
      setMode: {
        useMutation: () => ({
          mutate: mocks.setModeMutate,
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.routerRefresh }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("LayoutModeToggle", () => {
  it("marks the current mode as pressed", () => {
    render(<LayoutModeToggle mode="GRID" />);
    expect(
      screen.getByRole("button", { name: "Grid" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Canvas" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("calls canvas.setMode with the chosen mode and refreshes on success", async () => {
    const user = userEvent.setup();
    render(<LayoutModeToggle mode="GRID" />);

    await user.click(screen.getByRole("button", { name: "Canvas" }));

    expect(mocks.setModeMutate).toHaveBeenCalledTimes(1);
    const [input, options] = mocks.setModeMutate.mock.calls[0] as [
      { mode: string },
      { onSuccess: () => void },
    ];
    expect(input).toEqual({ mode: "CANVAS" });

    // The success handler drives the page refresh that reveals the editor.
    options.onSuccess();
    expect(mocks.routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not fire the mutation when clicking the already-active mode", async () => {
    const user = userEvent.setup();
    render(<LayoutModeToggle mode="CANVAS" />);

    await user.click(screen.getByRole("button", { name: "Canvas" }));

    expect(mocks.setModeMutate).not.toHaveBeenCalled();
  });
});
