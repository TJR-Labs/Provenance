import { TRPCError } from "@trpc/server";
import { redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";
import { signIn } from "~/server/auth";

type UsernamePageProps = {
  searchParams: Promise<{ token?: string; error?: string }>;
};

export default async function UsernamePage({
  searchParams,
}: UsernamePageProps) {
  const params = await searchParams;
  const token = params.token ?? "";
  const caller = await getServerCaller();
  const pending = token
    ? await caller.users.pendingOAuthSignup({ token })
    : null;

  if (!pending) {
    redirect(
      `/signup?error=${encodeURIComponent("Your OAuth signup has expired. Please try again.")}`,
    );
  }

  async function chooseUsername(formData: FormData) {
    "use server";

    const value = formData.get("username");
    const username = typeof value === "string" ? value : "";
    let errorMessage: string | null = null;
    try {
      await (
        await getServerCaller()
      ).users.completeOAuthSignup({ token, username });
    } catch (error) {
      errorMessage =
        error instanceof TRPCError
          ? error.message
          : "Unable to complete your account.";
    }

    if (errorMessage) {
      redirect(
        `/signup/username?token=${encodeURIComponent(token)}&error=${encodeURIComponent(errorMessage)}`,
      );
    }

    await signIn("credentials", {
      oauthSignupToken: token,
      redirectTo: "/onboarding/mediums",
    });
  }

  return (
    <section className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="border-line bg-surface w-full max-w-md rounded-lg border p-8 shadow-sm">
        <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
          Choose your username
        </h1>
        <p className="text-muted mt-2 text-sm">
          Finish signing up with{" "}
          {pending.provider === "google" ? "Google" : "GitHub"}
          {pending.name ? ` as ${pending.name}` : ""}.
        </p>
        {params.error ? (
          <p
            role="alert"
            className="border-danger-line bg-danger-surface text-danger mt-6 rounded-md border px-4 py-3 text-sm break-words"
          >
            {params.error}
          </p>
        ) : null}
        <form action={chooseUsername} className="mt-6 space-y-5">
          <label className="text-ink block text-sm font-medium">
            Username
            <input
              name="username"
              required
              minLength={3}
              maxLength={30}
              autoComplete="username"
              autoFocus
              className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
            />
          </label>
          <button className="bg-accent text-on-accent hover:bg-accent-strong w-full rounded-md px-4 py-2 font-semibold transition-colors">
            Create account
          </button>
        </form>
      </div>
    </section>
  );
}
