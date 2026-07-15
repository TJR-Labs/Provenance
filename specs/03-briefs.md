# Project Briefs — Spec

## Objective
The demand side of the marketplace: companies post scoped, real-world project
briefs (a data pipeline, a feature build, a model to train, a system to get
running) and engineers browse them. Spans the platform's three domains: software
engineering, ML/AI, and hardware/robotics/embedded. Success: a company can post
and manage briefs; an engineer can find open briefs in their domain.

## Requirements
Must-have:
1. Prisma `Brief` model: id, companyId (relation to User), title, summary
   (one-liner), description (multi-line), domain enum (`SOFTWARE` | `ML_AI` |
   `HARDWARE_ROBOTICS`), deliverables (what a submission must include), status
   enum (`OPEN` | `CLOSED`), createdAt, closedAt (nullable).
2. tRPC `brief` router:
   - `create`, `update`, `close`, `reopen` — companyProcedure, restricted to
     the brief's owning company (update/close/reopen).
   - `listOpen` (optional domain filter) and `getById` — any signed-in user.
   - `listMine` — companyProcedure, the caller's own briefs.
   - Zod validation: title ≤ 120 chars, summary ≤ 200 chars, description and
     deliverables required non-empty, domain one of the three values.
3. Pages:
   - `/briefs` (signed-in): OPEN briefs, newest first — title, summary, domain
     badge, company displayName. Domain filter via `?domain=` search param.
   - `/briefs/[id]` (signed-in): full description, deliverables, domain,
     status, company name, posted date.
   - `/briefs/new` and `/briefs/[id]/edit` (COMPANY, owner only): forms with
     validation errors shown inline, input preserved on error.
   - `/company` dashboard (COMPANY): the company's own briefs with status and
     edit/close/reopen actions.
4. Close/reopen are guarded actions in the UI (confirmation before close, since
   closing stops new submissions).
5. Vitest tests: only the owner can update/close (FORBIDDEN otherwise); domain
   filter returns only matching open briefs; validation rejections.

Deferred: rich text/markdown rendering, attachments, search, pagination (fine
until briefs number in the hundreds), draft state.

## Constraints
- Same stack constraints as foundation; no new dependencies.
- Closed briefs remain viewable at their detail URL (submissions will reference
  them forever) but are excluded from the open-briefs list.
- User-sourced text rendered as text (React escaping); never
  `dangerouslySetInnerHTML`.

## Edge Cases
- Updating/closing a brief you don't own → FORBIDDEN (tRPC) / 403 page (UI).
- Unknown brief id → 404 page.
- Invalid `?domain=` value → ignore the filter, show all open briefs.
- Closing an already-closed brief (double submit) → no error, stays closed.
- Empty briefs list → friendly empty state, not a blank page.
- ENGINEER or ADMIN hitting `/briefs/new` → 403 page.

## Definition of Done
- [ ] A company can create a brief and see it on `/company` and `/briefs`.
- [ ] Domain filter shows only matching briefs.
- [ ] A second company cannot edit or close the first company's brief.
- [ ] Closing a brief removes it from `/briefs` but its detail page still loads.
- [ ] Validation errors re-render the form with a message and preserve input.
- [ ] `npm test` passes, including ownership and filter tests; `npm run build`
      stays clean.
