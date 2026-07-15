import { TRPCError } from "@trpc/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";
import { formatBriefDomain } from "../brief-labels";

type BriefPageProps = {
  params: Promise<{ id: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
});

export default async function BriefPage({ params }: BriefPageProps) {
  const { id } = await params;
  let brief;

  try {
    brief = await (await getServerCaller()).brief.getById({ id });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

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
    </article>
  );
}
