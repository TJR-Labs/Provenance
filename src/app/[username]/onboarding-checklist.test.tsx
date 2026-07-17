/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingChecklist } from "./onboarding-checklist";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("~/trpc/react", () => ({
  api: {
    profile: {
      dismissOnboarding: {
        useMutation: () => ({
          mutate: mocks.mutate,
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("OnboardingChecklist", () => {
  it("links each setup item to its destination", () => {
    render(
      <OnboardingChecklist
        items={{ bio: false, project: false, layout: false }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Add a bio" }).getAttribute("href"),
    ).toBe("/profile/edit");
    expect(
      screen
        .getByRole("link", { name: "Add your first project" })
        .getAttribute("href"),
    ).toBe("/projects/new");
    expect(
      screen
        .getByRole("link", { name: "Choose a layout" })
        .getAttribute("href"),
    ).toBe("/profile/edit#layout-mode");
  });

  it("dismisses through the mutation and hides immediately", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingChecklist
        items={{ bio: false, project: false, layout: false }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(screen.queryByText("Finish setting up your profile")).toBeNull();
  });
});
