/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import Link from "next/link";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useUnsavedNavigationWarning } from "./use-unsaved-navigation-warning";

function Harness({ dirty }: { dirty: boolean }) {
  useUnsavedNavigationWarning(dirty);
  return (
    <div>
      <Link href="/account">Account</Link>
      <a href="https://elsewhere.example/path">External</a>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useUnsavedNavigationWarning", () => {
  it("prevents beforeunload only while dirty", () => {
    const view = render(<Harness dirty />);
    const dirtyEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);

    view.rerender(<Harness dirty={false} />);
    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
  });

  it("warns for same-origin anchor navigation and cancels when declined", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { getByRole } = render(<Harness dirty />);
    const accepted = fireEvent.click(getByRole("link", { name: "Account" }));

    expect(confirm).toHaveBeenCalledWith(
      "You have unsaved changes. Leave this page?",
    );
    expect(accepted).toBe(false);
  });

  it("does not intercept external links or modified same-origin clicks", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { getByRole } = render(<Harness dirty />);
    const external = getByRole("link", { name: "External" });
    external.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(external);
    const account = getByRole("link", { name: "Account" });
    account.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(account, { ctrlKey: true });

    expect(confirm).not.toHaveBeenCalled();
  });

  it("allows same-origin navigation when the user confirms", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { getByRole } = render(<Harness dirty />);
    const account = getByRole("link", { name: "Account" });
    account.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(account);

    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
