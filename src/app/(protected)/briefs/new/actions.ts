"use server";

import { TRPCError } from "@trpc/server";
import { forbidden, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { briefFieldsSchema } from "~/server/briefs";
import { getServerCaller } from "~/server/api/caller";
import type {
  BriefFormState,
  BriefFormValues,
} from "~/app/(protected)/briefs/brief-form";

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readValues(formData: FormData): BriefFormValues {
  return {
    title: getString(formData, "title"),
    summary: getString(formData, "summary"),
    description: getString(formData, "description"),
    domain: getString(formData, "domain"),
    deliverables: getString(formData, "deliverables"),
  };
}

export async function createBriefAction(
  _state: BriefFormState,
  formData: FormData,
): Promise<BriefFormState> {
  const values = readValues(formData);
  const result = briefFieldsSchema.safeParse(values);

  if (!result.success) {
    return {
      values,
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  try {
    const caller = await getServerCaller();
    await caller.brief.create(result.data);
  } catch (error) {
    if (error instanceof TRPCError && error.code === "FORBIDDEN") {
      forbidden();
    }
    return {
      values,
      formError: "Unable to create the brief. Check the fields and try again.",
    };
  }

  revalidatePath("/briefs");
  revalidatePath("/company");
  redirect("/company?success=brief-created");
}
