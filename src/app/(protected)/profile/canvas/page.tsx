import Link from "next/link";

import { getServerCaller } from "~/server/api/caller";
import { CanvasEditor } from "./canvas-editor";
import { LayoutModeToggle } from "./layout-mode-toggle";

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
  const isCanvas = profile.layoutMode === "CANVAS";

  // Only the canvas editor needs the project list; the grid state does not.
  const projects = isCanvas
    ? await caller.project.listByUsername({ username: profile.username })
    : [];

  return (
    <section
      className={
        isCanvas
          ? "mx-auto w-full max-w-[1480px] px-6 py-14"
          : "mx-auto w-full max-w-3xl px-6 py-14"
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
            Canvas layout
          </h1>
          <p className="text-muted mt-2">
            {isCanvas
              ? `Drag, resize, and overlap elements, then Save Layout to publish them to /${profile.username}.`
              : "Choose the canvas layout to arrange your profile freely, right here."}
          </p>
        </div>
        <Link
          href={`/${profile.username}`}
          className="text-accent hover:text-accent-strong text-sm font-semibold transition-colors"
        >
          Back to profile
        </Link>
      </div>

      {/* Toggle lives here now (moved off /profile/edit). Visiting in GRID
          mode shows it inline so the user can switch right on this page. */}
      <LayoutModeToggle mode={profile.layoutMode} />

      {isCanvas ? (
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
      ) : (
        <p className="text-muted mt-6">
          Your profile is currently using the grid layout. Switch to Canvas
          above to start arranging it here.
        </p>
      )}
    </section>
  );
}
