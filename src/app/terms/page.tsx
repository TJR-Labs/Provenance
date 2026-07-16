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
          className="rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200"
        >
          Draft — pending legal review, not yet reviewed by counsel
        </div>
        <h1 className="mt-8 text-4xl font-bold tracking-tight text-white">
          Terms — Draft Outline
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
