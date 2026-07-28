"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ProjectStatus, type Category } from "../../../../generated/prisma";
import { projectStatusLabels } from "~/lib/project-status";
import { categoryLabels } from "~/server/categories";
import { api } from "~/trpc/react";

type ManagedProject = {
  id: string;
  title: string;
  status: ProjectStatus;
  category: Category;
};

const statusClasses: Record<ProjectStatus, string> = {
  [ProjectStatus.BUILDING]: "border-accent text-accent",
  [ProjectStatus.ARCHIVED]: "border-line-strong text-faint",
  [ProjectStatus.SHIPPED]: "border-[#6e9e6b] text-[#6e9e6b]",
  [ProjectStatus.IDEA]: "border-[#c9a227] text-[#c9a227]",
};

function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`bg-canvas flex h-[22px] items-center gap-1.5 rounded-md border px-2 font-mono text-[11px] tracking-[0.14em] ${statusClasses[status]}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {projectStatusLabels[status].toUpperCase()}
    </span>
  );
}

export function ProjectsFlyoutTrigger({
  projects,
}: {
  projects: ManagedProject[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showImportNote, setShowImportNote] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-muted hover:text-ink rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
      >
        Manage projects
      </button>

      {isOpen ? (
        <>
          <button
            type="button"
            aria-label="Close projects panel"
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <aside
            data-theme="dark"
            role="dialog"
            aria-modal="true"
            aria-labelledby="projects-flyout-title"
            className="border-line bg-surface fixed inset-y-0 right-0 z-50 flex w-[388px] flex-col gap-4.5 border-l p-6 shadow-[-18px_0_44px_rgba(0,0,0,0.62)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="projects-flyout-title"
                  className="text-ink text-xl font-semibold"
                >
                  Projects
                </h2>
                <p className="text-muted mt-1 font-mono text-[11px] tracking-[0.14em] uppercase">
                  Manage · Visibility · Editor
                </p>
              </div>
              <button
                type="button"
                aria-label="Close projects panel"
                onClick={() => setIsOpen(false)}
                className="text-muted hover:text-ink rounded-md p-1 text-xl leading-none transition-colors"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {projects.length > 0 ? (
                <ul className="flex flex-col gap-2.5">
                  {projects.map((project) => (
                    <li
                      key={project.id}
                      className="border-line flex items-center gap-3 border-b pb-2.5"
                    >
                      <span
                        aria-hidden="true"
                        className="bg-raised size-11 shrink-0 rounded-md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-ink truncate text-sm font-semibold">
                          {project.title}
                        </p>
                        <p className="text-muted mt-0.5 truncate text-xs">
                          {categoryLabels[project.category]}
                        </p>
                      </div>
                      <ProjectStatusBadge status={project.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted text-sm">No projects yet.</p>
              )}
            </div>

            <div className="border-line flex flex-col gap-2.5 border-t pt-4">
              <Link
                href="/projects/new"
                className="bg-accent text-on-accent hover:bg-accent-strong rounded-md px-3 py-2 text-center text-sm font-semibold transition-colors"
              >
                New project
              </Link>
              <button
                type="button"
                onClick={() => setShowImportNote(true)}
                className="border-line-strong text-ink hover:text-accent rounded-md border bg-[#2d2d29] px-3 py-2 text-sm font-medium transition-colors"
              >
                Import from GitHub or URL
              </button>
              {showImportNote ? (
                <p className="text-muted text-xs">
                  Coming soon — imports aren&apos;t wired up yet.
                </p>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}

export function DevlogQuickAdd() {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const createEntry = api.devlog.create.useMutation();

  function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createEntry.mutate(
      { label, body },
      {
        onSuccess: () => {
          setLabel("");
          setBody("");
          setIsExpanded(false);
          router.refresh();
        },
      },
    );
  }

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="text-accent hover:text-accent-strong self-start text-sm font-medium transition-colors"
      >
        + Add entry
      </button>
    );
  }

  return (
    <form onSubmit={submitEntry} className="flex flex-col gap-2.5">
      <label htmlFor="devlog-label" className="sr-only">
        Entry label
      </label>
      <input
        id="devlog-label"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        maxLength={20}
        placeholder="V0.4 or NOTE"
        required
        className="border-line-strong bg-canvas text-ink placeholder:text-faint focus:border-accent rounded-md border px-3 py-2 text-sm outline-none"
      />
      <label htmlFor="devlog-body" className="sr-only">
        Entry body
      </label>
      <textarea
        id="devlog-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={500}
        placeholder="What's new?"
        required
        rows={3}
        className="border-line-strong bg-canvas text-ink placeholder:text-faint focus:border-accent resize-none rounded-md border px-3 py-2 text-sm outline-none"
      />
      <button
        type="submit"
        disabled={createEntry.isPending}
        className="bg-accent text-on-accent hover:bg-accent-strong self-start rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {createEntry.isPending ? "Adding…" : "Add entry"}
      </button>
      {createEntry.isError ? (
        <p role="alert" className="text-danger text-xs">
          Could not add the entry. Please try again.
        </p>
      ) : null}
    </form>
  );
}
