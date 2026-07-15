"use server";

import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";

export async function sendProfileOutreachAction(
  engineerId: string,
  formData: FormData,
) {
  const value = formData.get("body");
  const body = typeof value === "string" ? value : "";
  let destination = `/engineers/${engineerId}?outreach=sent`;

  try {
    await (
      await getServerCaller()
    ).message.send({ toEngineerId: engineerId, briefId: null, body });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "FORBIDDEN") {
      forbidden();
    }
    const message =
      error instanceof TRPCError && error.code === "BAD_REQUEST"
        ? error.message
        : "Unable to send outreach. Please try again.";
    destination = `/engineers/${engineerId}?error=${encodeURIComponent(message)}`;
  }

  revalidatePath("/scout");
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
  redirect(destination);
}
