import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn } from "~/server/auth";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const showError = Boolean((await searchParams).error);

  async function login(formData: FormData) {
    "use server";

    let invalidCredentials = false;
    try {
      await signIn("credentials", {
        username: formData.get("username"),
        password: formData.get("password"),
        redirectTo: "/",
      });
    } catch (error) {
      if (error instanceof AuthError) {
        invalidCredentials = true;
      } else {
        throw error;
      }
    }

    if (invalidCredentials) {
      redirect("/login?error=invalid-credentials");
    }
  }

  return (
    <section className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="text-3xl font-bold tracking-tight text-white">Log in</h1>
        <p className="mt-2 text-sm text-slate-400">
          Use the credentials provided by a Provenance administrator.
        </p>

        {showError ? (
          <p
            role="alert"
            className="mt-6 rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200"
          >
            Invalid username or password.
          </p>
        ) : null}

        <form action={login} className="mt-6 space-y-5">
          <label className="block text-sm font-medium text-slate-200">
            Username
            <input
              name="username"
              type="text"
              required
              autoComplete="username"
              autoFocus
              className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-300"
          >
            Log in
          </button>
        </form>
      </div>
    </section>
  );
}
