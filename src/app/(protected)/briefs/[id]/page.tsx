import { TRPCError } from "@trpc/server";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { Role } from "../../../../../generated/prisma";
import { auth } from "~/server/auth";
import { getServerCaller } from "~/server/api/caller";
import { formatBriefDomain } from "../brief-labels";
import { scoreSubmissionAction, upsertSubmissionAction } from "./actions";
import { SubmissionForm, type SubmissionFormState } from "./submission-form";

type BriefPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    evaluation?: string;
    evaluationError?: string;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
});

export default async function BriefPage({
  params,
  searchParams,
}: BriefPageProps) {
  const [{ id }, query, session, caller] = await Promise.all([
    params,
    searchParams,
    auth(),
    getServerCaller(),
  ]);

  let brief;
  let engineerSubmission: Awaited<
    ReturnType<typeof caller.submission.mineForBrief>
  > = null;
  let companyEvaluation: Awaited<
    ReturnType<typeof caller.evaluation.companyView>
  > | null = null;
  let engineerResult: Awaited<ReturnType<typeof caller.evaluation.myResult>> =
    null;

  try {
    brief = await caller.brief.getById({ id });

    if (session?.user.role === Role.ENGINEER) {
      engineerSubmission = await caller.submission.mineForBrief({
        briefId: id,
      });
      if (engineerSubmission) {
        engineerResult = await caller.evaluation.myResult({
          submissionId: engineerSubmission.id,
        });
      }
    } else if (session?.user.role === Role.COMPANY) {
      companyEvaluation = await caller.evaluation.companyView({ briefId: id });
    }
  } catch (error) {
    if (error instanceof TRPCError) {
      if (error.code === "NOT_FOUND") notFound();
      if (error.code === "FORBIDDEN") forbidden();
    }
    throw error;
  }

  const submissionFormState: SubmissionFormState = {
    values: {
      repoUrl: engineerSubmission?.repoUrl ?? "",
      demoUrl: engineerSubmission?.demoUrl ?? "",
      writeup: engineerSubmission?.writeup ?? "",
    },
  };

  return (
    <article className="mx-auto w-full max-w-4xl px-6 py-16">
      <Link href="/briefs" className="text-sm text-sky-300 hover:text-sky-200">
        &larr; Open briefs
      </Link>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-sky-950 px-3 py-1 text-xs font-medium text-sky-200">
          {formatBriefDomain(brief.domain)}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            brief.status === "OPEN"
              ? "bg-emerald-950 text-emerald-200"
              : "bg-slate-800 text-slate-300"
          }`}
        >
          {brief.status === "OPEN" ? "Open" : "Closed"}
        </span>
      </div>

      <h1 className="mt-5 text-4xl font-bold tracking-tight text-white">
        {brief.title}
      </h1>
      <p className="mt-4 text-xl leading-8 text-slate-300">{brief.summary}</p>
      <p className="mt-5 text-sm text-slate-400">
        Posted by {brief.company.displayName} on{" "}
        {dateFormatter.format(brief.createdAt)}
      </p>

      <section className="mt-12 border-t border-slate-800 pt-10">
        <h2 className="text-2xl font-semibold text-white">Description</h2>
        <p className="mt-5 leading-8 whitespace-pre-wrap text-slate-300">
          {brief.description}
        </p>
      </section>

      <section className="mt-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold text-white">Deliverables</h2>
        <p className="mt-5 leading-8 whitespace-pre-wrap text-slate-300">
          {brief.deliverables}
        </p>
      </section>

      {session?.user.role === Role.ENGINEER && brief.status === "OPEN" ? (
        <section className="mt-10 rounded-xl border border-sky-900 bg-slate-900 p-6 sm:p-8">
          <h2 className="text-2xl font-semibold text-white">
            {engineerSubmission ? "Edit your submission" : "Submit your work"}
          </h2>
          <p className="mt-2 text-slate-400">
            Your submission becomes part of your permanent engineer portfolio.
          </p>
          <SubmissionForm
            action={upsertSubmissionAction.bind(null, id)}
            initialState={submissionFormState}
            isEditing={Boolean(engineerSubmission)}
          />
        </section>
      ) : null}

      {session?.user.role === Role.ENGINEER && brief.status === "CLOSED" ? (
        <section className="mt-10 rounded-xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
          <h2 className="text-2xl font-semibold text-white">Your submission</h2>
          {engineerSubmission ? (
            <div className="mt-5">
              <SubmissionLinks submission={engineerSubmission} />
              <p className="mt-5 leading-7 whitespace-pre-wrap text-slate-300">
                {engineerSubmission.writeup}
              </p>
              <p className="mt-5 text-xs text-slate-500">
                Submitted {dateFormatter.format(engineerSubmission.createdAt)}{" "}
                &middot; Updated{" "}
                {dateFormatter.format(engineerSubmission.updatedAt)}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-slate-400">
              This brief closed before you submitted work.
            </p>
          )}
        </section>
      ) : null}

      {session?.user.role === Role.ENGINEER && engineerResult ? (
        <section className="mt-10 rounded-xl border border-emerald-900 bg-emerald-950/20 p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-2xl font-semibold text-white">
              Your evaluation
            </h2>
            <p className="text-2xl font-bold text-emerald-300">
              {engineerResult.percentage.toFixed(1)}%
            </p>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-3 font-medium">Criterion</th>
                  <th className="pb-3 font-medium">Weight</th>
                  <th className="pb-3 font-medium">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-900/50">
                {engineerResult.scores.map((score) => (
                  <tr key={score.criterionId}>
                    <td className="py-3 text-slate-200">{score.name}</td>
                    <td className="py-3 text-slate-400">{score.weight}</td>
                    <td className="py-3 font-semibold text-white">
                      {score.value}/5
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 border-t border-emerald-900/50 pt-5">
            <h3 className="text-sm font-semibold text-slate-200">
              Company feedback
            </h3>
            <p className="mt-2 leading-7 whitespace-pre-wrap text-slate-300">
              {engineerResult.feedbackNote ?? "No feedback note was provided."}
            </p>
          </div>
        </section>
      ) : null}

      {session?.user.role === Role.COMPANY && companyEvaluation ? (
        <section className="mt-10 border-t border-slate-800 pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-white">
                Ranked submissions
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                {companyEvaluation.submissions.length}{" "}
                {companyEvaluation.submissions.length === 1
                  ? "submission"
                  : "submissions"}
              </p>
            </div>
            <Link
              href={`/briefs/${id}/edit`}
              className="text-sm font-semibold text-sky-300 hover:text-sky-200"
            >
              Manage rubric
            </Link>
          </div>

          {query.evaluationError ? (
            <p
              role="alert"
              className="mt-6 rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200"
            >
              {query.evaluationError}
            </p>
          ) : null}
          {query.evaluation ? (
            <p className="mt-6 rounded-md border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-200">
              Evaluation saved.
            </p>
          ) : null}

          {!companyEvaluation.criteria.length ? (
            <p className="mt-6 rounded-xl border border-amber-900 bg-amber-950/30 px-5 py-4 text-amber-200">
              Scoring is disabled because this rubric has no criteria. Add a
              criterion in the rubric manager to begin scoring.
            </p>
          ) : null}

          {companyEvaluation.submissions.length ? (
            <div className="mt-6 space-y-6">
              {companyEvaluation.submissions.map((submission, index) => (
                <article
                  key={submission.id}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">
                        Rank {index + 1}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-white">
                        <Link
                          href={`/engineers/${submission.engineerId}`}
                          className="hover:text-sky-300"
                        >
                          {submission.engineer.displayName}
                        </Link>
                      </h3>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-300">
                        {submission.scoringStatus === "FULLY_SCORED"
                          ? "Fully scored"
                          : submission.scoringStatus === "PARTIALLY_SCORED"
                            ? "Partially scored"
                            : "Unscored"}
                      </p>
                      {submission.percentage !== null ? (
                        <p className="mt-1 text-2xl font-bold text-emerald-300">
                          {submission.percentage.toFixed(1)}%
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <SubmissionLinks submission={submission} />
                  <p className="mt-5 leading-7 whitespace-pre-wrap text-slate-300">
                    {submission.writeup}
                  </p>
                  <p className="mt-5 text-xs text-slate-500">
                    Submitted {dateFormatter.format(submission.createdAt)}{" "}
                    &middot; Updated{" "}
                    {dateFormatter.format(submission.updatedAt)}
                  </p>

                  {companyEvaluation.criteria.length ? (
                    <form
                      action={scoreSubmissionAction.bind(
                        null,
                        id,
                        submission.id,
                      )}
                      className="mt-6 border-t border-slate-800 pt-6"
                    >
                      <h4 className="font-semibold text-white">
                        Score submission
                      </h4>
                      <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        {companyEvaluation.criteria.map((criterion) => {
                          const savedScore = submission.scores.find(
                            (score) => score.criterionId === criterion.id,
                          );
                          return (
                            <label
                              key={criterion.id}
                              className="text-sm font-medium text-slate-200"
                            >
                              {criterion.name}{" "}
                              <span className="font-normal text-slate-500">
                                (weight {criterion.weight})
                              </span>
                              <input
                                name={`score:${criterion.id}`}
                                type="number"
                                min={0}
                                max={5}
                                step={1}
                                required
                                defaultValue={savedScore?.value}
                                className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                              />
                            </label>
                          );
                        })}
                      </div>
                      <label className="mt-5 block text-sm font-medium text-slate-200">
                        Overall feedback{" "}
                        <span className="font-normal text-slate-500">
                          (optional)
                        </span>
                        <textarea
                          name="feedbackNote"
                          rows={4}
                          defaultValue={submission.feedbackNote ?? ""}
                          className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                        />
                      </label>
                      <button
                        type="submit"
                        className="mt-5 rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-300"
                      >
                        Save evaluation
                      </button>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-6 rounded-xl border border-dashed border-slate-700 px-6 py-10 text-center text-slate-400">
              No submissions yet.
            </p>
          )}
        </section>
      ) : null}
    </article>
  );
}

function SubmissionLinks({
  submission,
}: {
  submission: { repoUrl: string; demoUrl: string | null };
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
      <a
        href={submission.repoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sky-300 hover:text-sky-200"
      >
        Repository
      </a>
      {submission.demoUrl ? (
        <a
          href={submission.demoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-300 hover:text-sky-200"
        >
          Demo
        </a>
      ) : null}
    </div>
  );
}
