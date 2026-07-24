import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";
import { signIn } from "~/server/auth";
import { OAuthButtons } from "../oauth-buttons";
import { PasswordField } from "./password-field";

type SignupPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const error = (await searchParams).error;

  async function signup(formData: FormData) {
    "use server";

    const value = (name: string) => {
      const item = formData.get(name);
      return typeof item === "string" ? item : "";
    };
    const password = value("password");
    let username: string;
    let emailSent = true;
    try {
      const user = await (
        await getServerCaller()
      ).users.signup({
        username: value("username"),
        displayName: value("displayName"),
        email: value("email"),
        password,
      });
      username = user.username;
      emailSent = user.emailSent !== false;
    } catch (caught) {
      const message =
        caught instanceof Error && caught.message.includes("already in use")
          ? "That username is already in use."
          : caught instanceof Error
            ? caught.message
            : "Unable to create your account.";
      redirect(`/signup?error=${encodeURIComponent(message)}`);
    }

    if (!emailSent) {
      redirect("/login?created=1&emailFailed=1&ph_event=signup_completed");
    }

    let signInFailed = false;
    try {
      await signIn("credentials", {
        username,
        password,
        redirectTo: `/${username}?ph_event=signup_completed`,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        signInFailed = true;
      } else {
        throw error;
      }
    }

    if (signInFailed) {
      redirect("/login?created=1&ph_event=signup_completed");
    }
  }

  return (
    <section className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="border-line bg-surface w-full max-w-md rounded-lg border p-8 shadow-sm">
        <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
          Create an account
        </h1>
        <p className="text-muted mt-2 text-sm">
          Choose your public username and start building your portfolio.
        </p>
        {error ? (
          <p
            role="alert"
            className="border-danger-line bg-danger-surface text-danger mt-6 rounded-md border px-4 py-3 text-sm break-words"
          >
            {error}
          </p>
        ) : null}
        <form action={signup} className="mt-6 space-y-5">
          <label className="text-ink block text-sm font-medium">
            Username
            <input
              name="username"
              required
              minLength={3}
              maxLength={30}
              autoComplete="username"
              className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
            />
          </label>
          <label className="text-ink block text-sm font-medium">
            Display name
            <input
              name="displayName"
              required
              maxLength={80}
              autoComplete="name"
              className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
            />
          </label>
          <label className="text-ink block text-sm font-medium">
            Email
            <input
              name="email"
              type="email"
              required
              maxLength={320}
              autoComplete="email"
              className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
            />
            <span className="text-muted mt-1 block text-xs">
              We’ll send a verification link for password recovery.
            </span>
          </label>
          <PasswordField />
          <button className="bg-accent text-on-accent hover:bg-accent-strong w-full rounded-md px-4 py-2 font-semibold transition-colors">
            Sign up
          </button>
        </form>
        <OAuthButtons />
      </div>
    </section>
  );
}
