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
        <p className="text-danger font-mono text-sm tracking-[0.2em] uppercase">
          Error
        </p>
        <h1 className="font-display text-ink mt-4 text-4xl font-semibold tracking-tight">
          Something went wrong.
        </h1>
        <button
          type="button"
          onClick={reset}
          className="bg-accent text-on-accent hover:bg-accent-strong mt-8 inline-flex rounded-md px-4 py-2 font-semibold transition-colors"
        >
          Try again
        </button>
      </div>
    </section>
  );
}
