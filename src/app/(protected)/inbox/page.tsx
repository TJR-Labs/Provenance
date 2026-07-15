import { forbidden } from "next/navigation";

import { Role } from "../../../../generated/prisma";
import { getServerCaller } from "~/server/api/caller";
import { auth } from "~/server/auth";
import { InboxReadMarker } from "./read-marker";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function InboxPage() {
  const session = await auth();
  if (session?.user.role !== Role.ENGINEER) {
    forbidden();
  }

  const caller = await getServerCaller();
  const messages = await caller.message.inbox();

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-16">
      <InboxReadMarker />
      <h1 className="text-3xl font-bold tracking-tight text-white">Inbox</h1>
      <p className="mt-2 text-slate-400">
        Outreach from companies that discovered your work.
      </p>

      {messages.length ? (
        <div className="mt-10 space-y-5">
          {messages.map((message) => {
            const unread = message.readAt === null;
            return (
              <article
                key={message.id}
                className={`rounded-xl border p-6 ${
                  unread
                    ? "border-sky-700 bg-sky-950/30"
                    : "border-slate-800 bg-slate-900"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="font-semibold text-white">
                    {message.fromCompany.displayName}
                    {unread ? (
                      <span className="ml-2 rounded-full bg-sky-400 px-2 py-0.5 text-xs font-bold text-slate-950">
                        Unread
                      </span>
                    ) : null}
                  </h2>
                  <time className="text-sm text-slate-500">
                    {dateFormatter.format(message.createdAt)}
                  </time>
                </div>
                {message.brief ? (
                  <p className="mt-2 text-sm text-slate-400">
                    Related brief: {message.brief.title}
                  </p>
                ) : null}
                <p className="mt-4 leading-7 whitespace-pre-wrap text-slate-200">
                  {message.body}
                </p>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-10 rounded-xl border border-dashed border-slate-700 px-6 py-14 text-center">
          <h2 className="text-lg font-semibold text-white">No messages yet</h2>
          <p className="mt-2 text-slate-400">
            Company outreach will appear here when your work gets noticed.
          </p>
        </div>
      )}
    </section>
  );
}
