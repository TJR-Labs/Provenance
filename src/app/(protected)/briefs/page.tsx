import Link from "next/link";

import { BriefDomain } from "../../../../generated/prisma";
import { getServerCaller } from "~/server/api/caller";
import { formatBriefDomain } from "./brief-labels";

type BriefsPageProps = {
  searchParams: Promise<{ domain?: string | string[] }>;
};

const domains = Object.values(BriefDomain);

export default async function BriefsPage({ searchParams }: BriefsPageProps) {
  const params = await searchParams;
  const requestedDomain =
    typeof params.domain === "string" ? params.domain : undefined;
  const domain = domains.find((value) => value === requestedDomain);
  const briefs = await (
    await getServerCaller()
  ).brief.listOpen(domain ? { domain } : undefined);

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Open briefs
          </h1>
          <p className="mt-2 text-slate-400">
            Find scoped, real-world projects across engineering domains.
          </p>
        </div>

        <form action="/briefs" method="get" className="flex items-end gap-3">
          <label className="text-sm font-medium text-slate-200">
            Domain
            <select
              name="domain"
              defaultValue={domain ?? ""}
              className="mt-2 block rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            >
              <option value="">All domains</option>
              {domains.map((value) => (
                <option key={value} value={value}>
                  {formatBriefDomain(value)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            Filter
          </button>
        </form>
      </div>

      {briefs.length ? (
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {briefs.map((brief) => (
            <article
              key={brief.id}
              className="rounded-xl border border-slate-800 bg-slate-900 p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-xl font-semibold text-white">
                  <Link
                    href={`/briefs/${brief.id}`}
                    className="hover:text-sky-300"
                  >
                    {brief.title}
                  </Link>
                </h2>
                <span className="shrink-0 rounded-full bg-sky-950 px-3 py-1 text-xs font-medium text-sky-200">
                  {formatBriefDomain(brief.domain)}
                </span>
              </div>
              <p className="mt-3 leading-7 text-slate-300">{brief.summary}</p>
              <p className="mt-5 text-sm text-slate-400">
                {brief.company.displayName}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-xl border border-dashed border-slate-700 px-6 py-14 text-center">
          <h2 className="text-lg font-semibold text-white">
            No open briefs found
          </h2>
          <p className="mt-2 text-slate-400">
            {domain
              ? "Try another domain or view all open briefs."
              : "Companies have not posted any open briefs yet."}
          </p>
          {domain ? (
            <Link
              href="/briefs"
              className="mt-5 inline-flex text-sm font-semibold text-sky-300 hover:text-sky-200"
            >
              View all open briefs
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
