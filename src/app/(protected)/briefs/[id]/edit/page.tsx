import { TRPCError } from "@trpc/server";
import { forbidden, notFound } from "next/navigation";

import { Role } from "../../../../../../generated/prisma";
import { auth } from "~/server/auth";
import { getServerCaller } from "~/server/api/caller";
import { BriefForm, type BriefFormState } from "../../brief-form";
import {
  addCriterionAction,
  removeCriterionAction,
  updateBriefAction,
  updateCriterionAction,
} from "./actions";

type EditBriefPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rubric?: string; rubricError?: string }>;
};

export default async function EditBriefPage({
  params,
  searchParams,
}: EditBriefPageProps) {
  const session = await auth();
  if (session?.user.role !== Role.COMPANY) {
    forbidden();
  }
  const companyId = session?.user.id;
  if (!companyId) forbidden();

  const { id } = await params;
  let brief;
  let evaluation;
  try {
    const caller = await getServerCaller();
    [brief, evaluation] = await Promise.all([
      caller.brief.getById({ id }),
      caller.evaluation.companyView({ briefId: id }),
    ]);
  } catch (error) {
    if (error instanceof TRPCError) {
      if (error.code === "NOT_FOUND") notFound();
      if (error.code === "FORBIDDEN") forbidden();
    }
    throw error;
  }

  if (brief.companyId !== companyId) {
    forbidden();
  }

  const initialState: BriefFormState = {
    values: {
      title: brief.title,
      summary: brief.summary,
      description: brief.description,
      domain: brief.domain,
      deliverables: brief.deliverables,
    },
  };
  const query = await searchParams;
  const inputClassName =
    "block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400";

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-white">
        Edit brief
      </h1>
      <p className="mt-2 text-slate-400">
        Update the scope and submission requirements.
      </p>
      <BriefForm
        action={updateBriefAction.bind(null, id)}
        initialState={initialState}
        submitLabel="Save changes"
      />

      <section className="mt-14 border-t border-slate-800 pt-10">
        <h2 className="text-2xl font-semibold text-white">Evaluation rubric</h2>
        <p className="mt-2 text-slate-400">
          Add, rename, re-weight, or remove the criteria used to score every
          submission.
        </p>

        {query.rubricError ? (
          <p
            role="alert"
            className="mt-6 rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200"
          >
            {query.rubricError}
          </p>
        ) : null}
        {query.rubric ? (
          <p className="mt-6 rounded-md border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-200">
            Rubric {query.rubric}.
          </p>
        ) : null}

        {evaluation.criteria.length ? (
          <div className="mt-6 space-y-4">
            {evaluation.criteria.map((criterion) => (
              <div
                key={criterion.id}
                className="rounded-xl border border-slate-800 bg-slate-900 p-5"
              >
                <form
                  action={updateCriterionAction.bind(null, id, criterion.id)}
                  className="grid gap-4 sm:grid-cols-[1fr_7rem_auto] sm:items-end"
                >
                  <label className="text-sm font-medium text-slate-200">
                    Criterion
                    <input
                      name="name"
                      required
                      defaultValue={criterion.name}
                      className={`mt-2 ${inputClassName}`}
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-200">
                    Weight
                    <input
                      name="weight"
                      type="number"
                      min={1}
                      max={5}
                      step={1}
                      required
                      defaultValue={criterion.weight}
                      className={`mt-2 ${inputClassName}`}
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-300"
                  >
                    Save
                  </button>
                </form>
                <form
                  action={removeCriterionAction.bind(null, id, criterion.id)}
                  className="mt-3"
                >
                  <button
                    type="submit"
                    className="text-sm font-semibold text-red-300 hover:text-red-200"
                  >
                    Remove criterion
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-xl border border-amber-900 bg-amber-950/30 px-5 py-4 text-amber-200">
            This rubric has no criteria. Add one before scoring submissions.
          </p>
        )}

        <form
          action={addCriterionAction.bind(null, id)}
          className="mt-8 rounded-xl border border-dashed border-slate-700 p-5"
        >
          <h3 className="font-semibold text-white">Add criterion</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_7rem_auto] sm:items-end">
            <label className="text-sm font-medium text-slate-200">
              Name
              <input
                name="name"
                required
                className={`mt-2 ${inputClassName}`}
              />
            </label>
            <label className="text-sm font-medium text-slate-200">
              Weight
              <input
                name="weight"
                type="number"
                min={1}
                max={5}
                step={1}
                required
                defaultValue={1}
                className={`mt-2 ${inputClassName}`}
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-slate-700 px-4 py-2 font-semibold text-white hover:bg-slate-600"
            >
              Add
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}
