export default function Loading() {
  return (
    <section
      role="status"
      className="mx-auto w-full max-w-3xl flex-1 px-6 py-14"
    >
      <span className="sr-only">Loading</span>
      <div
        aria-hidden="true"
        className="animate-pulse motion-reduce:animate-none"
      >
        <div className="bg-raised h-9 w-52 rounded" />
        <div className="bg-raised mt-3 h-4 w-72 max-w-full rounded" />
        <div className="border-line bg-surface mt-8 h-96 rounded-lg border" />
      </div>
    </section>
  );
}
