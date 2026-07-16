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
          className="border-warning-line bg-warning-surface text-warning rounded-md border px-4 py-3 text-sm font-semibold"
        >
          Draft — pending legal review, not yet reviewed by counsel
        </div>
        <h1 className="font-display text-ink mt-8 text-4xl font-semibold tracking-tight">
          Privacy — Draft Outline
        </h1>
        <div className="mt-10 space-y-10">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-ink text-2xl font-semibold tracking-tight">
                {section.heading}
              </h2>
              <p className="text-muted mt-3 leading-7">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
