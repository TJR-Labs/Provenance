"use server";

import { TRPCError } from "@trpc/server";
import { redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function changePasswordAction(formData: FormData) {
  let destination = "/account?success=password-changed";

  try {
    const caller = await getServerCaller();
    await caller.users.changePassword({
      currentPassword: getString(formData, "currentPassword"),
      newPassword: getString(formData, "newPassword"),
    });
  } catch (error) {
    const message =
      error instanceof TRPCError && error.code === "BAD_REQUEST"
        ? "Current password is incorrect."
        : "Unable to change password. Check all fields and try again.";
    destination = `/account?error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}
