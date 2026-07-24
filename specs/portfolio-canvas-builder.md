# Portfolio Canvas Builder — Spec

## Objective

Give portfolio owners a way to lay out their profile page free-form instead of
being locked into a fixed grid, so they can express themselves visually and
differentiate their portfolio from everyone else's. Today `/<username>`
renders About, Links, and Projects as fixed sections with projects in a plain
CSS grid — functional, but every portfolio looks the same shape.

Success looks like: a user can flip their profile into "canvas mode," freely
drag, resize, and overlap the About block, Links block, and any of their
individual project cards on a page-sized canvas, and publish that arrangement
as their live profile — while users who don't want to bother can stay on the
existing grid layout with zero extra effort.

## Requirements

### Mode toggle
1. A profile has a layout mode: `grid` (existing behavior, unchanged, default)
   or `canvas` (new). The user chooses/switches mode from their profile edit
   flow.
2. Switching to `canvas` mode does not delete or alter grid-mode data
   (`layoutSections`); a user can switch back to `grid` mode at any time and
   the previous grid behavior still works.

### Canvas elements
3. In canvas mode, three kinds of elements can be placed on the canvas: the
   About block, the Links block, and individual Project cards. Each is
   independently positioned, sized, and layered.
4. Every project a user creates belongs to a "project library," independent
   of canvas placement. Adding a project to the canvas and creating a project
   are separate actions.
5. A project, or the About/Links block, can be removed from the canvas
   without being deleted — it returns to an "unplaced" state and remains
   available to add back later. Deleting a project (existing behavior) removes
   it from the library and the canvas if placed.
6. Creating a new project does not automatically place it on the canvas; it
   appears in the library as unplaced.

### Positioning, sizing, layering
7. Each placed element stores an x/y position and a width/height, scoped to
   that user's canvas.
8. Elements can freely overlap. No collision prevention.
9. Elements can be resized by dragging, with a minimum width/height enforced
   so an element can't be shrunk to invisible/unusable size.
10. Layer order (z-index) is automatic: the element most recently moved or
    resized is brought to the front. No manual "bring to front"/"send to
    back" control.
11. There is no automatic handling for an element fully covered by another;
    that is the user's own design responsibility.

### Canvas bounds
12. The canvas has a fixed width matching the profile page's normal content
    width (consistent across all visitors/devices that render it) and a
    capped maximum height. It is not an infinite canvas. While editing, the
    canvas scrolls vertically within that height cap if content exceeds the
    visible viewport.
13. Elements cannot be positioned or resized outside the canvas bounds.

### Initial layout & editing
14. The first time a user switches a profile into canvas mode, all of their
    existing About/Links/Project elements are auto-placed in a starting
    layout (non-overlapping, filling the canvas top-down) so the canvas isn't
    blank. The user then rearranges from there.
15. Canvas editing (drag, resize, add/remove from library) is available only
    on desktop/tablet-sized viewports. On a mobile-sized viewport, the edit
    page shows a message that arranging the layout requires a larger screen;
    editing the *content* of About/Links/Projects remains available on
    mobile regardless of screen size.

### Saving & publishing
16. While editing, in-progress canvas changes autosave as a draft
    approximately every 30 seconds (and are not lost on navigation away from
    the editor within the same session).
17. The draft layout is not shown to public visitors until the user
    explicitly clicks "Save Layout" (or equivalent publish action), which
    promotes the draft to the live/published layout.
18. Re-entering the canvas editor loads the most recent draft (if one exists
    and is newer than the last published layout) or the published layout
    otherwise, so a user resuming later doesn't lose unpublished work.

### Public rendering
19. On desktop/tablet viewports, a visitor viewing a `canvas`-mode profile
    sees the published layout rendered at the stored positions/sizes/layers.
20. On mobile-sized viewports, a visitor viewing a `canvas`-mode profile sees
    a linear, read-only fallback: all placed elements stacked full-width,
    top to bottom, ordered by their canvas y-position (x-position as
    tiebreaker for equal y). Unplaced (library-only) elements are not shown
    on the public profile in either mode.

### Explicitly deferred (not in this spec)
21. Precision editing tools — snap-to-grid, alignment guides, zoom/pan while
    editing, keyboard-nudge positioning, multi-select/group move — are
    deferred. Drag-to-move and drag-to-resize via corner/edge handles are the
    MVP interaction set.
22. Manual layer-order controls (explicit bring-to-front/send-to-back) are
    deferred in favor of the recency-based auto z-index.
23. Adding new element types beyond About/Links/Project (e.g. free text
    blocks, standalone images/embeds) is deferred.
24. Real-time conflict resolution for the same user editing from two open
    tabs/devices simultaneously is deferred; last-write-wins on autosave/save
    is acceptable.

## Constraints

- Build on the existing stack: Next.js 15 (App Router), React 19, tRPC,
  Prisma with Supabase Postgres, Tailwind CSS v4. No new backend
  infrastructure beyond schema changes.
- No drag/resize library is currently installed. Choosing one (or hand-rolling
  pointer-event-based drag/resize) is a build-phase decision, not fixed by
  this spec — pick whatever keeps the dependency footprint and bundle size
  small while covering drag, resize, and touch/pointer input.
- Canvas editor is a client-heavy UI; it must be implemented as a client
  component and must not block or slow down server-rendering of the
  read-only public profile view (`grid`-mode and mobile-fallback rendering
  stay server-renderable).
- Per-element position/size data must be scoped per user and cascade-delete
  correctly when a project is deleted or a user is removed (consistent with
  existing cascade behavior on `Project`/`User`).
- No change to unrelated existing infrastructure (auth, rate limiting,
  security headers, CI pipeline) is required or expected by this spec.

## Edge Cases

- **User has zero projects when entering canvas mode**: canvas mode is still
  selectable; the initial auto-layout places just About and Links (if
  present), and the project library shows an empty state.
- **All elements removed from canvas**: the canvas can be published empty;
  the public profile renders a blank/"nothing here yet" canvas rather than
  erroring, matching the existing "profile with zero projects" empty state
  pattern in grid mode.
- **Draft exists but user never clicks Save Layout**: the draft never
  reaches public visitors; the last published layout (or grid mode, if
  canvas was never published) keeps rendering publicly.
- **User switches back to grid mode after building a canvas layout**: canvas
  position/size data is retained (not deleted) so switching back to canvas
  mode later restores the prior arrangement; the public profile immediately
  reflects grid rendering while in `grid` mode.
- **Project deleted while placed on canvas**: its canvas placement record is
  removed along with the project (cascade); no dangling/broken element
  remains.
- **Element resized/dragged to overlap the canvas edge**: resize/drag is
  clamped so the element's bounding box stays fully within canvas bounds.
- **Autosave conflicts with an explicit Save Layout click**: an in-flight
  autosave and a manual publish action must not race and corrupt the stored
  layout (e.g. publish always writes the current in-editor state, not a
  stale autosaved snapshot).
- **Mobile visitor with only unplaced/no elements published**: same empty
  state as desktop — no broken stacked view.
- **Very small element (near the minimum resize floor) with dense text
  content (e.g. About block)**: content may clip/scroll within the element;
  this spec does not require dynamic font scaling to fit.

## Definition of Done

- [ ] A user can switch their profile between `grid` and `canvas` layout
      mode, and switching back to `grid` restores the original grid
      rendering unchanged.
- [ ] In canvas mode, a user can drag any placed element (About, Links, each
      project) to a new position and resize it via drag handles, with a
      visible minimum size enforced.
- [ ] Overlapping elements is possible with no error or visual glitch; the
      most recently moved/resized element renders above the others.
- [ ] A project library UI lists all of a user's projects with placed/
      unplaced status; dragging a project from the library onto the canvas
      places it, and removing it from the canvas returns it to "unplaced"
      without deleting the project.
- [ ] About and Links blocks can likewise be added to or removed from the
      canvas independent of project placement.
- [ ] The canvas has a fixed width and capped height; elements cannot be
      moved or resized outside those bounds, verified by a test.
- [ ] First entry into canvas mode for a profile with existing content
      produces a non-blank, non-overlapping starting layout.
- [ ] Editor UI on a mobile-width viewport shows the "use a larger screen"
      message instead of the drag/resize canvas; About/Links/project content
      edit forms remain reachable and functional at mobile width.
- [ ] Draft layout changes persist automatically at ~30-second intervals
      during an active edit session, verified by a test that simulates
      elapsed time and checks the persisted draft state.
- [ ] The public profile shows the last-published layout, not unsaved draft
      changes, until "Save Layout" is clicked.
- [ ] A desktop/tablet visitor to a `canvas`-mode profile sees elements at
      their published positions/sizes/layers; a mobile visitor to the same
      profile sees the same elements stacked top-to-bottom by y-position
      instead.
- [ ] Deleting a project that is currently placed on the canvas removes it
      from both the library and the canvas with no dangling reference,
      verified by a test.
- [ ] `npm run build` and `npm test` pass with the new canvas mode
      integrated alongside existing grid-mode tests (no regression to grid
      rendering or existing profile edit flows).
