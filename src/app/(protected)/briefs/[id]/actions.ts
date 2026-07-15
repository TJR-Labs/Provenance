"use server";

import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";
import { forbidden, notFound, redirect } from "next/navigation";

import type {
  SubmissionFormState,
  SubmissionFormValues,
} from "./submission-form";
import { getServerCaller } from "~/server/api/caller";
import { submissionFieldsSchema } from "~/server/submissions";

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readValues(formData: FormData): SubmissionFormValues {
  return {
    repoUrl: getString(formData, "repoUrl"),
    demoUrl: getString(formData, "demoUrl"),
    writeup: getString(formData, "writeup"),
  };
}

export async function upsertSubmissionAction(
  briefId: string,
  _state: SubmissionFormState,
  formData: FormData,
): Promise<SubmissionFormState> {
  const values = readValues(formData);
  const result = submissionFieldsSchema.safeParse({
    ...values,
    demoUrl: values.demoUrl.trim() || null,
  });

  if (!result.success) {
    return {
      values,
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  try {
    await (
      await getServerCaller()
    ).submission.upsert({ briefId, ...result.data });
  } catch (error) {
    if (error instanceof TRPCError) {
      if (error.code === "FORBIDDEN") forbidden();
      if (error.code === "NOT_FOUND") notFound();
      if (error.code === "BAD_REQUEST") {
        return { values, formError: error.message };
      }
    }
    return {
      values,
      formError:
        "Unable to save the submission. Check the fields and try again.",
    };
  }

  revalidatePath(`/briefs/${briefId}`);
  return { values, success: true };
}

export async function scoreSubmissionAction(
  briefId: string,
  submissionId: string,
  formData: FormData,
) {
  const scores = [...formData.entries()]
    .filter(([name]) => name.startsWith("score:"))
    .map(([name, value]) => ({
      criterionId: name.slice("score:".length),
      value: typeof value === "string" ? Number(value) : Number.NaN,
    }));
  const feedback = formData.get("feedbackNote");
  const feedbackNote =
    typeof feedback === "string" && feedback.trim() ? feedback.trim() : null;

  try {
    await (
      await getServerCaller()
    ).evaluation.scoreSubmission({ submissionId, scores, feedbackNote });
  } catch (error) {
    if (error instanceof TRPCError) {
      if (error.code === "FORBIDDEN") forbidden();
      if (error.code === "NOT_FOUND") notFound();
      if (error.code === "BAD_REQUEST") {
        redirect(
          `/briefs/${briefId}?evaluationError=${encodeURIComponent(error.message)}`,
        );
      }
    }
    redirect(
      `/briefs/${briefId}?evaluationError=${encodeURIComponent("Unable to save the evaluation.")}`,
    );
  }

  revalidatePath(`/briefs/${briefId}`);
  redirect(`/briefs/${briefId}?evaluation=saved`);
}
