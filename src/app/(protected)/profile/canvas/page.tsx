import Link from "next/link";
import { TRPCError } from "@trpc/server";

import { GridLayoutEditor } from "~/app/grid-layout-editor";
import { getServerCaller } from "~/server/api/caller";
import { categoryLabels } from "~/server/categories";
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

  const [projects, gridLayout] = await Promise.all([
    isCanvas
      ? caller.project.listByUsername({ username: profile.username })
      : Promise.resolve([]),
    isCanvas
      ? Promise.resolve(null)
      : caller.grid.profileEditorState().catch((error: unknown) => {
          if (error instanceof TRPCError && error.code === "NOT_FOUND") {
            return null;
          }
          throw error;
        }),
  ]);

  // Category badge labels are derived per-project, matching the fixed header /
  // getPublicProfile — the Categories element is read-only and follows this.
  const categoryLabelList = [
    ...new Set(projects.map((project) => project.category)),
  ].map((category) => categoryLabels[category]);

  return (
    <section
      className={
        isCanvas
          ? "mx-auto w-full max-w-[1480px] px-6 py-14"
          : "mx-auto w-full max-w-[1480px] px-6 py-14"
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
            {isCanvas ? "Canvas layout" : "Grid layout"}
          </h1>
          <p className="text-muted mt-2">
            {isCanvas
              ? `Drag, resize, and overlap elements, then Save Layout to publish them to /${profile.username}.`
              : `Arrange blocks, save a private draft, and publish them to /${profile.username}.`}
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
          displayName={profile.displayName}
          username={profile.username}
          school={profile.school}
          avatarUrl={profile.avatarUrl}
          categories={categoryLabelList}
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
      ) : gridLayout ? (
        <GridLayoutEditor scope="profile" initial={gridLayout} />
      ) : (
        <p className="text-muted mt-6">
          Your existing layout remains published, but it exceeds the 50-block
          editor limit. The Grid editor is unavailable for this profile.
        </p>
      )}
    </section>
  );
}
