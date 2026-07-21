# Grid Block Builder Core — Spec

## Relationship to the parent spec

This is the first independently reviewable implementation slice of
[`grid-block-builder.md`](./grid-block-builder.md). It establishes the shared
layout model, editor mechanics, persistence, public rendering, and migration
foundation for profile Grid mode and project pages.

A PASS for this spec does **not** mean the parent spec is complete. Image
upload/cropping/accessibility, rich-text formatting, configurable destinations,
URL reputation, and admin review remain follow-up work.

## Objective

Replace the static profile Grid arrangement and eligible project-page main
content with one shared, owner-only 12-column block editor while preserving the
existing profile Canvas editor, fixed identity/privacy controls, public
visibility behavior, and visible legacy content.

The core slice must be safe to ship independently: profile edits use a private
draft and explicit publication, project edits publish only through an explicit
save, stale tabs cannot overwrite newer layouts, and public pages remain stable
while migration is incomplete.

## Requirements

### 1. Scope and permissions

1. Only the signed-in profile owner can read that profile's private Grid draft
   or call its Grid mutations.
2. Only the owning user can access a project's layout editor or call its layout
   mutation. Collaborators receive no layout permission.
3. The builder controls only the page's main content. Existing navigation,
   profile/project identity, metadata, privacy controls, reporting, and owner
   actions remain outside it.
4. Profile Canvas mode and its existing persistence/editor behavior remain
   unchanged.
5. Project pages have no Canvas mode.
6. Existing user, profile, project, banned-user, and private-page visibility
   checks remain authoritative for public layouts.

### 2. Shared relational layout model

1. Add shared relational `GridLayout` and `GridBlock` persistence rather than
   storing layout snapshots as JSON.
2. A layout records its owner, profile-or-project scope, state, revision, and
   timestamps. A project-scoped layout references that project.
3. A block records its type, integer grid geometry, stable ordering/id, and the
   content fields needed by this slice.
4. The available block types are `PROJECT`, `IMAGE`, `TEXT`, and `LINK`.
5. Profile Grid mode has one private `DRAFT` layout and one active `PUBLISHED`
   layout. Profile draft saves never mutate the published layout.
6. An eligible project has one published layout. Unsaved project edits exist
   only in the current browser state.
7. Layouts contain at most 50 blocks.
8. Database constraints or equivalent server validation prevent a layout from
   being attached to the wrong owner/project scope.
9. All public queries select only published layouts and never expose profile
   drafts or owner-only editor metadata.

### 3. Grid placement and editing

1. The desktop editor uses 12 columns. `x`, `y`, `width`, and `height` are whole
   grid-cell values; `x` is zero-based and `y` is a nonnegative row.
2. Minimum sizes are:
   - Project: 3 columns by 2 rows.
   - Image: 2 columns by 2 rows.
   - Link: 2 columns by 1 row.
   - Text: 2 columns by 1 row.
3. Every block can be selected, dragged, resized, and deleted.
4. Pointer movement and resizing snap to cells. Nearby-block edge snapping may
   be offered only when the result resolves to valid integer grid coordinates.
5. Blocks cannot leave the 12-column grid, use negative rows, shrink below
   their minimum, or overlap after a completed operation.
6. Dropping one block over another attempts a position exchange without
   changing either size. The exchange succeeds only if both final footprints
   are in bounds and overlap no other block.
7. The editor previews a valid or invalid result before drop. An invalid move,
   resize, or swap restores the previous layout and gives a non-color-only
   explanation.
8. Clicking a palette type adds its minimum-sized block in the first available
   row-major grid space. Dragging a type from the palette places it at the valid
   indicated cell or falls back to no addition.
9. Grid rows grow downward without a fixed maximum row. A click-add can always
   use a later row until the 50-block limit; an explicit occupied/invalid
   palette drop is refused.
10. At 50 blocks, all add controls are disabled and identify the limit. A 51st
    block is also rejected by the server.
11. Selecting a block opens its inspector without hiding the grid.
12. Deletion is immediate and shows a brief Undo action; it has no confirmation
    dialog.
13. Session undo/redo covers add, delete, move, and resize. Text input keeps the
    browser's native undo behavior and does not join the layout history.
14. Arrow keys move the selected block one cell. Shift plus an arrow resizes it
    by one cell in that direction, subject to minimums, boundaries, and
    collisions.
15. The geometry/placement logic is a pure shared client module or reducer and
    is not duplicated between the profile and project editors.

### 4. Content supported in this core slice

1. Project blocks can select only projects owned by the layout owner.
2. A selected project block publicly renders its current cover image when
   available, title, short description, and a destination to its project page.
   Private or unavailable projects do not leak data to viewers; owners see an
   unavailable state and can replace or remove the block.
3. Text blocks accept plain paragraphs in this slice and may remain empty in a
   private profile draft or unsaved project editor.
4. Image and link blocks can be added, positioned, resized, deleted, saved in a
   profile draft, and exercised by layout undo/redo, but this slice provides no
   controls to create or replace their content.
5. Newly added image/link blocks are therefore empty and are removed only by
   Profile Publish or Project Save & Publish.
6. Image and link content imported from existing pages is preserved, publicly
   rendered with existing application behavior, and can be moved, resized, or
   deleted. Its content is read-only until the follow-up content/link slices.
7. Existing imported external links continue using the application's current
   normalized HTTP(S) rendering and safe new-tab attributes. This slice does
   not claim Web Risk review or the stronger local-network URL rules from the
   parent spec.
8. This slice does not add rich-text formatting, image upload/selection,
   cropping, focal controls, alt/decorative controls, configurable block-level
   destinations, or remote link metadata.

### 5. Editor surfaces and responsive rendering

1. `/profile/canvas` keeps the existing Grid/Canvas toggle. In `CANVAS`, it
   renders the existing Canvas editor unchanged. In `GRID`, it renders the new
   shared Grid editor.
2. The project metadata/privacy form remains fixed. It links owners to
   `/projects/[id]/layout`, which hosts the shared project Grid editor.
3. Mobile users receive public rendering but no layout editing controls.
4. Public desktop rendering uses the saved 12-column positions and sizes.
5. Narrow-screen rendering is one column ordered by `y`, then `x`, then stable
   block order/id as a deterministic final tie-breaker.
6. Both editors provide full-page desktop and mobile previews of current local
   state through the same renderer used by public pages.
7. Public rendering never includes selection outlines, handles, palettes,
   pending placement previews, draft state, or owner-only validation details.
8. Empty published layouts use the application's existing empty-page state.

### 6. Profile draft and publication

1. Opening profile Grid mode loads the private draft when present; otherwise it
   starts from the active published layout.
2. Dirty profile drafts autosave every 30 seconds and can be saved immediately
   with `Save Draft`.
3. Draft saves preserve empty blocks and never alter the active public layout.
4. `Publish` validates the draft, removes empty blocks, and atomically replaces
   the active published layout.
5. Successful publication leaves the saved draft consistent with what the
   editor retains locally while the public copy contains only publishable
   blocks.
6. Leaving with changes not yet saved to the private draft triggers the browser
   unsaved-navigation warning.
7. Save failures retain local state, show a persistent error, and leave the
   editor dirty. A later 30-second autosave interval retries.
8. Profile saves include the expected draft revision. A stale revision cannot
   replace a newer draft or published revision.

### 7. Project saving and publication

1. Project layouts never autosave.
2. `Save & Publish` validates local state, removes empty blocks, and atomically
   replaces the project's published layout.
3. Viewers receive the new layout immediately after a successful save, subject
   to existing visibility rules.
4. Leaving with unsaved local changes triggers the browser unsaved-navigation
   warning.
5. Save failure retains local state, shows a persistent error, and leaves the
   previous public layout unchanged.
6. Project saves include the expected published revision. A stale tab cannot
   overwrite a newer save.

### 8. Server validation, concurrency, and errors

1. Every save revalidates block count, known type, integer geometry, minimum
   sizes, horizontal bounds, nonnegative rows, collisions, owner/project scope,
   and owned project references. Client validation is not trusted.
2. Profile draft save, profile publication, and project publication use
   transactions for layout replacement.
3. A stale save returns a conflict without discarding the stale tab's local
   blocks. The editor disables further saving and asks the owner to reload or
   reopen.
4. Invalid input returns a useful editor error and does not partially modify a
   stored layout.
5. Controls, placement feedback, disabled states, and errors remain usable
   without color alone and use appropriate labels/live status semantics.
6. Placement operations remain responsive with 50 mixed blocks; a simple
   in-memory scan is acceptable at this MVP limit.

### 9. Existing-content migration and compatibility

1. Migration is idempotent: rerunning it does not duplicate layouts or blocks.
2. Existing profile Grid pages are converted into matching initial private and
   published layouts without changing ownership, privacy, or visible content.
3. Profile conversion respects the existing `layoutSections` order:
   - About becomes a text block containing the bio when present.
   - Projects become owned project blocks in their existing order.
   - Links become preserved link blocks in their existing order.
4. Existing project pages without video are converted into a published layout:
   description becomes text, image media becomes preserved image blocks, and
   links become preserved link blocks without losing their order or values.
5. **Approved legacy-video exception:** a project containing video remains on
   the existing legacy public renderer and does not expose the new layout editor
   in this slice. No video is removed or hidden. A later video-capable migration
   slice must resolve it before that project adopts the builder.
6. If legacy conversion would require more than 50 blocks, retain the existing
   public renderer and do not expose the Grid editor. Do not truncate or merge
   content.
7. Until a record is migrated, public profile/project routes retain their
   existing renderer. Migration can therefore be deployed without a page-view
   outage.
8. The conversion service is callable by a documented deployment command and
   is covered by representative migration tests.

## Explicitly deferred from this slice

1. New image upload and existing-image selection.
2. JPEG/PNG/WebP-only builder upload validation and GIF rejection.
3. Aspect-ratio preservation, cover cropping, focal positioning, alt text, and
   Decorative controls.
4. Bold, italic, inline links, per-selection links, and whole-text-block links.
5. Configurable project/image/link destinations and standalone link titles.
6. Strong local URL validation, private-network rejection, Google Cloud Web
   Risk checks/cache, pending states, admin review, and decisions/audit trail.
7. Automatic link metadata.
8. A general video block or migration of legacy video projects.
9. Every post-MVP item already deferred by the parent spec.

## Edge cases

1. Differently sized blocks whose footprints cannot exchange positions restore
   their original positions.
2. An occupied or otherwise invalid explicit palette drop is refused; click-add
   continues into a later row while the layout has fewer than 50 blocks.
3. The 51st block is refused on client and server.
4. Pointer and keyboard resizing stop at type minimums.
5. Deleted/private/unavailable project references do not expose project data.
6. Empty blocks remain in profile drafts but disappear during publication.
7. Profile autosave network failure preserves and later retries local changes.
8. Project save network failure preserves local changes and old public state.
9. Multiple tabs reject stale saves without losing either server or local data.
10. Equal-row mobile ordering uses the leftmost column, then stable block order.
11. Privacy changes affect viewing immediately without republishing.
12. Legacy projects containing video remain fully visible through the old page.
13. Legacy content requiring more than 50 blocks remains fully visible through
    the old page and is not offered the Grid editor.

## Definition of Done

- [ ] Shared relational layout/block schema and migration are present.
- [ ] Profile Grid mode opens the structured editor for its owner while Canvas
      behavior remains unchanged.
- [ ] Eligible project owners can open the structured editor; non-owners cannot
      access its page or mutations.
- [ ] All four block shells support click/drag add, move, resize, selection,
      deletion, Undo, and session undo/redo.
- [ ] Grid boundaries, minimums, snapping, collision checks, swaps, invalid
      rollback, keyboard controls, no-space handling, and the 50-block limit work.
- [ ] Project selection is owner-only and project blocks render the required
      default content and destination.
- [ ] Text blocks accept plain paragraphs.
- [ ] Desktop/mobile previews use the public renderer; mobile order is row then
      column.
- [ ] Profile autosave, Save Draft, Publish, draft/public separation, error
      preservation, and stale revision handling work.
- [ ] Project Save & Publish, no-autosave behavior, error preservation, and stale
      revision handling work.
- [ ] Publication removes empty blocks transactionally.
- [ ] Existing profile Grid and non-video project content migrates without
      visible loss or weaker privacy.
- [ ] Legacy video projects remain on the existing visible page and are not
      offered the incomplete editor.
- [ ] Automated tests cover placement/swap, mobile ordering, ownership,
      draft/public separation, stale revisions, and migration.
- [ ] A manual 50-block acceptance check covers movement, resizing, preview,
      save, and publication without dropped valid blocks.
- [ ] The smallest relevant tests, type-check, lint, and production build pass.
