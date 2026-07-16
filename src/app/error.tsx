"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(error, ...(error.digest ? [`Digest: ${error.digest}`] : []));

  return (
    <section className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="text-center">
        <p className="text-sm font-semibold tracking-[0.2em] text-sky-400 uppercase">
          Error
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-white">
          Something went wrong.
        </h1>
        <button
          type="button"
          onClick={reset}
          className="mt-8 inline-flex rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-300"
        >
          Try again
        </button>
      </div>
    </section>
  );
}
