import { redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";

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
    let destination = "/login?created=1";
    try {
      await (
        await getServerCaller()
      ).users.signup({
        username: value("username"),
        displayName: value("displayName"),
        password: value("password"),
      });
    } catch (caught) {
      const message =
        caught instanceof Error && caught.message.includes("already in use")
          ? "That username is already in use."
          : caught instanceof Error
            ? caught.message
            : "Unable to create your account.";
      destination = `/signup?error=${encodeURIComponent(message)}`;
    }
    redirect(destination);
  }

  return (
    <section className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Create an account
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Choose your public username and start building your portfolio.
        </p>
        {error ? (
          <p
            role="alert"
            className="mt-6 rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </p>
        ) : null}
        <form action={signup} className="mt-6 space-y-5">
          <label className="block text-sm font-medium text-slate-200">
            Username
            <input
              name="username"
              required
              minLength={3}
              maxLength={30}
              autoComplete="username"
              className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Display name
            <input
              name="displayName"
              required
              maxLength={80}
              autoComplete="name"
              className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
          <button className="w-full rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-300">
            Sign up
          </button>
        </form>
      </div>
    </section>
  );
}
