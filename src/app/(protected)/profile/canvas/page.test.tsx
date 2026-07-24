/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CanvasEditorPage from "./page";

const mocks = vi.hoisted(() => ({
  profileMe: vi.fn(),
  profileEditorState: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("~/server/api/caller", () => ({
  getServerCaller: async () => ({
    profile: { me: mocks.profileMe },
    project: { listByUsername: vi.fn() },
    grid: { profileEditorState: mocks.profileEditorState },
  }),
}));

vi.mock("~/app/grid-layout-editor", () => ({
  GridLayoutEditor: () => <div data-testid="grid-layout-editor" />,
}));

vi.mock("./canvas-editor", () => ({
  CanvasEditor: () => <div data-testid="canvas-editor" />,
}));

vi.mock("./layout-mode-toggle", () => ({
  LayoutModeToggle: () => <div data-testid="layout-mode-toggle" />,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profileMe.mockResolvedValue({
    username: "legacy-owner",
    layoutMode: "GRID",
  });
  mocks.profileEditorState.mockRejectedValue(
    new TRPCError({ code: "NOT_FOUND" }),
  );
});

afterEach(() => {
  cleanup();
});

describe("CanvasEditorPage legacy Grid fallback", () => {
  it("keeps an oversized published profile out of the Grid editor", async () => {
    render(await CanvasEditorPage());

    expect(screen.queryByTestId("grid-layout-editor")).toBeNull();
    expect(
      screen.getByText(
        /existing layout remains published.*exceeds the 50-block editor limit/i,
      ),
    ).not.toBeNull();
  });
});
