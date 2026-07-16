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
      <h1 className="text-3xl font-bold tracking-tight text-white">Users</h1>
      <p className="mt-2 text-slate-400">
        Review accounts and deactivate abusive users.
      </p>
      <div className="mt-8 overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-300">
            <tr>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3 text-white">{user.username}</td>
                <td className="px-4 py-3 text-slate-300">{user.role}</td>
                <td className="px-4 py-3 text-slate-400">
                  {dateFormatter.format(user.createdAt)}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {user.banned ? "Banned" : "Active"}
                </td>
                <td className="px-4 py-3">
                  {!user.banned && user.id !== session.user.id ? (
                    <form
                      action={banUserAction.bind(null, user.id, "/admin/users")}
                    >
                      <button className="text-red-300 hover:text-red-200">
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
