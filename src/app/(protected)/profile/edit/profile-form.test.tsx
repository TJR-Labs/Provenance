/**
 * @vitest-environment jsdom
 *
 * Component tests for the profile editor's content-editing surfaces: the
 * Label+URL link row form (with inline safeExternalUrl validation), the
 * collapsed-by-default Custom CSS disclosure, and the theme swatches. Runs in
 * jsdom via the docblock so the rest of the suite keeps its node environment.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileForm } from "./profile-form";

vi.mock("~/trpc/react", () => ({
  api: {
    canvas: {
      setMode: {
        useMutation: () => ({
          mutate: vi.fn(),
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

type Init = ComponentProps<typeof ProfileForm>["initial"];

function baseInitial(overrides: Partial<Init> = {}): Init {
  return {
    displayName: "Ada",
    bio: "",
    school: "",
    avatarUrl: "",
    links: [],
    theme: "default",
    sections: ["about", "projects", "links"],
    layoutMode: "GRID",
    customCss: "",
    ...overrides,
  };
}

function renderForm(overrides: Partial<Init> = {}) {
  const action = vi.fn<(formData: FormData) => void>();
  const result = render(
    <ProfileForm action={action} initial={baseInitial(overrides)} />,
  );
  return { action, ...result };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("the external links row form", () => {
  it("no longer renders a pipe-delimited links textarea", () => {
    renderForm();
    expect(document.querySelector('textarea[name="links"]')).toBeNull();
    // Links now travel to the server action via a hidden input.
    expect(document.querySelector('input[name="links"]')).not.toBeNull();
  });

  it("shows no rows with zero links, only an Add link control", () => {
    renderForm({ links: [] });
    expect(screen.queryByLabelText(/^URL/)).toBeNull();
    expect(screen.getByRole("button", { name: "Add link" })).not.toBeNull();
  });

  it("appends an editable row when Add link is clicked", async () => {
    const user = userEvent.setup();
    renderForm({ links: [] });
    await user.click(screen.getByRole("button", { name: "Add link" }));
    expect(screen.getByLabelText(/^Label/)).not.toBeNull();
    expect(screen.getByLabelText(/^URL/)).not.toBeNull();
  });

  it("rejects a row with an unsafe URL inline and blocks save", async () => {
    const user = userEvent.setup();
    const { action } = renderForm({ links: [] });
    await user.click(screen.getByRole("button", { name: "Add link" }));
    await user.type(screen.getByLabelText(/^Label/), "Bad");
    await user.type(screen.getByLabelText(/^URL/), "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(screen.getByText("Enter a valid http(s) URL.")).not.toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("rejects a row with an empty label inline and blocks save", async () => {
    const user = userEvent.setup();
    const { action } = renderForm({ links: [] });
    await user.click(screen.getByRole("button", { name: "Add link" }));
    await user.type(screen.getByLabelText(/^URL/), "https://example.com");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(screen.getByText("Add a label for the link.")).not.toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("serializes valid rows into the hidden links input on the server format", () => {
    renderForm({ links: [{ label: "Portfolio", url: "https://example.com" }] });
    const hidden = document.querySelector<HTMLInputElement>(
      'input[name="links"]',
    );
    expect(hidden?.value).toBe("Portfolio | https://example.com");
  });

  it("removes a row via its Remove button", async () => {
    const user = userEvent.setup();
    renderForm({ links: [{ label: "Portfolio", url: "https://example.com" }] });
    expect(screen.getByLabelText(/^URL/)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByLabelText(/^URL/)).toBeNull();
  });
});

describe("the Custom CSS disclosure", () => {
  it("is collapsed by default when there is no saved CSS", () => {
    renderForm({ customCss: "" });
    const details = screen
      .getByText("Advanced: custom CSS")
      .closest("details");
    expect(details?.open).toBe(false);
  });

  it("is expanded by default when the user already has saved CSS", () => {
    renderForm({ customCss: ".profile-muted { color: teal; }" });
    const details = screen
      .getByText("Advanced: custom CSS")
      .closest("details");
    expect(details?.open).toBe(true);
  });

  it("includes a worked example in its helper text", () => {
    const { container } = renderForm();
    expect(container.textContent).toContain(".profile-muted { color: #666; }");
  });

  it("keeps the customCss textarea for editing", () => {
    renderForm();
    expect(document.querySelector('textarea[name="customCss"]')).not.toBeNull();
  });
});

describe("the theme swatches", () => {
  it("renders a labeled swatch control for each built-in theme", () => {
    renderForm();
    for (const label of [
      /Default dark/,
      /Paper light/,
      /Indigo studio/,
      /Ember warm/,
      /Rose blush/,
      /Mist cool/,
      /Terminal mono/,
    ]) {
      expect(screen.getByRole("button", { name: label })).not.toBeNull();
    }
  });

  it("marks the saved theme's swatch as pressed and updates the select on click", async () => {
    const user = userEvent.setup();
    renderForm({ theme: "default" });
    const paper = screen.getByRole("button", { name: /Paper light/ });
    expect(paper.getAttribute("aria-pressed")).toBe("false");

    await user.click(paper);

    expect(paper.getAttribute("aria-pressed")).toBe("true");
    const select = document.querySelector<HTMLSelectElement>(
      'select[name="theme"]',
    );
    expect(select?.value).toBe("paper");
  });
});
