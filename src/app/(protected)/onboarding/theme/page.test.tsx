/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OnboardingThemePage from "./page";

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  setThemeMutate: vi.fn(),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    site: {
      setStylePreset: {
        useMutation: () => ({
          mutate: mocks.setThemeMutate,
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
  useSearchParams: () => new URLSearchParams("mediums=Software"),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("OnboardingThemePage", () => {
  it("renders five themes with Editorial cream selected by default", () => {
    render(<OnboardingThemePage />);

    for (const label of [
      "Editorial cream",
      "Warm black",
      "Contact sheet",
      "Broadsheet",
      "Workbench",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }

    const creamCard = screen.getByRole("button", {
      name: /Editorial cream/,
    });
    expect(within(creamCard).getByText("SELECTED")).toBeTruthy();
  });

  it("moves the selected label when a different theme is chosen", async () => {
    const user = userEvent.setup();
    render(<OnboardingThemePage />);

    const workbenchCard = screen.getByRole("button", { name: /Workbench/ });
    await user.click(workbenchCard);

    expect(within(workbenchCard).getByText("SELECTED")).toBeTruthy();
    expect(
      within(
        screen.getByRole("button", { name: /Editorial cream/ }),
      ).queryByText("SELECTED"),
    ).toBeNull();
  });

  it("saves the selected theme and navigates on success", async () => {
    const user = userEvent.setup();
    render(<OnboardingThemePage />);

    await user.click(screen.getByRole("button", { name: /Workbench/ }));
    await user.click(screen.getByRole("button", { name: "Use this theme" }));

    expect(mocks.setThemeMutate).toHaveBeenCalledTimes(1);
    const [input, options] = mocks.setThemeMutate.mock.calls[0] as [
      { preset: string },
      { onSuccess: () => void },
    ];
    expect(input).toEqual({ preset: "workbench" });

    options.onSuccess();
    expect(mocks.routerPush).toHaveBeenCalledWith("/onboarding/import");
  });

  it("navigates back to the mediums step", async () => {
    const user = userEvent.setup();
    render(<OnboardingThemePage />);

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(mocks.routerPush).toHaveBeenCalledWith(
      "/onboarding/mediums?mediums=Software",
    );
  });
});
