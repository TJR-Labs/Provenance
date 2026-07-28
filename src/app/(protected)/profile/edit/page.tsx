import { getServerCaller } from "~/server/api/caller";
import { updateProfileAction } from "./actions";
import { ProfileForm } from "./profile-form";

type EditProfilePageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};
type LinkValue = { label: string; url: string };

function links(value: unknown): LinkValue[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is LinkValue =>
      isRecord(item) &&
      typeof item.label === "string" &&
      typeof item.url === "string",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default async function EditProfilePage({
  searchParams,
}: EditProfilePageProps) {
  const [profile, query] = await Promise.all([
    (await getServerCaller()).profile.me(),
    searchParams,
  ]);
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-14">
      <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
        Edit profile
      </h1>
      <p className="text-muted mt-2">
        Customize the public portfolio at /{profile.username}.
      </p>
      <ProfileForm
        action={updateProfileAction}
        error={query.error}
        success={Boolean(query.success)}
        initial={{
          displayName: profile.displayName,
          bio: profile.bio ?? "",
          school: profile.school ?? "",
          avatarUrl: profile.avatarUrl ?? "",
          links: links(profile.links),
          customCss: profile.customCss ?? "",
          private: profile.private,
        }}
      />
    </section>
  );
}
