"use server";

import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function sendScoutOutreachAction(formData: FormData) {
  let destination = "/scout?outreach=sent";

  try {
    await (
      await getServerCaller()
    ).message.send({
      toEngineerId: getString(formData, "toEngineerId"),
      briefId: getString(formData, "briefId") || null,
      body: getString(formData, "body"),
    });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "FORBIDDEN") {
      forbidden();
    }
    const message =
      error instanceof TRPCError && error.code === "BAD_REQUEST"
        ? error.message
        : "Unable to send outreach. Please try again.";
    destination = `/scout?error=${encodeURIComponent(message)}`;
  }

  revalidatePath("/scout");
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
  redirect(destination);
}
