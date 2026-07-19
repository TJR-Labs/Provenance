/**
 * Tests for the profile-edit server action's redirect behavior: a successful
 * save returns the user to their public profile with a transient ?saved=1
 * flag, while a validation/save failure keeps them on the editor with the
 * inline ?error= message (no regression).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("~/server/api/caller", () => ({
  getServerCaller: async () => ({ profile: { update: mocks.update } }),
}));

// The real next/navigation redirect throws NEXT_REDIRECT for control flow;
// this mock throws a sentinel carrying the target so tests can assert it.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { updateProfileAction } from "./actions";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function validFields(overrides: Record<string, string> = {}) {
  return {
    displayName: "Ada",
    bio: "",
    school: "",
    avatarUrl: "",
    links: "",
    theme: "default",
    sections: "about,projects,links",
    customCss: "",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateProfileAction", () => {
  it("redirects to the user's public profile with ?saved=1 on success", async () => {
    mocks.update.mockResolvedValue({ username: "ada" });

    await expect(
      updateProfileAction(formData(validFields())),
    ).rejects.toThrow("NEXT_REDIRECT:/ada?saved=1");

    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("redirects back to the editor with ?error= on invalid input, without saving", async () => {
    await expect(
      updateProfileAction(formData(validFields({ theme: "not-a-theme" }))),
    ).rejects.toThrow(/^NEXT_REDIRECT:\/profile\/edit\?error=/);

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("redirects back to the editor with ?error= when the update itself fails", async () => {
    mocks.update.mockRejectedValue(new Error("Display name is required."));

    await expect(
      updateProfileAction(formData(validFields())),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/profile/edit?error=${encodeURIComponent(
        "Display name is required.",
      )}`,
    );
  });
});
