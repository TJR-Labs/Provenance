export default function Loading() {
  return (
    <section
      role="status"
      className="mx-auto w-full max-w-6xl flex-1 px-6 py-14"
    >
      <span className="sr-only">Loading profile</span>
      <div
        aria-hidden="true"
        className="animate-pulse motion-reduce:animate-none"
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="bg-raised h-28 w-28 rounded-full" />
          <div>
            <div className="bg-raised h-9 w-56 rounded" />
            <div className="bg-raised mt-3 h-4 w-40 rounded" />
          </div>
        </div>
        <div className="bg-raised mt-12 h-6 w-32 rounded" />
        <div className="bg-raised mt-4 h-4 w-full max-w-2xl rounded" />
        <div className="bg-raised mt-2 h-4 w-2/3 max-w-xl rounded" />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="border-line bg-surface h-72 rounded-lg border"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
