import { Category } from "../../generated/prisma";
import { ProjectCard } from "~/app/project-card";
import { getServerCaller } from "~/server/api/caller";
import { categories, categoryLabels } from "~/server/categories";

type HomeProps = {
  searchParams: Promise<{ category?: string; hashtag?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const category = Object.values(Category).find(
    (value) => value === params.category,
  );
  const hashtag = params.hashtag?.trim();
  const projects = await (
    await getServerCaller()
  ).discovery.list({
    category,
    hashtag,
  });

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-14">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Discover what people are building
        </h1>
        <p className="mt-4 text-lg leading-8 text-slate-300">
          Explore software, art, hardware, writing, and everything in between.
        </p>
      </div>

      <form className="mt-10 grid gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-medium text-slate-200">
          Category
          <select
            name="category"
            defaultValue={category ?? ""}
            className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            <option value="">All categories</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {categoryLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-200">
          Hashtag
          <input
            name="hashtag"
            defaultValue={hashtag}
            placeholder="robotics"
            className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
        </label>
        <button className="self-end rounded-md bg-sky-400 px-5 py-2 font-semibold text-slate-950 hover:bg-sky-300">
          Filter
        </button>
      </form>

      {projects.length ? (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <p className="mt-12 rounded-xl border border-dashed border-slate-700 px-6 py-14 text-center text-slate-400">
          No projects match these filters yet.
        </p>
      )}
    </section>
  );
}
