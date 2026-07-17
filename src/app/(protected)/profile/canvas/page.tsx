import Link from "next/link";

import { getServerCaller } from "~/server/api/caller";
import { CanvasEditor } from "./canvas-editor";

type ProfileLink = { label: string; url: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ProfileLink =>
      isRecord(item) &&
      typeof item.label === "string" &&
      typeof item.url === "string",
  );
}

export default async function CanvasEditorPage() {
  const caller = await getServerCaller();
  const profile = await caller.profile.me();

  if (profile.layoutMode !== "CANVAS") {
    return (
      <section className="mx-auto w-full max-w-3xl px-6 py-14">
        <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
          Canvas layout
        </h1>
        <p className="text-muted mt-4">
          Your profile is currently using the grid layout. Switch to the canvas
          layout from your profile settings first.
        </p>
        <Link
          href="/profile/edit#layout-mode"
          className="text-accent hover:text-accent-strong mt-4 inline-block text-sm font-semibold transition-colors"
        >
          Go to profile settings →
        </Link>
      </section>
    );
  }

  const projects = await caller.project.listByUsername({
    username: profile.username,
  });

  return (
    <section className="mx-auto w-full max-w-[1480px] px-6 py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
            Canvas layout
          </h1>
          <p className="text-muted mt-2">
            Drag, resize, and overlap elements, then Save Layout to publish them
            to /{profile.username}.
          </p>
        </div>
        <Link
          href="/profile/edit"
          className="text-accent hover:text-accent-strong text-sm font-semibold transition-colors"
        >
          Back to profile settings
        </Link>
      </div>
      <CanvasEditor
        bio={profile.bio}
        links={readLinks(profile.links)}
        projects={projects.map((project) => ({
          id: project.id,
          title: project.title,
          description: project.description,
          category: project.category,
          hashtags: project.hashtags,
          media: project.media.map((media) => ({
            url: media.url,
            mimeType: media.mimeType,
          })),
        }))}
      />
    </section>
  );
}
