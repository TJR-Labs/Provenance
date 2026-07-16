export default function Loading() {
  return (
    <article
      role="status"
      className="mx-auto w-full max-w-5xl flex-1 px-6 py-14"
    >
      <span className="sr-only">Loading project</span>
      <div
        aria-hidden="true"
        className="animate-pulse motion-reduce:animate-none"
      >
        <div className="bg-raised h-4 w-28 rounded" />
        <div className="bg-raised mt-4 h-11 w-3/4 max-w-2xl rounded" />
        <div className="bg-raised mt-4 h-4 w-44 rounded" />
        <div className="mt-10 space-y-3">
          <div className="bg-raised h-5 w-full rounded" />
          <div className="bg-raised h-5 w-11/12 rounded" />
          <div className="bg-raised h-5 w-2/3 rounded" />
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="border-line bg-surface h-56 rounded-lg border"
            />
          ))}
        </div>
      </div>
    </article>
  );
}
