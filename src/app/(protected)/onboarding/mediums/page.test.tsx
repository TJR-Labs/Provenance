/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OnboardingMediumsPage from "./page";

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("OnboardingMediumsPage", () => {
  const mediums = [
    "Software",
    "Graphic design",
    "Mech design",
    "Music",
    "Video",
    "Physical",
    "Writing",
    "Photography",
  ];

  it("renders all medium chips unselected", () => {
    render(<OnboardingMediumsPage />);

    for (const medium of mediums) {
      expect(
        screen
          .getByRole("button", { name: medium })
          .getAttribute("aria-pressed"),
      ).toBe("false");
    }
  });

  it("toggles a medium and forwards it to the theme step", async () => {
    const user = userEvent.setup();
    render(<OnboardingMediumsPage />);

    const graphicDesign = screen.getByRole("button", {
      name: "Graphic design",
    });
    await user.click(graphicDesign);
    expect(graphicDesign.getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(mocks.routerPush).toHaveBeenCalledWith(
      "/onboarding/theme?mediums=Graphic%20design",
    );
  });
});
