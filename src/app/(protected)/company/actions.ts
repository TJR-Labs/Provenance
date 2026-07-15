"use server";

import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";
import { forbidden, notFound, redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";

function getId(formData: FormData) {
  const value = formData.get("id");
  return typeof value === "string" ? value : "";
}

async function changeBriefStatus(
  formData: FormData,
  status: "close" | "reopen",
) {
  const id = getId(formData);

  try {
    const caller = await getServerCaller();
    await caller.brief[status]({ id });
  } catch (error) {
    if (error instanceof TRPCError) {
      if (error.code === "FORBIDDEN") forbidden();
      if (error.code === "NOT_FOUND") notFound();
    }
    redirect("/company?error=Unable%20to%20update%20the%20brief.");
  }

  revalidatePath("/briefs");
  revalidatePath(`/briefs/${id}`);
  revalidatePath("/company");
  redirect(
    `/company?success=brief-${status === "close" ? "closed" : "reopened"}`,
  );
}

export async function closeBriefAction(formData: FormData) {
  await changeBriefStatus(formData, "close");
}

export async function reopenBriefAction(formData: FormData) {
  await changeBriefStatus(formData, "reopen");
}
