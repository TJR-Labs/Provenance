export default function Loading() {
  return (
    <section
      role="status"
      className="mx-auto w-full max-w-6xl flex-1 px-6 py-14"
    >
      <span className="sr-only">Loading</span>
      <div
        aria-hidden="true"
        className="animate-pulse motion-reduce:animate-none"
      >
        <div className="bg-raised h-4 w-32 rounded" />
        <div className="bg-raised mt-5 h-10 w-2/3 max-w-xl rounded" />
        <div className="bg-raised mt-4 h-5 w-1/2 max-w-md rounded" />
        <div className="border-line bg-surface mt-10 h-28 rounded-lg border" />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
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
