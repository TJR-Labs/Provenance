/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CanvasEditorPage from "./page";

const mocks = vi.hoisted(() => ({
  getEditorState: vi.fn(),
}));

vi.mock("~/server/api/caller", () => ({
  getServerCaller: async () => ({
    site: { getEditorState: mocks.getEditorState },
  }),
}));

vi.mock("./site-editor", () => ({
  SiteEditor: ({ initialState }: { initialState: { username: string } }) => (
    <div data-testid="site-editor">{initialState.username}</div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEditorState.mockResolvedValue({ username: "owner" });
});

afterEach(() => {
  cleanup();
});

describe("CanvasEditorPage", () => {
  it("loads the unified site editor state and renders one editor", async () => {
    render(await CanvasEditorPage());

    expect(mocks.getEditorState).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("site-editor").textContent).toBe("owner");
  });
});
