"use server";

import { redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";
import { auth } from "~/server/auth";

function reason(formData: FormData) {
  const value = formData.get("reason");
  return typeof value === "string" ? value : "";
}

export async function reportProjectAction(
  projectId: string,
  returnTo: string,
  formData: FormData,
) {
  if (!(await auth()))
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await (
    await getServerCaller()
  ).moderation.report({
    projectId,
    reason: reason(formData),
  });
  redirect(`${returnTo}?reported=1`);
}

export async function reportProfileAction(
  username: string,
  formData: FormData,
) {
  const returnTo = `/${username}`;
  if (!(await auth()))
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await (
    await getServerCaller()
  ).moderation.report({
    reportedUsername: username,
    reason: reason(formData),
  });
  redirect(`${returnTo}?reported=1`);
}
