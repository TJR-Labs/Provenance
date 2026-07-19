"use server";

import { redirect } from "next/navigation";

import { Category, MediaKind } from "../../../../generated/prisma";
import { getServerCaller } from "~/server/api/caller";
import { auth } from "~/server/auth";
import { projectLayouts } from "~/server/projects";

function value(formData: FormData, name: string) {
  const item = formData.get(name);
  return typeof item === "string" ? item : "";
}

function lines(input: string) {
  return input
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function saveProjectAction(
  projectId: string | null,
  formData: FormData,
) {
  const category = Object.values(Category).find(
    (item) => item === value(formData, "category"),
  );
  const layout = projectLayouts.find(
    (item) => item === value(formData, "layout"),
  );
  const returnTo = projectId ? `/projects/${projectId}/edit` : "/projects/new";
  if (!category || !layout)
    redirect(`${returnTo}?error=Invalid%20project%20options.`);

  let media: { kind: MediaKind; url: string; mimeType?: string | null }[] = [];
  try {
    const raw = JSON.parse(value(formData, "media")) as unknown;
    if (Array.isArray(raw)) {
      const items = raw as unknown[];
      media = items.flatMap((item) => {
        if (
          isRecord(item) &&
          Object.values(MediaKind).includes(item.kind as MediaKind) &&
          typeof item.url === "string"
        ) {
          return [
            {
              kind: item.kind as MediaKind,
              url: item.url,
              mimeType:
                typeof item.mimeType === "string" ? item.mimeType : null,
            },
          ];
        }
        return [];
      });
    }
  } catch {
    redirect(`${returnTo}?error=Invalid%20media%20list.`);
  }

  const input = {
    title: value(formData, "title"),
    description: value(formData, "description"),
    category,
    hashtags: lines(value(formData, "hashtags")),
    links: lines(value(formData, "links")),
    layout,
    private: value(formData, "private") === "on",
    excludeFromFeed: value(formData, "includeInFeed") !== "on",
    media,
  };

  let destination = returnTo;
  try {
    const caller = await getServerCaller();
    const project = projectId
      ? await caller.project.update({ id: projectId, project: input })
      : await caller.project.create(input);
    destination = `/projects/${project.id}`;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save this project.";
    destination = `${returnTo}?error=${encodeURIComponent(message)}`;
  }
  redirect(destination);
}

export async function deleteProjectAction(projectId: string) {
  const session = await auth();
  await (await getServerCaller()).project.delete({ id: projectId });
  redirect(session ? `/${session.user.username}` : "/");
}
