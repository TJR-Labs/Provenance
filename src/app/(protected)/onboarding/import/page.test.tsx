/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OnboardingImportPage from "./page";

type MutationOptions = { onSuccess?: () => void };

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  dismissOnboardingMutate: vi.fn(),
  dismissOnboardingOptions: undefined as MutationOptions | undefined,
}));

vi.mock("~/trpc/react", () => ({
  api: {
    profile: {
      me: {
        useQuery: () => ({ data: { username: "alice" } }),
      },
      dismissOnboarding: {
        useMutation: (options?: MutationOptions) => {
          mocks.dismissOnboardingOptions = options;
          return {
            mutate: mocks.dismissOnboardingMutate,
            isPending: false,
          };
        },
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dismissOnboardingOptions = undefined;
});

afterEach(() => {
  cleanup();
});

describe("OnboardingImportPage", () => {
  it("renders all connectors and shows the coming-soon note", async () => {
    const user = userEvent.setup();
    render(<OnboardingImportPage />);

    for (const connector of [
      "GitHub",
      "Behance",
      "YouTube",
      "Vimeo",
      "App Store",
      "Paste URL",
    ]) {
      expect(screen.getByRole("button", { name: connector })).toBeTruthy();
    }

    await user.click(screen.getByRole("button", { name: "Behance" }));
    expect(screen.getByText(/Coming soon/)).toBeTruthy();
  });

  it("dismisses onboarding and opens the profile when skipped", async () => {
    const user = userEvent.setup();
    render(<OnboardingImportPage />);

    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(mocks.dismissOnboardingMutate).toHaveBeenCalledWith();

    mocks.dismissOnboardingOptions?.onSuccess?.();
    expect(mocks.routerPush).toHaveBeenCalledWith("/alice");
  });

  it("dismisses onboarding and opens the profile when generated", async () => {
    const user = userEvent.setup();
    render(<OnboardingImportPage />);

    await user.click(screen.getByRole("button", { name: "Generate my site" }));
    expect(mocks.dismissOnboardingMutate).toHaveBeenCalledWith();

    mocks.dismissOnboardingOptions?.onSuccess?.();
    expect(mocks.routerPush).toHaveBeenCalledWith("/alice");
  });
});
