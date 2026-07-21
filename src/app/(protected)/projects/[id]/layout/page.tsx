import { TRPCError } from "@trpc/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GridLayoutEditor } from "~/app/grid-layout-editor";
import { classifyProjectMedia } from "~/lib/project-media";
import { getServerCaller } from "~/server/api/caller";
import { auth } from "~/server/auth";

type ProjectLayoutPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectLayoutPage({
  params,
}: ProjectLayoutPageProps) {
  const { id } = await params;
  const caller = await getServerCaller();
  const [project, session] = await Promise.all([
    caller.project.getById({ id }),
    auth(),
  ]);
  if (
    !project ||
    project.user.id !== session?.user.id ||
    project.media.some((media) => classifyProjectMedia(media) === "video")
  ) {
    notFound();
  }

  let initial;
  try {
    initial = await caller.grid.projectEditorState({ projectId: id });
  } catch (error) {
    if (
      error instanceof TRPCError &&
      (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")
    ) {
      notFound();
    }
    throw error;
  }

  return (
    <section className="mx-auto w-full max-w-[1480px] px-6 py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
            Project layout
          </h1>
          <p className="text-muted mt-2">
            Arrange this project&apos;s public content, then save and publish
            it.
          </p>
        </div>
        <Link
          href={`/projects/${id}/edit`}
          className="text-accent hover:text-accent-strong text-sm font-semibold transition-colors"
        >
          Back to project details
        </Link>
      </div>
      <GridLayoutEditor scope="project" projectId={id} initial={initial} />
    </section>
  );
}
