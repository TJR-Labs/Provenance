import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms Draft | Provenance",
  description:
    "A draft outline of placeholder topics awaiting legal review for Provenance.",
};

const sections = [
  {
    heading: "Accounts & Access",
    body: "[Placeholder — describe account eligibility, access, credentials, and account responsibilities here]",
  },
  {
    heading: "Acceptable Use",
    body: "[Placeholder — describe permitted and prohibited use of the public portfolio platform here]",
  },
  {
    heading: "Intellectual Property in Projects",
    body: "[Placeholder — describe ownership and permitted handling of work shared through Provenance here]",
  },
  {
    heading: "Termination",
    body: "[Placeholder — describe account suspension, termination, and related data handling here]",
  },
] as const;

export default function TermsPage() {
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
          Terms — Draft Outline
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
