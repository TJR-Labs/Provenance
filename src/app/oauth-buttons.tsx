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
      <div className="flex items-center gap-3 text-xs tracking-wide text-slate-500 uppercase">
        <span className="h-px flex-1 bg-slate-800" />
        or
        <span className="h-px flex-1 bg-slate-800" />
      </div>
      {(["google", "github"] as const).map((provider) => (
        <form action={oauthSignIn} key={provider}>
          <input type="hidden" name="provider" value={provider} />
          <button
            type="submit"
            className="w-full rounded-md border border-slate-700 px-4 py-2 font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-800"
          >
            Continue with {provider === "google" ? "Google" : "GitHub"}
          </button>
        </form>
      ))}
    </div>
  );
}
