"use server";

import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";
import { forbidden, notFound, redirect } from "next/navigation";

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

export async function updateBriefAction(
  id: string,
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
    await caller.brief.update({ id, ...result.data });
  } catch (error) {
    if (error instanceof TRPCError) {
      if (error.code === "FORBIDDEN") forbidden();
      if (error.code === "NOT_FOUND") notFound();
    }
    return {
      values,
      formError: "Unable to update the brief. Check the fields and try again.",
    };
  }

  revalidatePath("/briefs");
  revalidatePath(`/briefs/${id}`);
  revalidatePath("/company");
  redirect(`/briefs/${id}`);
}

function readCriterion(formData: FormData) {
  return {
    name: getString(formData, "name"),
    weight: Number(getString(formData, "weight")),
  };
}

function handleEvaluationError(error: unknown, briefId: string): never {
  if (error instanceof TRPCError) {
    if (error.code === "FORBIDDEN") forbidden();
    if (error.code === "NOT_FOUND") notFound();
    if (error.code === "BAD_REQUEST") {
      redirect(
        `/briefs/${briefId}/edit?rubricError=${encodeURIComponent(error.message)}`,
      );
    }
  }
  redirect(
    `/briefs/${briefId}/edit?rubricError=${encodeURIComponent("Unable to update the rubric.")}`,
  );
}

function refreshRubric(briefId: string, result: string): never {
  revalidatePath(`/briefs/${briefId}`);
  revalidatePath(`/briefs/${briefId}/edit`);
  redirect(`/briefs/${briefId}/edit?rubric=${result}`);
}

export async function addCriterionAction(briefId: string, formData: FormData) {
  try {
    await (
      await getServerCaller()
    ).evaluation.addCriterion({ briefId, ...readCriterion(formData) });
  } catch (error) {
    handleEvaluationError(error, briefId);
  }

  refreshRubric(briefId, "added");
}

export async function updateCriterionAction(
  briefId: string,
  criterionId: string,
  formData: FormData,
) {
  try {
    await (
      await getServerCaller()
    ).evaluation.updateCriterion({
      criterionId,
      ...readCriterion(formData),
    });
  } catch (error) {
    handleEvaluationError(error, briefId);
  }

  refreshRubric(briefId, "updated");
}

export async function removeCriterionAction(
  briefId: string,
  criterionId: string,
) {
  try {
    await (await getServerCaller()).evaluation.removeCriterion({ criterionId });
  } catch (error) {
    handleEvaluationError(error, briefId);
  }

  refreshRubric(briefId, "removed");
}
