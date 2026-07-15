"use server";

import { TRPCError } from "@trpc/server";
import { redirect } from "next/navigation";

import { Role } from "../../../../../generated/prisma";
import { getServerCaller } from "~/server/api/caller";

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createUserAction(formData: FormData) {
  const roleValue = getString(formData, "role");
  const role = Object.values(Role).find((value) => value === roleValue);
  let destination = "/admin/users?success=user-created";

  if (!role) {
    redirect("/admin/users?error=Invalid%20role.");
  }

  try {
    const caller = await getServerCaller();
    await caller.users.create({
      username: getString(formData, "username"),
      displayName: getString(formData, "displayName"),
      role,
      companyName: getString(formData, "companyName"),
      password: getString(formData, "password"),
    });
  } catch (error) {
    let message = "Unable to create user. Check all fields and try again.";
    if (error instanceof TRPCError && error.code === "CONFLICT") {
      message = "That username is already in use.";
    } else if (role === Role.COMPANY && !formData.get("companyName")) {
      message = "Company name is required for company users.";
    }
    destination = `/admin/users?error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}
