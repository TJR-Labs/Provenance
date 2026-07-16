import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Draft | Provenance",
  description:
    "A draft outline of placeholder privacy topics awaiting legal review for Provenance.",
};

const sections = [
  {
    heading: "What We Collect",
    body: "[Placeholder — describe account data, public portfolio projects, uploaded media, and reports collected by Provenance here]",
  },
  {
    heading: "How We Use It",
    body: "[Placeholder — describe how account and project data support the public portfolio and discovery platform here]",
  },
  {
    heading: "Where Data Is Stored",
    body: "[Placeholder — describe storage of Provenance data in Supabase-hosted Postgres and Storage here]",
  },
  {
    heading: "Your Rights",
    body: "[Placeholder — describe data access, correction, and deletion topics and request processes here]",
  },
] as const;

export default function PrivacyPage() {
  return (
    <section className="flex flex-1 px-6 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-3xl">
        <div
          role="status"
          className="rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200"
        >
          Draft — pending legal review, not yet reviewed by counsel
        </div>
        <h1 className="mt-8 text-4xl font-bold tracking-tight text-white">
          Privacy — Draft Outline
        </h1>
        <div className="mt-10 space-y-10">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                {section.heading}
              </h2>
              <p className="mt-3 leading-7 text-slate-300">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
