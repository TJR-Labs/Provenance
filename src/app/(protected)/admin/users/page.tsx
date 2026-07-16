import { forbidden } from "next/navigation";

import { Role } from "../../../../../generated/prisma";
import { getServerCaller } from "~/server/api/caller";
import { auth } from "~/server/auth";
import { banUserAction } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function UsersPage() {
  const session = await auth();
  if (session?.user.role !== Role.ADMIN) forbidden();
  const users = await (await getServerCaller()).users.list();

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-14">
      <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
        Users
      </h1>
      <p className="text-muted mt-2">
        Review accounts and deactivate abusive users.
      </p>
      <div className="border-line bg-surface mt-8 overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-raised text-muted font-mono text-xs tracking-[0.14em] uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Username</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="text-ink max-w-56 truncate px-4 py-3 font-medium">
                  {user.username}
                </td>
                <td className="text-muted px-4 py-3 font-mono text-xs uppercase">
                  {user.role}
                </td>
                <td className="text-faint px-4 py-3 font-mono text-xs">
                  {dateFormatter.format(user.createdAt)}
                </td>
                <td className="text-muted px-4 py-3">
                  {user.banned ? "Banned" : "Active"}
                </td>
                <td className="px-4 py-3">
                  {!user.banned && user.id !== session.user.id ? (
                    <form
                      action={banUserAction.bind(null, user.id, "/admin/users")}
                    >
                      <button className="text-danger font-medium underline-offset-4 hover:underline">
                        Ban user
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
