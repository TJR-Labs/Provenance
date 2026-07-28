import { TRPCError } from "@trpc/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { classifyProjectMedia } from "~/lib/project-media";
import {
  projectStatuses,
  projectStatusLabels,
} from "~/lib/project-status";
import { getServerCaller } from "~/server/api/caller";
import { auth } from "~/server/auth";
import { categories, categoryLabels } from "~/server/categories";
import { deleteProjectAction, saveProjectAction } from "../../actions";
import { ProjectForm } from "../../project-form";

type EditProjectPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function EditProjectPage({
  params,
  searchParams,
}: EditProjectPageProps) {
  const { id } = await params;
  const caller = await getServerCaller();
  const [project, session, query] = await Promise.all([
    caller.project.getById({ id }),
    auth(),
    searchParams,
  ]);
  if (!project || project.user.id !== session?.user.id) notFound();

  let layoutEditorAvailable = false;
  const hasVideo = project.media.some(
    (media) => classifyProjectMedia(media) === "video",
  );
  if (!hasVideo) {
    try {
      await caller.grid.projectEditorState({ projectId: project.id });
      layoutEditorAvailable = true;
    } catch (error) {
      if (
        !(error instanceof TRPCError) ||
        (error.code !== "NOT_FOUND" && error.code !== "FORBIDDEN")
      ) {
        throw error;
      }
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
          Edit project
        </h1>
        {layoutEditorAvailable ? (
          <Link
            href={`/projects/${project.id}/layout`}
            className="border-line-strong text-ink hover:border-accent hover:text-accent rounded-md border px-4 py-2 text-sm font-semibold transition-colors"
          >
            Edit layout
          </Link>
        ) : null}
      </div>
      <ProjectForm
        action={saveProjectAction.bind(null, project.id)}
        categories={categories.map((value) => ({
          value,
          label: categoryLabels[value],
        }))}
        statuses={projectStatuses.map((value) => ({
          value,
          label: projectStatusLabels[value],
        }))}
        error={query.error}
        initial={{
          title: project.title,
          description: project.description,
          category: project.category,
          status: project.status,
          hashtags: project.hashtags,
          links: project.links,
          layout: project.layout,
          private: project.private,
          excludeFromFeed: project.excludeFromFeed,
          media: project.media.map((item) => ({
            kind: item.kind,
            url: item.url,
            mimeType: item.mimeType,
          })),
        }}
      />
      <form
        action={deleteProjectAction.bind(null, project.id)}
        className="border-danger-line bg-danger-surface mt-8 rounded-lg border p-6"
      >
        <h2 className="font-display text-danger font-semibold">
          Delete project
        </h2>
        <p className="text-muted mt-2 text-sm">
          This permanently removes the project, its media records, and its
          reports.
        </p>
        <button className="bg-danger-solid text-on-danger hover:bg-danger-hover mt-4 rounded-md px-4 py-2 text-sm font-semibold transition-colors">
          Delete project
        </button>
      </form>
    </section>
  );
}
