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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
            Reports
          </h1>
          <p className="text-muted mt-2">
            Reported content remains public until you act.
          </p>
        </div>
        <Link
          href="/admin/users"
          className="text-accent hover:text-accent-strong font-medium transition-colors"
        >
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
                className="border-line bg-surface rounded-lg border p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-display text-ink font-semibold break-words">
                      {report.project ? (
                        <Link
                          href={`/projects/${report.project.id}`}
                          className="hover:text-accent transition-colors"
                        >
                          Project: {report.project.title}
                        </Link>
                      ) : report.reportedUser ? (
                        <Link
                          href={`/${report.reportedUser.username}`}
                          className="hover:text-accent transition-colors"
                        >
                          Profile: @{report.reportedUser.username}
                        </Link>
                      ) : (
                        "Removed target"
                      )}
                    </p>
                    <p className="text-faint mt-1 font-mono text-xs break-words">
                      Reported by @{report.reporter.username} ·{" "}
                      {dateFormatter.format(report.createdAt)}
                    </p>
                    <p className="text-muted mt-4 break-words whitespace-pre-wrap">
                      {report.reason ?? "No reason supplied."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {report.project ? (
                      <form
                        action={removeProjectAction.bind(
                          null,
                          report.project.id,
                        )}
                      >
                        <button className="bg-danger-solid text-on-danger hover:bg-danger-hover rounded-md px-3 py-2 text-sm font-semibold transition-colors">
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
                        <button className="border-danger-line text-danger hover:bg-danger-surface rounded-md border px-3 py-2 text-sm font-semibold transition-colors">
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
        <div className="border-line-strong mt-10 rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
            Nothing on file
          </p>
          <p className="text-muted mt-3">No reports yet.</p>
        </div>
      )}
    </section>
  );
}
