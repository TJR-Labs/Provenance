/**
 * @vitest-environment jsdom
 *
 * Component tests for the signup password field's live 8-character-minimum
 * indicator: it updates as the user types and reflects a value already present
 * on mount (browser autofill / pre-fill), not only after a keystroke.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { PasswordField } from "./password-field";

afterEach(() => {
  cleanup();
});

describe("the signup password indicator", () => {
  it("still submits under name=password with the minlength constraint", () => {
    render(<PasswordField />);
    const input = document.querySelector<HTMLInputElement>(
      'input[name="password"]',
    );
    expect(input).not.toBeNull();
    expect(input?.minLength).toBe(8);
    expect(input?.type).toBe("password");
  });

  it("shows the minimum-length hint unmet before anything is typed", () => {
    render(<PasswordField />);
    const hint = screen.getByText(/8 characters minimum/);
    expect(hint.textContent).not.toContain("✓");
    expect(hint.className).toContain("text-muted");
  });

  it("confirms the minimum once eight characters are typed", async () => {
    const user = userEvent.setup();
    render(<PasswordField />);
    const input = document.querySelector<HTMLInputElement>(
      'input[name="password"]',
    )!;

    await user.type(input, "1234567");
    expect(screen.getByText(/8 characters minimum/).textContent).not.toContain(
      "✓",
    );

    await user.type(input, "8");
    const hint = screen.getByText(/8 characters minimum/);
    expect(hint.textContent).toContain("✓");
    expect(hint.className).toContain("text-success");
  });

  it("reflects a value already present on mount (autofill/pre-fill)", () => {
    render(<PasswordField defaultValue="prefilled-password" />);
    const hint = screen.getByText(/8 characters minimum/);
    expect(hint.textContent).toContain("✓");
    expect(hint.className).toContain("text-success");
  });
});
