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
      redirectTo: "/",
    });
  }

  return (
    <section className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Choose your username
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Finish signing up with{" "}
          {pending.provider === "google" ? "Google" : "GitHub"}
          {pending.name ? ` as ${pending.name}` : ""}.
        </p>
        {params.error ? (
          <p
            role="alert"
            className="mt-6 rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200"
          >
            {params.error}
          </p>
        ) : null}
        <form action={chooseUsername} className="mt-6 space-y-5">
          <label className="block text-sm font-medium text-slate-200">
            Username
            <input
              name="username"
              required
              minLength={3}
              maxLength={30}
              autoComplete="username"
              autoFocus
              className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            />
          </label>
          <button className="w-full rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-300">
            Create account
          </button>
        </form>
      </div>
    </section>
  );
}
