"use server";

import { redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";

export async function removeProjectAction(projectId: string) {
  await (await getServerCaller()).moderation.removeProject({ projectId });
  redirect("/admin/reports");
}
