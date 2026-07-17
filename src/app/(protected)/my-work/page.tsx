import Link from "next/link";

import { getServerCaller } from "~/server/api/caller";

export default async function MyWorkPage() {
  const projects = await (await getServerCaller()).project.listMine();

  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-ink text-3xl font-semibold tracking-tight">
            My Work
          </h1>
          <p className="text-muted mt-2">
            Every project you&apos;ve created, in one place.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-4 py-2.5 font-semibold transition-colors"
        >
          Add project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="border-line-strong mt-10 rounded-lg border border-dashed px-6 py-14 text-center">
          <p className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
            No records yet
          </p>
          <p className="profile-muted text-muted mt-3">No projects yet.</p>
          <Link
            href="/projects/new"
            className="text-accent hover:text-accent-strong mt-4 inline-block text-sm font-semibold transition-colors"
          >
            Add your first project →
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}/edit`}
                className="border-line bg-surface hover:border-line-strong flex items-center gap-4 rounded-lg border p-4 transition-colors"
              >
                {project.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={project.thumbnailUrl}
                    alt=""
                    className="bg-raised h-14 w-14 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="bg-raised text-faint flex h-14 w-14 shrink-0 items-center justify-center rounded font-mono text-[10px] uppercase">
                    PR
                  </span>
                )}
                <span className="text-ink min-w-0 flex-1 truncate font-medium">
                  {project.title}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-wide uppercase ${
                    project.placed
                      ? "bg-raised text-muted"
                      : "bg-accent text-on-accent"
                  }`}
                >
                  {project.placed ? "Placed" : "Unplaced"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
