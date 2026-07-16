# Legal Pages — Spec

## Objective
Provenance stores account data, private messages, and submitted work for its
users but has no Terms of Service or Privacy Policy anywhere in the app. This
spec adds the page structure and routing for both, with clearly-marked
placeholder copy — not real legal language, which needs an actual lawyer's
review before this app handles real users. Success: `/terms` and `/privacy`
exist, are linked from the footer, and are obviously marked as drafts pending
legal review so nobody mistakes the placeholder for reviewed copy.

## Requirements
Must-have:
1. `/terms` and `/privacy` pages (public, no auth required — reachable from
   both signed-in and signed-out states), using the shared layout.
2. Each page has a visible "Draft — pending legal review, not yet reviewed by
   counsel" notice at the top (not just an HTML comment — an actual on-page
   banner), followed by placeholder section headings appropriate to what
   Provenance actually does (per spec 01/02: accounts, stored submissions/
   messages, admin-provisioned access, Supabase-hosted data) so a lawyer has a
   concrete starting outline rather than lorem ipsum: e.g. for Terms —
   "Accounts & Access", "Acceptable Use", "Intellectual Property in
   Submissions", "Termination"; for Privacy — "What We Collect", "How We Use
   It", "Where Data Is Stored" (Supabase/Postgres), "Your Rights".
3. Footer (shared layout) links to both pages.
4. Placeholder body copy under each heading is explicitly bracketed as a
   to-do, e.g. `[Placeholder — describe X here]`, so it's unmistakable in a
   code review or on the rendered page that this isn't final copy.

Deferred: actual legal content (requires a lawyer, not this spec), cookie
consent banner, GDPR/CCPA-specific mechanisms — none of that can be
meaningfully built until real legal copy exists to implement against.

## Constraints
- No new dependency — static content in the existing App Router page pattern.
- Must not imply these are reviewed/binding terms anywhere in the copy or
  metadata (no misleading a real user who stumbles onto the page before
  launch).

## Edge Cases
- Signed-out visitor reaches `/terms` or `/privacy` directly → renders
  normally (these are intentionally public, unlike the `(protected)` routes).
- Page title/meta description shouldn't claim finalized terms (avoid text like
  "Effective Date" until real content exists).

## Definition of Done
- [ ] `/terms` and `/privacy` render with the shared layout, the draft notice
      banner, and the outlined placeholder sections.
- [ ] Footer links to both from every page.
- [ ] `npm run build` passes clean.
- [ ] README notes that these are structural placeholders and lists what
      needs to happen before launch (lawyer review, replace placeholder
      copy).
