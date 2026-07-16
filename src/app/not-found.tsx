import Link from "next/link";

export default function NotFound() {
  return (
    <section className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="text-center">
        <p className="text-brass font-mono text-sm tracking-[0.2em] uppercase">
          404
        </p>
        <h1 className="font-display text-ink mt-4 text-4xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="text-muted mt-4">
          The page you requested does not exist.
        </p>
        <Link
          href="/"
          className="bg-accent text-on-accent hover:bg-accent-strong mt-8 inline-flex rounded-md px-4 py-2 font-semibold transition-colors"
        >
          Return home
        </Link>
      </div>
    </section>
  );
}
