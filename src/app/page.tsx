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
        <p className="text-brass font-mono text-xs tracking-[0.14em] uppercase">
          Discovery
        </p>
        <h1 className="font-display text-ink mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Discover what people are building
        </h1>
        <p className="text-muted mt-4 text-lg leading-8">
          Explore software, art, hardware, writing, and everything in between.
        </p>
      </div>

      <form className="border-line bg-surface mt-10 grid gap-4 rounded-lg border p-5 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-ink text-sm font-medium">
          Category
          <select
            name="category"
            defaultValue={category ?? ""}
            className="border-line-strong bg-canvas text-ink mt-2 block w-full rounded-md border px-3 py-2"
          >
            <option value="">All categories</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {categoryLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-ink text-sm font-medium">
          Hashtag
          <input
            name="hashtag"
            defaultValue={hashtag}
            placeholder="robotics"
            className="border-line-strong bg-canvas text-ink placeholder:text-faint focus:border-accent mt-2 block w-full rounded-md border px-3 py-2"
          />
        </label>
        <button className="bg-accent text-on-accent hover:bg-accent-strong self-end rounded-md px-5 py-2 font-semibold transition-colors">
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
        <div className="border-line-strong mt-12 rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="text-faint font-mono text-xs tracking-[0.14em] uppercase">
            No matching records
          </p>
          <p className="text-muted mt-3">
            No projects match these filters yet.
          </p>
        </div>
      )}
    </section>
  );
}
