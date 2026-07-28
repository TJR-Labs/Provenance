/**
 * @vitest-environment node
 *
 * Exercises the real signup server action closure from page.tsx end-to-end
 * across its four control-flow branches: successful signup establishes a
 * NextAuth credentials session and redirects to the onboarding wizard;
 * validation failures redirect to /signup?error with no sign-in; a real
 * AuthError from signIn falls back to /login?created=1; and the NEXT_REDIRECT
 * that a successful signIn throws propagates instead of being swallowed.
 */
import { type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock next-auth so the test never loads the full auth stack (its root export
// pulls next/server, which is unavailable in the node test env). page.tsx
// imports AuthError from this same specifier, so `instanceof AuthError` in the
// action resolves against this exact class.
vi.mock("next-auth", () => {
  class AuthError extends Error {}
  return { AuthError };
});

import { AuthError } from "next-auth";

const mocks = vi.hoisted(() => ({
  signup: vi.fn(),
  signIn: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("~/server/api/caller", () => ({
  getServerCaller: async () => ({ users: { signup: mocks.signup } }),
}));
vi.mock("~/server/auth", () => ({ signIn: mocks.signIn }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../oauth-buttons", () => ({ OAuthButtons: () => null }));

import SignupPage from "./page";

type AnyNode = ReactElement | { props?: Record<string, unknown> } | null;

function findFormAction(
  node: unknown,
): ((formData: FormData) => Promise<void>) | null {
  if (!node || typeof node !== "object") return null;
  const element = node as {
    type?: unknown;
    props?: Record<string, unknown>;
  };
  if (element.type === "form" && typeof element.props?.action === "function") {
    return element.props.action as (formData: FormData) => Promise<void>;
  }
  const children = element.props?.children;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    const found = findFormAction(child);
    if (found) return found;
  }
  return null;
}

async function getSignupAction() {
  const element = (await SignupPage({
    searchParams: Promise.resolve({}),
  })) as AnyNode;
  const action = findFormAction(element);
  if (!action) throw new Error("signup form action not found");
  return action;
}

function formOf(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

const validFields = {
  username: "Alice",
  displayName: "Alice",
  email: "alice@example.test",
  password: "supersecret",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signup server action", () => {
  it("signs the new user in and redirects to onboarding on success", async () => {
    mocks.signup.mockResolvedValue({
      id: "user-1",
      username: "alice",
      displayName: "Alice",
    });
    // A successful credentials sign-in throws a NEXT_REDIRECT control-flow
    // error; the action must let it propagate rather than swallow it.
    const nextRedirect = new Error("NEXT_REDIRECT");
    mocks.signIn.mockRejectedValue(nextRedirect);

    const action = await getSignupAction();
    await expect(action(formOf(validFields))).rejects.toBe(nextRedirect);

    expect(mocks.signup).toHaveBeenCalledWith({
      username: "Alice",
      displayName: "Alice",
      email: "alice@example.test",
      password: "supersecret",
    });
    // Reuses the credentials path with the returned (lowercased) username and
    // redirects to onboarding, not Discover or /login.
    expect(mocks.signIn).toHaveBeenCalledWith("credentials", {
      username: "alice",
      password: "supersecret",
      redirectTo: "/onboarding/mediums?ph_event=signup_completed",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects to /signup?error and never signs in when signup fails validation", async () => {
    mocks.signup.mockRejectedValue(
      new Error("That username is already in use."),
    );

    const action = await getSignupAction();
    await expect(action(formOf(validFields))).rejects.toThrow(/^REDIRECT:/);

    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect.mock.calls[0]?.[0]).toBe(
      "/signup?error=That%20username%20is%20already%20in%20use.",
    );
  });

  it("redirects to /login with emailFailed when the account is created but the verification email fails", async () => {
    mocks.signup.mockResolvedValue({
      id: "user-1",
      username: "alice",
      displayName: "Alice",
      emailSent: false,
    });

    const action = await getSignupAction();
    await expect(action(formOf(validFields))).rejects.toThrow(
      "REDIRECT:/login?created=1&emailFailed=1&ph_event=signup_completed",
    );

    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("falls back to /login?created=1 when the post-signup sign-in throws AuthError", async () => {
    mocks.signup.mockResolvedValue({
      id: "user-1",
      username: "alice",
      displayName: "Alice",
    });
    mocks.signIn.mockRejectedValue(new AuthError("credentials"));

    const action = await getSignupAction();
    await expect(action(formOf(validFields))).rejects.toThrow(
      "REDIRECT:/login?created=1&ph_event=signup_completed",
    );

    expect(mocks.signIn).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/login?created=1&ph_event=signup_completed",
    );
  });
});
