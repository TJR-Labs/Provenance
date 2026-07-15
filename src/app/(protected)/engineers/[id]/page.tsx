import { TRPCError } from "@trpc/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Role } from "../../../../../generated/prisma";
import { getServerCaller } from "~/server/api/caller";
import { auth } from "~/server/auth";
import { formatBriefDomain } from "../../briefs/brief-labels";
import { sendProfileOutreachAction } from "./actions";

type EngineerPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; outreach?: string }>;
};

export default async function EngineerPage({
  params,
  searchParams,
}: EngineerPageProps) {
  const [{ id }, query, session] = await Promise.all([
    params,
    searchParams,
    auth(),
  ]);
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

      {session?.user.role === Role.COMPANY ? (
        <section className="mt-8 rounded-xl border border-sky-900 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold text-white">Reach out</h2>
          <p className="mt-2 text-sm text-slate-400">
            Send this engineer a private outreach message.
          </p>
          {query.error ? (
            <p
              role="alert"
              className="mt-4 rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200"
            >
              {query.error}
            </p>
          ) : null}
          {query.outreach ? (
            <p className="mt-4 rounded-md border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-200">
              Outreach sent.
            </p>
          ) : null}
          <form
            action={sendProfileOutreachAction.bind(null, id)}
            className="mt-5"
          >
            <label className="text-sm font-medium text-slate-200">
              Message
              <textarea
                name="body"
                rows={4}
                required
                className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
              />
            </label>
            <button
              type="submit"
              className="mt-4 rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-300"
            >
              Send outreach
            </button>
          </form>
        </section>
      ) : null}

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
