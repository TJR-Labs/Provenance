# Scouting & Outreach — Spec

## Objective
Close the loop: companies discover the engineers whose work stands out and reach
out to them. A company gets a scouting view ranking every submission across its
briefs; from there (or from a profile) it sends an outreach message, which lands
in the engineer's inbox. Success: a company finds its top submitter and contacts
them; the engineer sees the outreach.

## Requirements
Must-have:
1. Prisma `Message` model: id, fromCompanyId, toEngineerId, briefId (nullable
   context), body (required), createdAt, readAt (nullable).
2. `/scout` (COMPANY only): all submissions across the company's own briefs in
   one ranked table — engineer displayName (linked to profile), brief title,
   weighted percentage (or "unscored"), repo link, and a "Reach out" action.
   Sorted like the per-brief ranking: fully scored first by percentage desc,
   then partial, then unscored.
3. Send outreach (companyProcedure): from `/scout` rows and from engineer
   profiles — a form with a message body. Recipient must be an ENGINEER;
   validated server-side.
4. `/inbox` (ENGINEER only): received messages, newest first — company
   displayName, related brief title (if any), body, date. Unread messages
   visually marked; opening the inbox marks all as read. Nav shows an unread
   count badge for engineers (hidden when zero).
5. Companies see their sent messages (recipient, brief, body, date) listed
   below the `/scout` table, so prior contact is visible.
6. Vitest tests: only companies can send and only to engineers; inbox returns
   only the recipient's messages; unread count and mark-as-read behavior.

Deferred: replies/threads (engineers respond out-of-band for MVP), email
notifications, hire-outcome tracking (the data flywheel — post-MVP), blocking.

## Constraints
- Same stack constraints as foundation; no new dependencies.
- Message body rendered as text (React escaping); no formatting.
- An engineer's inbox is private: only that engineer can read it (no admin UI).

## Edge Cases
- Empty message body → validation error, nothing sent.
- ENGINEER or ADMIN calling the send procedure → FORBIDDEN.
- Outreach to a user id that isn't an ENGINEER (or doesn't exist) → validation
  error, nothing saved.
- COMPANY opening `/inbox` → 403 page; ENGINEER opening `/scout` → 403 page.
- Duplicate outreach to the same engineer → allowed (it's just a message), but
  the sent list makes prior contact visible.
- Company with no briefs/submissions → `/scout` renders an empty state.

## Definition of Done
- [ ] `/scout` ranks all of a company's submissions across briefs and links to
      profiles.
- [ ] Sending outreach from scout and from a profile both create a message.
- [ ] The engineer's inbox shows the message with company and brief context;
      the unread badge appears in the nav and clears after viewing the inbox.
- [ ] A second company cannot see the first company's scout data or sent
      messages.
- [ ] `npm test` passes, including messaging authz and unread tests;
      `npm run build` stays clean.
- [ ] README updated with a walkthrough of the full loop: seed admin → create
      users → post brief → submit → score → scout → outreach → inbox.
