import { AuthError } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signIn } from "~/server/auth";
import { OAuthButtons } from "../oauth-buttons";
import { safeReturnTo } from "../safe-return-to";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    created?: string;
    emailFailed?: string;
    reset?: string;
    returnTo?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const showError = Boolean(params.error);
  const returnTo = safeReturnTo(params.returnTo);

  async function login(formData: FormData) {
    "use server";

    let invalidCredentials = false;
    try {
      await signIn("credentials", {
        username: formData.get("username"),
        password: formData.get("password"),
        redirectTo: returnTo,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        invalidCredentials = true;
      } else {
        throw error;
      }
    }

    if (invalidCredentials) {
      redirect(
        `/login?error=invalid-credentials&returnTo=${encodeURIComponent(returnTo)}`,
      );
    }
  }

  return (
    <section className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="border-line bg-surface w-full max-w-md rounded-lg border p-8 shadow-sm">
        <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
          Log in
        </h1>
        <p className="text-muted mt-2 text-sm">
          Use your Provenance username and password.
        </p>

        {params.created ? (
          <p className="border-success-line bg-success-surface text-success mt-6 rounded-md border px-4 py-3 text-sm">
            Account created. You can log in now.
          </p>
        ) : null}
        {params.emailFailed ? (
          <p
            role="alert"
            className="border-danger-line bg-danger-surface text-danger mt-6 rounded-md border px-4 py-3 text-sm"
          >
            Your account was created, but we couldn&apos;t send a
            verification email.
          </p>
        ) : null}
        {params.reset ? (
          <p className="border-success-line bg-success-surface text-success mt-6 rounded-md border px-4 py-3 text-sm">
            Password reset. Log in with your new password.
          </p>
        ) : null}

        {showError ? (
          <p
            role="alert"
            className="border-danger-line bg-danger-surface text-danger mt-6 rounded-md border px-4 py-3 text-sm"
          >
            Invalid username or password.
          </p>
        ) : null}

        <form action={login} className="mt-6 space-y-5">
          <label className="text-ink block text-sm font-medium">
            Username
            <input
              name="username"
              type="text"
              required
              autoComplete="username"
              autoFocus
              className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
            />
          </label>
          <label className="text-ink block text-sm font-medium">
            <span className="flex items-center justify-between gap-4">
              <span>Password</span>
              <Link
                href="/forgot-password"
                className="text-accent hover:text-accent-strong text-xs font-semibold"
              >
                Forgot password?
              </Link>
            </span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="bg-accent text-on-accent hover:bg-accent-strong w-full rounded-md px-4 py-2 font-semibold transition-colors"
          >
            Log in
          </button>
        </form>
        <OAuthButtons redirectTo={returnTo} />
      </div>
    </section>
  );
}
