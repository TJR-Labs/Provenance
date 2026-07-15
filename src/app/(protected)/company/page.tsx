import { forbidden } from "next/navigation";
import Link from "next/link";

import { Role } from "../../../../generated/prisma";
import { getServerCaller } from "~/server/api/caller";
import { auth } from "~/server/auth";
import { formatBriefDomain } from "../briefs/brief-labels";
import { BriefStatusActions } from "./brief-status-actions";

type CompanyPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

export default async function CompanyPage({ searchParams }: CompanyPageProps) {
  const session = await auth();
  if (session?.user.role !== Role.COMPANY) {
    forbidden();
  }

  const [briefs, params] = await Promise.all([
    (await getServerCaller()).brief.listMine(),
    searchParams,
  ]);

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Company briefs
          </h1>
          <p className="mt-2 text-slate-400">
            Post and manage your company&apos;s project briefs.
          </p>
        </div>
        <Link
          href="/briefs/new"
          className="inline-flex w-fit rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-300"
        >
          Post a brief
        </Link>
      </div>

      {params.error ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200"
        >
          {params.error}
        </p>
      ) : null}
      {params.success ? (
        <p className="mt-6 rounded-md border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-200">
          Brief updated successfully.
        </p>
      ) : null}

      {briefs.length ? (
        <div className="mt-10 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-300">
              <tr>
                <th className="px-4 py-3 font-medium">Brief</th>
                <th className="px-4 py-3 font-medium">Domain</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Submissions</th>
                <th className="px-4 py-3 font-medium">Posted</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {briefs.map((brief) => (
                <tr key={brief.id}>
                  <td className="px-4 py-4">
                    <Link
                      href={`/briefs/${brief.id}`}
                      className="font-medium text-white hover:text-sky-300"
                    >
                      {brief.title}
                    </Link>
                    <p className="mt-1 max-w-xl text-slate-400">
                      {brief.summary}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-slate-300">
                    {formatBriefDomain(brief.domain)}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        brief.status === "OPEN"
                          ? "bg-emerald-950 text-emerald-200"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {brief.status === "OPEN" ? "Open" : "Closed"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-300">
                    {brief._count.submissions}
                  </td>
                  <td className="px-4 py-4 text-slate-400">
                    {dateFormatter.format(brief.createdAt)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-4">
                      <Link
                        href={`/briefs/${brief.id}/edit`}
                        className="text-sm font-semibold text-sky-300 hover:text-sky-200"
                      >
                        Edit
                      </Link>
                      <BriefStatusActions id={brief.id} status={brief.status} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-10 rounded-xl border border-dashed border-slate-700 px-6 py-14 text-center">
          <h2 className="text-lg font-semibold text-white">No briefs yet</h2>
          <p className="mt-2 text-slate-400">
            Post your first scoped project to make it available to engineers.
          </p>
          <Link
            href="/briefs/new"
            className="mt-5 inline-flex text-sm font-semibold text-sky-300 hover:text-sky-200"
          >
            Post your first brief
          </Link>
        </div>
      )}
    </section>
  );
}
