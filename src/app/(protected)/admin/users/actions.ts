"use server";

import { redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";

export async function banUserAction(userId: string, returnTo = "/admin/users") {
  await (await getServerCaller()).users.ban({ userId });
  redirect(returnTo);
}
