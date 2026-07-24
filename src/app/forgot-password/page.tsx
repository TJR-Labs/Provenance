import { TRPCError } from "@trpc/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";

type ForgotPasswordPageProps = {
  searchParams: Promise<{ error?: string; sent?: string }>;
};

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params = await searchParams;

  async function requestReset(formData: FormData) {
    "use server";
    const rawEmail = formData.get("email");
    const email = typeof rawEmail === "string" ? rawEmail : "";
    let destination = "/forgot-password?sent=1";
    try {
      await (await getServerCaller()).users.requestPasswordReset({ email });
    } catch (error) {
      const message =
        error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS"
          ? error.message
          : "Unable to request a reset. Check the address and try again.";
      destination = `/forgot-password?error=${encodeURIComponent(message)}`;
    }
    redirect(destination);
  }

  return (
    <section className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="border-line bg-surface w-full max-w-md rounded-lg border p-8 shadow-sm">
        <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
          Reset password
        </h1>
        <p className="text-muted mt-2 text-sm">
          Enter the verified email on your credentials account.
        </p>
        {params.sent ? (
          <p className="border-success-line bg-success-surface text-success mt-6 rounded-md border px-4 py-3 text-sm">
            If a verified credentials account uses that email, a reset link has
            been sent.
          </p>
        ) : null}
        {params.error ? (
          <p
            role="alert"
            className="border-danger-line bg-danger-surface text-danger mt-6 rounded-md border px-4 py-3 text-sm"
          >
            {params.error}
          </p>
        ) : null}
        <form action={requestReset} className="mt-6 space-y-5">
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
          </label>
          <button className="bg-accent text-on-accent hover:bg-accent-strong w-full rounded-md px-4 py-2 font-semibold transition-colors">
            Send reset link
          </button>
        </form>
        <Link
          href="/login"
          className="text-muted hover:text-ink mt-5 block text-center text-sm"
        >
          Back to login
        </Link>
      </div>
    </section>
  );
}
