# UI Visual Refresh — Spec

## Objective
Provenance's UI was originally built by Codex and reads as generic, templated
Tailwind output with no distinct visual identity. This spec covers a
whole-app visual refresh: a cohesive, distinctive design applied consistently
across every page, replacing the current default look.

Target user: the site's own users/visitors (public profile viewers, account
holders) and the owner, who wants the product to look like a considered
product rather than AI-scaffolded boilerplate.

Success looks like: every page in the app shares one coherent visual system
(color, type, spacing, motion) that feels intentional and distinct, in both
light and dark themes, and the owner signs off on the look page-by-page.

Aesthetic direction is intentionally **not** prescribed here — the build is
expected to propose a specific direction (mood, palette, type choices) rather
than working from a fixed brief.

## Requirements

### Must-have
1. A single, consistent visual system (color palette, typography scale,
   spacing scale, component styling) defined once and reused across the app
   — not per-page one-offs.
2. Full app coverage — every route gets the new visual system, including:
   - `login`, `signup`, `signup/username`
   - `[username]` public profile pages
   - `projects`, `projects/[id]`
   - `(protected)/account`, `(protected)/profile`, `(protected)/admin`
   - `privacy`, `terms`
   - `error.tsx`, `global-error.tsx`, `not-found.tsx`, `forbidden.tsx`
   - shared chrome: `layout.tsx`, `_components`, `oauth-buttons.tsx`,
     `project-card.tsx`, `project-media.tsx`
3. Light and dark theme support, both meeting the contrast requirement below,
   with a way for the user to be in either (system preference at minimum).
4. WCAG AA baseline: text contrast ≥ 4.5:1, all interactive elements
   reachable and operable via keyboard, visible focus states, accessible
   names/labels on icon-only controls.
5. Existing functionality, routes, and data flows are preserved — this is a
   restyle, not a feature change. No must-have behavior may regress.
6. Responsive across mobile, tablet, and desktop breakpoints for every page
   in scope.
7. Stack stays Next.js 15 / React 19 / Tailwind v4. No component library is
   mandated; the build may introduce a headless primitives library (e.g.
   Radix) only where a specific interactive component genuinely needs it
   (e.g. accessible dialogs/menus), not wholesale.

### Nice-to-have (explicitly deferred if not natural to include)
8. Minor UX improvements incidental to the restyle — better empty states,
   loading states, micro-interactions/transitions — are in scope opportunistically
   but are not required for completion.
9. A formal written design-token document/style guide (colors, type scale,
   spacing as a reference artifact). Not required for done, but a reasonable
   byproduct of building the system consistently.

### Explicitly out of scope
- New features, new pages, or changed information architecture.
- Backend/API/data model changes.
- SEO, analytics, or performance work beyond what naturally falls out of the
  restyle.

## Constraints
- Tech stack: Next.js 15, React 19, Tailwind v4 (already in place) — keep.
- No new heavy UI framework/design-system dependency; any added library must
  be a lightweight, headless primitives package used narrowly.
- Must not break existing auth flows (NextAuth/OAuth), tRPC data fetching, or
  Prisma-backed pages — visual layer only.
- Accessibility floor: WCAG AA (contrast, keyboard, labeling) as stated above.
- No fixed timeline.
- Build execution note: intended to be implemented using the Fable 5 model
  (execution detail — does not change the requirements above).

## Edge Cases
- **Long/overflowing content**: long usernames, project titles, and
  descriptions must truncate or wrap gracefully, not break layout.
- **Empty states**: a profile with no projects, or a projects list with zero
  items, must render a sensible empty state rather than a blank or broken
  layout.
- **Loading states**: pages/components that fetch data (projects, profile,
  media) show a visually consistent loading state rather than layout shift
  or a blank flash.
- **Error/edge pages**: `error.tsx`, `global-error.tsx`, `not-found.tsx`,
  `forbidden.tsx` are restyled to match the new system, not left in default/
  unstyled form.
- **Auth forms**: login/signup forms must clearly show validation and error
  states (e.g. bad credentials, taken username) in the new visual style.
- **Media**: `project-media.tsx` must handle broken/missing/slow-loading
  images without breaking the surrounding layout.
- **Theme switching**: switching between light and dark (or system change)
  must not flash unstyled content or leave any component stuck in the wrong
  theme's colors.
- **Admin pages**: restyled like the rest of the app even though they're
  lower-traffic/internal.

## Definition of Done
- [ ] Every route/page listed under Requirements #2 uses the new visual
      system (no page still on the old default styling).
- [ ] Light and dark themes both implemented and pass a manual contrast
      check (≥4.5:1 for body text) on each.
- [ ] Keyboard-only pass across login, signup, profile, projects, and account
      pages confirms all interactive elements are reachable with visible
      focus states.
- [ ] All edge cases above are visually verified (empty states, loading
      states, error pages, broken media, long content, theme switch).
- [ ] Existing test suite (`npm test`) and typecheck (`npm run typecheck`)
      still pass — confirming no behavioral regression.
- [ ] Owner performs a page-by-page visual walkthrough across mobile,
      tablet, and desktop breakpoints and signs off on the look.
