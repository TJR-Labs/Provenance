import { signIn } from "~/server/auth";

type OAuthButtonsProps = {
  redirectTo?: string;
};

export function OAuthButtons({ redirectTo = "/" }: OAuthButtonsProps) {
  async function oauthSignIn(formData: FormData) {
    "use server";

    const provider = formData.get("provider");
    if (provider !== "google" && provider !== "github") return;
    await signIn(provider, { redirectTo });
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="text-faint flex items-center gap-3 font-mono text-xs tracking-[0.14em] uppercase">
        <span className="bg-line h-px flex-1" />
        or
        <span className="bg-line h-px flex-1" />
      </div>
      {(["google", "github"] as const).map((provider) => (
        <form action={oauthSignIn} key={provider}>
          <input type="hidden" name="provider" value={provider} />
          <button
            type="submit"
            className="border-line-strong text-ink hover:bg-raised w-full rounded-md border px-4 py-2 font-semibold transition-colors"
          >
            Continue with {provider === "google" ? "Google" : "GitHub"}
          </button>
        </form>
      ))}
    </div>
  );
}
