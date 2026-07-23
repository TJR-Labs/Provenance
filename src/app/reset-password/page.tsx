import type { Metadata } from "next";
import { TRPCError } from "@trpc/server";
import { redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";

export const metadata: Metadata = {
  title: "Reset password · Provenance",
  referrer: "no-referrer",
};

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string; error?: string }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = params.token ?? "";

  async function resetPassword(formData: FormData) {
    "use server";
    const value = (name: string) => {
      const item = formData.get(name);
      return typeof item === "string" ? item : "";
    };
    let destination = "/login?reset=1";
    try {
      await (
        await getServerCaller()
      ).users.consumePasswordReset({
        email: value("email"),
        token: value("token"),
        newPassword: value("newPassword"),
      });
    } catch (error) {
      const message =
        error instanceof TRPCError
          ? error.message
          : "Unable to reset the password.";
      destination = `/reset-password?error=${encodeURIComponent(message)}`;
    }
    redirect(destination);
  }

  return (
    <section className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="border-line bg-surface w-full max-w-md rounded-lg border p-8 shadow-sm">
        <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
          Choose a new password
        </h1>
        {params.error ? (
          <p
            role="alert"
            className="border-danger-line bg-danger-surface text-danger mt-6 rounded-md border px-4 py-3 text-sm"
          >
            {params.error}
          </p>
        ) : null}
        {!token ? (
          <p
            role="alert"
            className="border-danger-line bg-danger-surface text-danger mt-6 rounded-md border px-4 py-3 text-sm"
          >
            This password reset link is invalid or has expired.
          </p>
        ) : (
          <form action={resetPassword} className="mt-6 space-y-5">
            <input type="hidden" name="token" value={token} />
            <label className="text-ink block text-sm font-medium">
              Verified email
              <input
                name="email"
                type="email"
                required
                maxLength={320}
                autoComplete="email"
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
            <button className="bg-accent text-on-accent hover:bg-accent-strong w-full rounded-md px-4 py-2 font-semibold transition-colors">
              Reset password
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
