import { forbidden } from "next/navigation";

import { Role } from "../../../../../generated/prisma";
import { getServerCaller } from "~/server/api/caller";
import { auth } from "~/server/auth";

import { createUserAction } from "./actions";

type UsersPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const session = await auth();
  if (session?.user.role !== Role.ADMIN) {
    forbidden();
  }

  const [users, params] = await Promise.all([
    (await getServerCaller()).users.list(),
    searchParams,
  ]);

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-white">Users</h1>
      <p className="mt-2 text-slate-400">
        Provision and review controlled-distribution accounts.
      </p>

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
          User created successfully.
        </p>
      ) : null}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-300">
              <tr>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Display name</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3 text-white">{user.username}</td>
                  <td className="px-4 py-3 text-slate-300">{user.role}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {user.displayName}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {dateFormatter.format(user.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form
          action={createUserAction}
          className="h-fit space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-6"
        >
          <h2 className="text-xl font-semibold text-white">Create user</h2>
          <label className="block text-sm font-medium text-slate-200">
            Username
            <input
              name="username"
              required
              autoComplete="off"
              className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Display name
            <input
              name="displayName"
              required
              autoComplete="off"
              className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Role
            <select
              name="role"
              required
              defaultValue={Role.ENGINEER}
              className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            >
              {Object.values(Role).map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Company name (required for COMPANY)
            <input
              name="companyName"
              autoComplete="organization"
              className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Initial password
            <input
              name="password"
              type="password"
              required
              autoComplete="new-password"
              className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-300"
          >
            Create user
          </button>
        </form>
      </div>
    </section>
  );
}
