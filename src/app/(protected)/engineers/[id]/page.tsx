import { TRPCError } from "@trpc/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";
import { formatBriefDomain } from "../../briefs/brief-labels";

type EngineerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EngineerPage({ params }: EngineerPageProps) {
  const { id } = await params;
  let profile;

  try {
    profile = await (
      await getServerCaller()
    ).submission.listForEngineer({ engineerId: id });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-16">
      <p className="text-sm font-semibold tracking-[0.16em] text-sky-400 uppercase">
        Engineer portfolio
      </p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight text-white">
        {profile.engineer.displayName}
      </h1>

      {profile.submissions.length ? (
        <div className="mt-10 space-y-6">
          {profile.submissions.map((submission) => (
            <article
              key={submission.id}
              className="rounded-xl border border-slate-800 bg-slate-900 p-6 sm:p-8"
            >
              <h2 className="text-xl font-semibold text-white">
                <Link
                  href={`/briefs/${submission.brief.id}`}
                  className="hover:text-sky-300"
                >
                  {submission.brief.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                {formatBriefDomain(submission.brief.domain)}
              </p>

              <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold">
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
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-xl border border-dashed border-slate-700 px-6 py-14 text-center">
          <h2 className="text-lg font-semibold text-white">
            No submissions yet
          </h2>
          <p className="mt-2 text-slate-400">
            Completed work will appear here as a permanent portfolio.
          </p>
        </div>
      )}
    </section>
  );
}
