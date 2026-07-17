# Canvas Editor Discoverability — Spec

## Objective

The canvas editor (`src/app/(protected)/profile/canvas/canvas-editor.tsx`) ships
a real, working direct-manipulation interaction model — drag to place, click to
bring to front, drag any corner to resize, right-click for Edit/Delete — but
none of it is discoverable to someone who hasn't used a design tool before.
The UX audit ("Provenance UX Audit") flagged this as the single biggest risk to
the app's goal of being usable by "anybody from any discipline."

This spec closes the discoverability gap without changing any of the
underlying interaction logic already shipped: it adds a visible, keyboard-
operable entry point to the existing context menu, a one-time onboarding hint,
a plain-language explanation of draft vs. published, and makes the Add
Component flow usable on mobile (where the rest of the canvas remains
desktop-only).

Success looks like: a first-time user can open `/profile/canvas`, understand
within seconds how to place, edit, and delete something, and never has to
discover right-click by accident.

## Requirements

1. Every placed element shows an always-visible (on hover, and always-visible
   on touch/coarse-pointer devices) "⋯" button in the same corner position the
   old hover "Remove" button used to occupy. Clicking it opens the identical
   Edit/Delete menu that right-click already opens (same `contextMenu` state,
   same `handleEdit`/`removeElement` logic — this is a second entry point, not
   a second implementation).
2. Right-click continues to work exactly as it does today. The "⋯" button is
   additive, not a replacement.
3. The "⋯" button is a real `<button>`: reachable via Tab, and Enter/Space
   opens the menu. Once open, Tab moves focus into the menu's Edit/Delete
   items; Escape closes the menu and returns focus to the "⋯" button that
   opened it (mirroring how Escape already closes the right-click-opened
   menu, per the existing `contextMenu` Escape handler).
4. On a user's first visit to `/profile/canvas`, a dismissible hint strip
   appears above the canvas summarizing the interaction model in one or two
   sentences: dragging from the Library places an element, clicking brings an
   element to front, dragging a corner resizes it, and "⋯" (or right-click)
   opens Edit/Delete. Dismissing it persists (server-side, on the `User`
   record, so it doesn't reappear on a different device) and it does not
   reappear after being dismissed or after the user has placed at least one
   element.
5. Add a one-line explanation next to the existing autosave status text (near
   `autosaveStatus` in `canvas-editor.tsx`) distinguishing autosave (saves a
   private draft every 30 seconds) from "Save Layout" (publishes the draft to
   the public profile). No change to the actual autosave/publish mechanics.
6. The Add Component flow (Text/Image/Link creation panels, `TextPanel`/
   `ImagePanel`/`LinkPanel` in `canvas-editor.tsx`) is fully usable at mobile
   viewport widths, even though the rest of the canvas (drag/resize/
   repositioning, the "needs a larger screen" message) remains desktop-only
   below the `md` breakpoint. A mobile user can create a Text, Image, or Link
   element; it's placed using the existing default-position/clamping logic
   and becomes repositionable once they're on a larger screen.

## Constraints

- Build on the existing stack: Next.js 15 (App Router), React 19, tRPC,
  Prisma with Supabase Postgres, Tailwind CSS v4.
- No changes to the existing z-index/bring-to-front, resize-anchor, or
  save/publish logic already shipped in `canvas-editor.tsx`, `canvas-math.ts`,
  or `src/server/canvas.ts` — this spec is additive UI/copy only.
- The "seen the hint" flag is a new, small piece of persisted state (e.g. a
  boolean or timestamp on `User`); exact field name/migration is a build-phase
  decision, but it must be per-user and server-persisted, not `localStorage`
  (a user editing from a second device should not see the hint again).
- Must not regress the desktop canvas editor experience or any of its
  existing tests (`canvas-editor.tsx`, `canvas-math.test.ts`,
  `canvas.test.ts`).

## Edge Cases

- **A user dismisses the hint, then places their first element (or vice
  versa)**: the hint does not reappear either way — dismissal and "has placed
  an element" are both sufficient to permanently suppress it.
- **A user opens the "⋯" menu and then also right-clicks the same element
  before closing it**: only one menu is open at a time (existing behavior —
  opening a new one replaces the old).
- **Keyboard-only user opens the menu via the "⋯" button, then presses
  Escape**: focus returns to the "⋯" button, not lost to `<body>`.
- **A brand-new account with zero placed elements views the canvas on
  mobile**: Add Component still works; the rest of the canvas shows the
  existing "needs a larger screen" message as it does today.
- **The autosave-vs-publish explanation text**: shown regardless of
  `saveDraft`/`publish` pending/error state — it's static copy, not a status
  message.

## Definition of Done

- [ ] Every placed element has a persistent "⋯" affordance that opens the
      same Edit/Delete menu right-click opens, verified by a test that clicks
      it without right-clicking.
- [ ] The "⋯" button and its menu are fully operable via keyboard alone (Tab
      to focus, Enter/Space to open, Tab through items, Escape closes and
      returns focus).
- [ ] A first-time hint strip appears once on `/profile/canvas` and does not
      reappear after being dismissed or after the first element is placed,
      verified by a test.
- [ ] The autosave-vs-publish explanation is visible near the autosave status
      text.
- [ ] Add Component (Text/Image/Link) can be completed successfully at a
      sub-`md` viewport width, verified by a test or documented manual check.
- [ ] `npm run build` and `npm test` pass with no regression to existing
      canvas editor tests.
