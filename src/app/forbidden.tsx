import Link from "next/link";

export default function Forbidden() {
  return (
    <section className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="text-center">
        <p className="text-sm font-semibold tracking-[0.2em] text-amber-400 uppercase">
          403
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-white">
          Access denied
        </h1>
        <p className="mt-4 text-slate-300">
          You do not have permission to view this page.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-300"
        >
          Return home
        </Link>
      </div>
    </section>
  );
}
