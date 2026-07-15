import { TRPCError } from "@trpc/server";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { Role } from "../../../../../generated/prisma";
import { auth } from "~/server/auth";
import { getServerCaller } from "~/server/api/caller";
import { formatBriefDomain } from "../brief-labels";
import { upsertSubmissionAction } from "./actions";
import { SubmissionForm, type SubmissionFormState } from "./submission-form";

type BriefPageProps = {
  params: Promise<{ id: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
});

export default async function BriefPage({ params }: BriefPageProps) {
  const { id } = await params;
  const [session, caller] = await Promise.all([auth(), getServerCaller()]);

  let brief;
  let engineerSubmission: Awaited<
    ReturnType<typeof caller.submission.mineForBrief>
  > = null;
  let companySubmissions: Awaited<
    ReturnType<typeof caller.submission.listForBrief>
  > = [];

  try {
    brief = await caller.brief.getById({ id });

    if (session?.user.role === Role.ENGINEER) {
      engineerSubmission = await caller.submission.mineForBrief({
        briefId: id,
      });
    } else if (session?.user.role === Role.COMPANY) {
      companySubmissions = await caller.submission.listForBrief({
        briefId: id,
      });
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
        ← Open briefs
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
              <div className="flex flex-wrap gap-4 text-sm font-semibold">
                <a
                  href={engineerSubmission.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-300 hover:text-sky-200"
                >
                  Repository
                </a>
                {engineerSubmission.demoUrl ? (
                  <a
                    href={engineerSubmission.demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-300 hover:text-sky-200"
                  >
                    Demo
                  </a>
                ) : null}
              </div>
              <p className="mt-5 leading-7 whitespace-pre-wrap text-slate-300">
                {engineerSubmission.writeup}
              </p>
              <p className="mt-5 text-xs text-slate-500">
                Submitted {dateFormatter.format(engineerSubmission.createdAt)} ·
                Updated {dateFormatter.format(engineerSubmission.updatedAt)}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-slate-400">
              This brief closed before you submitted work.
            </p>
          )}
        </section>
      ) : null}

      {session?.user.role === Role.COMPANY ? (
        <section className="mt-10 border-t border-slate-800 pt-10">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold text-white">Submissions</h2>
            <p className="text-sm text-slate-400">
              {companySubmissions.length}{" "}
              {companySubmissions.length === 1 ? "submission" : "submissions"}
            </p>
          </div>
          {companySubmissions.length ? (
            <div className="mt-6 space-y-6">
              {companySubmissions.map((submission) => (
                <article
                  key={submission.id}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-6"
                >
                  <h3 className="text-lg font-semibold text-white">
                    <Link
                      href={`/engineers/${submission.engineerId}`}
                      className="hover:text-sky-300"
                    >
                      {submission.engineer.displayName}
                    </Link>
                  </h3>
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
                  <p className="mt-5 leading-7 whitespace-pre-wrap text-slate-300">
                    {submission.writeup}
                  </p>
                  <p className="mt-5 text-xs text-slate-500">
                    Submitted {dateFormatter.format(submission.createdAt)} ·
                    Updated {dateFormatter.format(submission.updatedAt)}
                  </p>
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
