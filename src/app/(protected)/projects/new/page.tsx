import { categories, categoryLabels } from "~/server/categories";
import { saveProjectAction } from "../actions";
import { ProjectForm } from "../project-form";

type NewProjectPageProps = { searchParams: Promise<{ error?: string }> };

export default async function NewProjectPage({
  searchParams,
}: NewProjectPageProps) {
  const { error } = await searchParams;
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-14">
      <h1 className="text-3xl font-bold tracking-tight text-white">
        New project
      </h1>
      <p className="mt-2 text-slate-400">
        Share what you made and how you made it.
      </p>
      <ProjectForm
        action={saveProjectAction.bind(null, null)}
        categories={categories.map((value) => ({
          value,
          label: categoryLabels[value],
        }))}
        error={error}
      />
    </section>
  );
}
