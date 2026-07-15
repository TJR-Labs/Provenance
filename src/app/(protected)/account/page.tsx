import { changePasswordAction } from "./actions";

type AccountPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;

  return (
    <section className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-white">Account</h1>
      <p className="mt-2 text-slate-400">Change your account password.</p>

      {params.error ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200"
        >
          {params.error}
        </p>
      ) : null}
      {params.success ? (
        <p className="mt-6 rounded-md border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-200">
          Password changed successfully.
        </p>
      ) : null}

      <form
        action={changePasswordAction}
        className="mt-8 space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-8"
      >
        <label className="block text-sm font-medium text-slate-200">
          Current password
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
          />
        </label>
        <label className="block text-sm font-medium text-slate-200">
          New password
          <input
            name="newPassword"
            type="password"
            required
            autoComplete="new-password"
            className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-300"
        >
          Change password
        </button>
      </form>
    </section>
  );
}
