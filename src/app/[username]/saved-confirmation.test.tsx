/**
 * @vitest-environment jsdom
 *
 * Tests the post-save confirmation shown on the owner's profile after a
 * successful edit: it is visible and dismissable, and dismissing removes it.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { SavedConfirmation } from "./saved-confirmation";

afterEach(() => {
  cleanup();
});

describe("SavedConfirmation", () => {
  it("shows a visible save confirmation", () => {
    render(<SavedConfirmation />);
    expect(screen.getByRole("status")).not.toBeNull();
    expect(screen.getByText("Profile saved.")).not.toBeNull();
  });

  it("is dismissable", async () => {
    const user = userEvent.setup();
    render(<SavedConfirmation />);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText("Profile saved.")).toBeNull();
  });
});
