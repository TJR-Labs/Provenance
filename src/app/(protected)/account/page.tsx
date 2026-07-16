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
      <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
        Account
      </h1>
      <p className="text-muted mt-2">Manage your sign-in methods.</p>

      {params.error ? (
        <p
          role="alert"
          className="border-danger-line bg-danger-surface text-danger mt-6 rounded-md border px-4 py-3 text-sm break-words"
        >
          {params.error}
        </p>
      ) : null}
      {successMessage ? (
        <p className="border-success-line bg-success-surface text-success mt-6 rounded-md border px-4 py-3 text-sm">
          {successMessage}
        </p>
      ) : null}

      <section className="border-line bg-surface mt-8 rounded-lg border p-8">
        <h2 className="font-display text-ink text-xl font-semibold">
          Connected accounts
        </h2>
        <div className="divide-line mt-5 divide-y">
          {(["google", "github"] as const).map((provider) => {
            const linked = security.linkedProviders.includes(provider);
            const label = provider === "google" ? "Google" : "GitHub";
            return (
              <div
                key={provider}
                className="flex items-center justify-between gap-4 py-4"
              >
                <div>
                  <p className="text-ink font-medium">{label}</p>
                  <p className="text-muted mt-0.5 font-mono text-xs tracking-[0.14em] uppercase">
                    {linked ? "Connected" : "Not connected"}
                  </p>
                </div>
                <form
                  action={
                    linked ? unlinkOAuthAccountAction : linkOAuthAccountAction
                  }
                >
                  <input type="hidden" name="provider" value={provider} />
                  <button className="border-line-strong text-ink hover:bg-raised rounded-md border px-4 py-2 text-sm font-semibold transition-colors">
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
          className="border-line bg-surface mt-8 space-y-5 rounded-lg border p-8"
        >
          <h2 className="font-display text-ink text-xl font-semibold">
            Change password
          </h2>
          <label className="text-ink block text-sm font-medium">
            Current password
            <input
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
            />
          </label>
          <label className="text-ink block text-sm font-medium">
            New password
            <input
              name="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-4 py-2 font-semibold transition-colors"
          >
            Change password
          </button>
        </form>
      ) : (
        <form
          action={setPasswordAction}
          className="border-line bg-surface mt-8 space-y-5 rounded-lg border p-8"
        >
          <div>
            <h2 className="font-display text-ink text-xl font-semibold">
              Set password
            </h2>
            <p className="text-muted mt-1 text-sm">
              Add a password before disconnecting your last provider.
            </p>
          </div>
          <label className="text-ink block text-sm font-medium">
            New password
            <input
              name="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="border-line-strong bg-canvas text-ink focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
            />
          </label>
          <button className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-4 py-2 font-semibold transition-colors">
            Set password
          </button>
        </form>
      )}
    </section>
  );
}
