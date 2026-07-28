/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Category, ProjectStatus } from "../../../../generated/prisma";
import { DevlogQuickAdd, ProjectsFlyoutTrigger } from "./site-interactive";

const mocks = vi.hoisted(() => ({
  createMutate: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.routerRefresh }),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    devlog: {
      create: {
        useMutation: () => ({
          mutate: mocks.createMutate,
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

const projects = [
  {
    id: "project-1",
    title: "Project idea",
    status: ProjectStatus.IDEA,
    category: Category.DESIGNER,
  },
  {
    id: "project-2",
    title: "Project building",
    status: ProjectStatus.BUILDING,
    category: Category.SOFTWARE_ENGINEER,
  },
  {
    id: "project-3",
    title: "Project shipped",
    status: ProjectStatus.SHIPPED,
    category: Category.ROBOTICS_ENGINEER,
  },
  {
    id: "project-4",
    title: "Project archived",
    status: ProjectStatus.ARCHIVED,
    category: Category.WRITER,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("ProjectsFlyoutTrigger", () => {
  it("opens and closes the flyout with every project status badge", async () => {
    const user = userEvent.setup();
    render(<ProjectsFlyoutTrigger projects={projects} />);

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Manage projects" }));

    const dialog = screen.getByRole("dialog", { name: "Projects" });
    for (const { title, statusLabel } of [
      { title: "Project idea", statusLabel: "IDEA" },
      { title: "Project building", statusLabel: "BUILDING" },
      { title: "Project shipped", statusLabel: "SHIPPED" },
      { title: "Project archived", statusLabel: "ARCHIVED" },
    ]) {
      const row = within(dialog).getByText(title).closest("li");
      expect(row).not.toBeNull();
      expect(within(row!).getByText(statusLabel)).toBeTruthy();
    }

    await user.click(
      screen.getAllByRole("button", {
        name: "Close projects panel",
      })[0]!,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reveals the import coming-soon note", async () => {
    const user = userEvent.setup();
    render(<ProjectsFlyoutTrigger projects={projects} />);

    await user.click(screen.getByRole("button", { name: "Manage projects" }));
    await user.click(
      screen.getByRole("button", { name: "Import from GitHub or URL" }),
    );

    expect(
      screen.getByText("Coming soon — imports aren't wired up yet."),
    ).toBeTruthy();
  });
});

describe("DevlogQuickAdd", () => {
  it("creates an entry and refreshes the server-rendered page on success", async () => {
    const user = userEvent.setup();
    render(<DevlogQuickAdd />);

    await user.click(screen.getByRole("button", { name: "+ Add entry" }));
    await user.type(screen.getByLabelText("Entry label"), "V0.4");
    await user.type(
      screen.getByLabelText("Entry body"),
      "Added the new site dashboard.",
    );
    await user.click(screen.getByRole("button", { name: "Add entry" }));

    expect(mocks.createMutate).toHaveBeenCalledTimes(1);
    const [input, options] = mocks.createMutate.mock.calls[0] as [
      { label: string; body: string },
      { onSuccess: () => void },
    ];
    expect(input).toEqual({
      label: "V0.4",
      body: "Added the new site dashboard.",
    });

    act(() => options.onSuccess());

    expect(mocks.routerRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "+ Add entry" })).toBeTruthy();
    expect(screen.queryByLabelText("Entry label")).toBeNull();
  });
});
