import Link from "next/link";
import { forbidden } from "next/navigation";

import { Role } from "../../../../../generated/prisma";
import { getServerCaller } from "~/server/api/caller";
import { auth } from "~/server/auth";
import { banUserAction } from "../users/actions";
import { removeProjectAction } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function ReportsPage() {
  const session = await auth();
  if (session?.user.role !== Role.ADMIN) forbidden();
  const reports = await (await getServerCaller()).moderation.listReports();

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-14">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Reports
          </h1>
          <p className="mt-2 text-slate-400">
            Reported content remains public until you act.
          </p>
        </div>
        <Link href="/admin/users" className="text-sky-300 hover:text-sky-200">
          All users
        </Link>
      </div>

      {reports.length ? (
        <div className="mt-8 space-y-4">
          {reports.map((report) => {
            const offendingUser = report.project?.user ?? report.reportedUser;
            return (
              <article
                key={report.id}
                className="rounded-xl border border-slate-800 bg-slate-900 p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">
                      {report.project ? (
                        <Link
                          href={`/projects/${report.project.id}`}
                          className="hover:text-sky-300"
                        >
                          Project: {report.project.title}
                        </Link>
                      ) : report.reportedUser ? (
                        <Link
                          href={`/${report.reportedUser.username}`}
                          className="hover:text-sky-300"
                        >
                          Profile: @{report.reportedUser.username}
                        </Link>
                      ) : (
                        "Removed target"
                      )}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      Reported by @{report.reporter.username} ·{" "}
                      {dateFormatter.format(report.createdAt)}
                    </p>
                    <p className="mt-4 whitespace-pre-wrap text-slate-300">
                      {report.reason ?? "No reason supplied."}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    {report.project ? (
                      <form
                        action={removeProjectAction.bind(
                          null,
                          report.project.id,
                        )}
                      >
                        <button className="rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600">
                          Remove project
                        </button>
                      </form>
                    ) : null}
                    {offendingUser &&
                    !offendingUser.banned &&
                    offendingUser.id !== session.user.id ? (
                      <form
                        action={banUserAction.bind(
                          null,
                          offendingUser.id,
                          "/admin/reports",
                        )}
                      >
                        <button className="rounded-md border border-red-700 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-950">
                          Ban user
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-10 rounded-xl border border-dashed border-slate-700 px-6 py-14 text-center text-slate-400">
          No reports yet.
        </p>
      )}
    </section>
  );
}
