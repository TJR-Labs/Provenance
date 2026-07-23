import type { Metadata } from "next";
import { TRPCError } from "@trpc/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";

export const metadata: Metadata = {
  title: "Verify email · Provenance",
  referrer: "no-referrer",
};

type VerifyEmailPageProps = {
  searchParams: Promise<{
    token?: string;
    error?: string;
    verified?: string;
  }>;
};

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const params = await searchParams;
  const token = params.token ?? "";

  async function verifyEmail(formData: FormData) {
    "use server";
    const rawToken = formData.get("token");
    let destination = "/verify-email?verified=1";
    try {
      await (
        await getServerCaller()
      ).users.confirmEmailVerification({
        token: typeof rawToken === "string" ? rawToken : "",
      });
    } catch (error) {
      const message =
        error instanceof TRPCError
          ? error.message
          : "Unable to verify this email.";
      destination = `/verify-email?error=${encodeURIComponent(message)}`;
    }
    redirect(destination);
  }

  return (
    <section className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="border-line bg-surface w-full max-w-md rounded-lg border p-8 text-center shadow-sm">
        <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
          Verify email
        </h1>
        {params.verified ? (
          <>
            <p className="border-success-line bg-success-surface text-success mt-6 rounded-md border px-4 py-3 text-sm">
              Your recovery email is verified.
            </p>
            <Link
              href="/account"
              className="text-accent hover:text-accent-strong mt-5 inline-block font-semibold"
            >
              Return to account
            </Link>
          </>
        ) : token ? (
          <form action={verifyEmail} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <button className="bg-accent text-on-accent hover:bg-accent-strong w-full rounded-md px-4 py-2 font-semibold transition-colors">
              Verify email
            </button>
          </form>
        ) : (
          <p
            role="alert"
            className="border-danger-line bg-danger-surface text-danger mt-6 rounded-md border px-4 py-3 text-sm"
          >
            {params.error ??
              "This email verification link is invalid or has expired."}
          </p>
        )}
      </div>
    </section>
  );
}
