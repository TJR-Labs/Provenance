import { forbidden } from "next/navigation";
import Link from "next/link";

import { Role } from "../../../../generated/prisma";
import { getServerCaller } from "~/server/api/caller";
import { auth } from "~/server/auth";
import { sendScoutOutreachAction } from "./actions";

type ScoutPageProps = {
  searchParams: Promise<{ error?: string; outreach?: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

export default async function ScoutPage({ searchParams }: ScoutPageProps) {
  const session = await auth();
  if (session?.user.role !== Role.COMPANY) {
    forbidden();
  }

  const caller = await getServerCaller();
  const [submissions, sentMessages, query] = await Promise.all([
    caller.message.scout(),
    caller.message.sent(),
    searchParams,
  ]);

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-white">
        Scout engineers
      </h1>
      <p className="mt-2 text-slate-400">
        Compare every submission across your company&apos;s briefs and contact
        the engineers whose work stands out.
      </p>

      {query.error ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200"
        >
          {query.error}
        </p>
      ) : null}
      {query.outreach ? (
        <p className="mt-6 rounded-md border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-200">
          Outreach sent.
        </p>
      ) : null}

      {submissions.length ? (
        <div className="mt-10 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-300">
              <tr>
                <th className="px-4 py-3 font-medium">Engineer</th>
                <th className="px-4 py-3 font-medium">Brief</th>
                <th className="px-4 py-3 font-medium">Weighted score</th>
                <th className="px-4 py-3 font-medium">Repository</th>
                <th className="min-w-72 px-4 py-3 font-medium">Reach out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {submissions.map((submission) => (
                <tr key={submission.id} className="align-top">
                  <td className="px-4 py-4">
                    <Link
                      href={`/engineers/${submission.engineerId}`}
                      className="font-medium text-white hover:text-sky-300"
                    >
                      {submission.engineer.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-slate-300">
                    {submission.brief.title}
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-200">
                    {submission.percentage === null
                      ? "unscored"
                      : `${submission.percentage.toFixed(1)}%`}
                  </td>
                  <td className="px-4 py-4">
                    <a
                      href={submission.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-sky-300 hover:text-sky-200"
                    >
                      Repository
                    </a>
                  </td>
                  <td className="px-4 py-4">
                    <form action={sendScoutOutreachAction}>
                      <input
                        type="hidden"
                        name="toEngineerId"
                        value={submission.engineerId}
                      />
                      <input
                        type="hidden"
                        name="briefId"
                        value={submission.brief.id}
                      />
                      <label
                        className="sr-only"
                        htmlFor={`body-${submission.id}`}
                      >
                        Message {submission.engineer.displayName}
                      </label>
                      <textarea
                        id={`body-${submission.id}`}
                        name="body"
                        rows={3}
                        required
                        className="block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                      />
                      <button
                        type="submit"
                        className="mt-2 rounded-md bg-sky-400 px-3 py-2 font-semibold text-slate-950 hover:bg-sky-300"
                      >
                        Reach out
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-10 rounded-xl border border-dashed border-slate-700 px-6 py-14 text-center">
          <h2 className="text-lg font-semibold text-white">
            No submissions to scout
          </h2>
          <p className="mt-2 text-slate-400">
            Submissions to your company&apos;s briefs will appear here.
          </p>
        </div>
      )}

      <section className="mt-14 border-t border-slate-800 pt-10">
        <h2 className="text-2xl font-semibold text-white">Sent messages</h2>
        <p className="mt-2 text-sm text-slate-400">
          Review prior outreach before contacting an engineer again.
        </p>

        {sentMessages.length ? (
          <div className="mt-6 space-y-4">
            {sentMessages.map((message) => (
              <article
                key={message.id}
                className="rounded-xl border border-slate-800 bg-slate-900 p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="font-semibold text-white">
                    <Link
                      href={`/engineers/${message.toEngineer.id}`}
                      className="hover:text-sky-300"
                    >
                      {message.toEngineer.displayName}
                    </Link>
                    <span className="font-normal text-slate-400">
                      {" "}
                      &middot; {message.brief?.title ?? "No related brief"}
                    </span>
                  </p>
                  <time className="text-sm text-slate-500">
                    {dateFormatter.format(message.createdAt)}
                  </time>
                </div>
                <p className="mt-3 leading-7 whitespace-pre-wrap text-slate-300">
                  {message.body}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-xl border border-dashed border-slate-700 px-6 py-10 text-center text-slate-400">
            No outreach sent yet.
          </p>
        )}
      </section>
    </section>
  );
}
