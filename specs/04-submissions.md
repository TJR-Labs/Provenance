# Submissions — Spec

## Objective
The supply side: engineers build real, working solutions to briefs and submit
them. Submissions are portfolio-grade work the engineer keeps and showcases
regardless of outcome — so they also power a members-visible engineer profile.
Success: an engineer submits work to an open brief, the company sees it, and the
work appears on the engineer's profile.

## Requirements
Must-have:
1. Prisma `Submission` model: id, briefId, engineerId, repoUrl (required),
   demoUrl (nullable — live demo or video), writeup (what was built, how to run
   it, key decisions; required), createdAt, updatedAt, with
   `@@unique([briefId, engineerId])`.
2. tRPC `submission` router:
   - `upsert` — engineerProcedure; creates or updates the caller's submission
     for a brief; rejected with a clear error if the brief is CLOSED.
   - `listForBrief` — the brief's owning company only (FORBIDDEN for other
     companies); returns all submissions with engineer displayName.
   - `mineForBrief` — engineerProcedure; the caller's own submission if any.
   - `listForEngineer` — any signed-in user; powers the profile.
   - Zod validation: repoUrl/demoUrl must be valid `http://` or `https://`
     URLs; writeup required non-empty.
3. Brief detail page (`/briefs/[id]`) grows role-aware sections:
   - ENGINEER + brief OPEN: submit/edit form for their own submission only.
   - ENGINEER + brief CLOSED: their submission read-only (if any).
   - Owning COMPANY: list of all submissions (engineer name linked to profile,
     links, writeup, dates) and a submission count.
   - Engineers never see competitors' submissions.
4. Engineer profile `/engineers/[id]` (any signed-in user): displayName and all
   their submissions — brief title (linked), domain, repo/demo links, writeup.
   This is the portfolio; it persists after briefs close.
5. `/company` dashboard shows a submission count per brief.
6. Vitest tests: upsert updates rather than duplicates; closed-brief rejection;
   visibility (non-owner company FORBIDDEN on `listForBrief`).

Deferred: file uploads, automated harness evaluation (long-term moat — out of
MVP scope), markdown rendering of writeups, submission withdrawal.

## Constraints
- Same stack constraints as foundation; no new dependencies.
- Submissions are never deleted when a brief closes; they are permanent
  portfolio entries.
- User-sourced text rendered as text (React escaping); external links get
  `rel="noopener noreferrer"`.

## Edge Cases
- Submitting to a CLOSED brief (including via direct tRPC call) → rejected with
  a clear message, nothing saved.
- Editing a submission after the brief closes → rejected.
- COMPANY or ADMIN calling `upsert` → FORBIDDEN.
- Invalid repo/demo URL scheme (e.g., `javascript:` or bare text) → validation
  error, input preserved.
- Unknown engineer id on profile URL → 404 page.
- Engineer with zero submissions → profile renders with an empty state.
- Company viewing another company's brief submissions → FORBIDDEN / 403 page.

## Definition of Done
- [ ] An engineer can submit to an open brief and edit that submission; a second
      submit updates rather than duplicates (unique constraint holds).
- [ ] After the brief closes, both new submissions and edits are rejected.
- [ ] The brief's company sees all submissions; another company gets 403; an
      engineer sees only their own.
- [ ] The submission appears on the engineer's `/engineers/[id]` profile.
- [ ] Submission counts show on the company dashboard.
- [ ] `npm test` passes, including upsert, closed-brief, and visibility tests;
      `npm run build` stays clean.
