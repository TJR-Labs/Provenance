import { getServerCaller } from "~/server/api/caller";
import {
  changePasswordAction,
  linkOAuthAccountAction,
  setPasswordAction,
  unlinkOAuthAccountAction,
} from "./actions";

type AccountPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;
  const security = await (await getServerCaller()).users.accountSecurity();
  const successMessages: Record<string, string> = {
    "password-changed": "Password changed successfully.",
    "password-set": "Password set successfully.",
    "google-linked": "Google connected successfully.",
    "github-linked": "GitHub connected successfully.",
    "google-unlinked": "Google disconnected successfully.",
    "github-unlinked": "GitHub disconnected successfully.",
  };
  const successMessage = params.success
    ? successMessages[params.success]
    : undefined;

  return (
    <section className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-white">Account</h1>
      <p className="mt-2 text-slate-400">Manage your sign-in methods.</p>

      {params.error ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200"
        >
          {params.error}
        </p>
      ) : null}
      {successMessage ? (
        <p className="mt-6 rounded-md border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-200">
          {successMessage}
        </p>
      ) : null}

      <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-8">
        <h2 className="text-xl font-semibold text-white">Connected accounts</h2>
        <div className="mt-5 divide-y divide-slate-800">
          {(["google", "github"] as const).map((provider) => {
            const linked = security.linkedProviders.includes(provider);
            const label = provider === "google" ? "Google" : "GitHub";
            return (
              <div
                key={provider}
                className="flex items-center justify-between gap-4 py-4"
              >
                <div>
                  <p className="font-medium text-slate-100">{label}</p>
                  <p className="text-sm text-slate-400">
                    {linked ? "Connected" : "Not connected"}
                  </p>
                </div>
                <form
                  action={
                    linked ? unlinkOAuthAccountAction : linkOAuthAccountAction
                  }
                >
                  <input type="hidden" name="provider" value={provider} />
                  <button className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-slate-500 hover:bg-slate-800">
                    {linked ? "Unlink" : "Link"}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      {security.hasPassword ? (
        <form
          action={changePasswordAction}
          className="mt-8 space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-8"
        >
          <h2 className="text-xl font-semibold text-white">Change password</h2>
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
              minLength={8}
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
      ) : (
        <form
          action={setPasswordAction}
          className="mt-8 space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-8"
        >
          <div>
            <h2 className="text-xl font-semibold text-white">Set password</h2>
            <p className="mt-1 text-sm text-slate-400">
              Add a password before disconnecting your last provider.
            </p>
          </div>
          <label className="block text-sm font-medium text-slate-200">
            New password
            <input
              name="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            />
          </label>
          <button className="rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-300">
            Set password
          </button>
        </form>
      )}
    </section>
  );
}
