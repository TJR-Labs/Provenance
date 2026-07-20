# Canvas Editor Interactions and Custom Theme - Spec

## Objective

Improve the profile layout editor so it behaves like a complete visual editor
on desktop, tablet, and mobile. Users must be able to preview and publish their
profile theme, customize the full-page background, select and manipulate one or
many cards, control locking and layering, edit content in place, use undo/redo
and the operating-system clipboard, and reuse uploaded image resources.

The target user is a profile owner editing `/profile/canvas`. Success means the
editor accurately previews `/<username>`, every destructive layout action is
recoverable through undo, saved changes appear on the published Grid or Canvas
profile, and a successful **Save Layout** returns the user to their profile.

## Requirements

### Theme and full-page background

1. The Edit Layout page must render its preview with the profile's currently
   selected built-in theme, including the same colors and typography used by
   the published profile.
2. The Edit Layout page must show the existing built-in theme choices plus a
   **Custom** theme choice. **Custom** is a profile-theme customization entry
   point, not a third Grid/Canvas layout mode and not a project-card layout.
3. Selecting a built-in theme must update the entire editor preview immediately
   without publishing it. Selecting **Custom** must open a theme-customization
   component following the app's current styling-component interaction pattern.
4. The Custom theme component must provide exactly these full-page background
   controls:
   - background color picker;
   - background image upload or paste;
   - remove background image;
   - reset to the selected theme's default background.
5. A custom background must style the complete profile page, including the area
   outside the Canvas placement grid. It must work for both Grid and Canvas
   profile modes.
6. A background image must cover the full profile page, remain centered, crop
   as needed to preserve its aspect ratio, and scroll with the page. The chosen
   background color remains the fallback behind the image.
7. When no custom background is saved, or after a reset, the profile must use
   the selected built-in theme's normal background.
8. Background image upload and paste must reuse the app's existing server-side
   image type, size, and content-validation rules.
9. Theme and background changes are private draft changes until **Save Layout**
   succeeds. They publish together with the rest of the editor snapshot.

### Save and publish behavior

10. **Save Layout** must atomically publish the complete editor snapshot:
    card placement and size, card content and appearance, lock and layer state,
    selected theme, custom background, and any globally edited profile/project
    content.
11. After a successful save, navigate directly to `/<username>` so the user can
    see the published result.
12. If saving fails, remain in the editor, preserve the local draft, show a
    clear error, and do not partially publish any part of the snapshot.
13. Existing draft autosave must continue to protect in-progress work, but
    autosave must not make changes public or race a final Save Layout publish.

### Card appearance and selection

14. An unselected card must have no outer border. A selected card must show a
    prominent solid accent border. Published cards must never show selection
    borders, resize handles, lock icons, menus, or other editor controls.
15. Outer card/container chrome must be transparent in both the editor preview
    and published profile. Content-specific visuals such as images, text,
    badges, and buttons retain their own styling.
16. Clicking a card normally selects only that card and clears the previous
    selection. Clicking empty editor space clears the selection.
17. Shift-click toggles an individual card into or out of the current
    selection.
18. Dragging a selection rectangle from empty editor space selects every card
    whose bounding box intersects the rectangle. A normal drag-box selection
    replaces the previous selection; Shift-drag adds intersecting cards to it.
19. Touch interfaces must provide a **Select multiple** mode. While active,
    tapping cards toggles them in the selection. Drag-box selection remains
    available on touch/pointer devices where a drag gesture can be completed
    without preventing normal page scrolling.
20. A selected card exposes these direct controls: Duplicate, Delete,
    Lock/Unlock, four corner resize dots, and a three-dot menu button. The
    controls must be usable with mouse, touch, and keyboard.
21. The current corner resize indicators must be replaced by dot-shaped handles
    that appear only while a card is selected. Each of the four corners must
    resize from that corner while anchoring the opposite corner and respecting
    the existing minimum size and editor bounds.
22. Multi-selection must support group movement, duplication, deletion,
    locking/unlocking, clipboard actions, and layering. A resize handle still
    resizes its individual card; this spec does not add proportional group
    resize.

### Menus and in-place editing

23. Clicking a card's three-dot button and right-clicking that card must open
    the same menu state and the same action implementation. The three-dot path
    is required on devices without right-click.
24. The shared card menu must include **Edit**, **Cut**, **Copy**, **Paste**,
    **Layer**, and **Delete**. **Layer** opens a submenu containing **Bring to
    front**, **Bring forward**, **Send backward**, and **Send to back**.
25. The old separate content **Edit** and appearance **Style** actions must be
    merged into one **Edit** action. Edit opens a popup immediately above the
    target card containing both its supported content fields and appearance
    controls. The popup must reposition within the viewport when there is not
    enough room above the card.
26. The Edit popup replaces the current separate styling section above the
    whole canvas. Only one Edit popup may be open at a time. Escape and an
    explicit close/cancel action close it without losing already committed
    draft changes.
27. About, Links, and Project editing must remain inside the card popup rather
    than navigating to `/profile/edit` or a project edit page.
28. Editing display name, school, avatar, bio, links, or project content from a
    card edits the underlying global profile/project value. These edits must
    use the existing validation and appear everywhere that global content is
    rendered after Save Layout succeeds.
29. Username and derived categories remain read-only. The editor must not
    provide a way to change the username or directly edit derived categories.
30. Free-form Text, Image, and Link card edits remain scoped to that canvas
    card. Their current sanitization, URL safety, and upload validation remain
    enforced.
31. When multiple cards are selected, the shared menu actions operate on the
    whole selection where meaningful. **Edit** remains visible but disabled
    because one popup cannot edit heterogeneous cards as a group.

### Layering

32. Selecting or clicking a card must not change its layer. Before a user makes
    an explicit layer change, cards remain ordered by when they first appeared
    in the layout; newly added cards appear after existing cards.
33. **Bring to front** moves the target selection above every unselected card.
    **Bring forward** moves it forward by one layer boundary. **Send backward**
    moves it backward by one layer boundary. **Send to back** moves it below
    every unselected card.
34. A layer action on multiple selected cards treats them as one group and
    preserves their existing relative stacking order.
35. Explicit layer changes are part of the draft, persist across editor
    sessions, and appear on the published profile after Save Layout.

### Locking

36. A user can lock or unlock one card or the current multi-selection. Lock
    state persists in the draft, across editor sessions, and in the published
    layout data after Save Layout.
37. Locking means the card cannot move. It does not by itself prevent editing,
    resizing, duplicating, deleting, copying, or changing the card's layer.
38. Every locked card shows a lock icon above it in the editor. Lock icons are
    editor-only and never appear on the published profile.
39. If a multi-selection contains one or more locked cards, group dragging is
    blocked entirely; unlocked cards in that selection must not move either.
40. For a mixed locked/unlocked selection, the lock control may lock all
    selected cards. Unlock is offered when the selected cards are all locked;
    users can select only the locked subset when they want to unlock part of a
    mixed selection. Individual lock icons remain the source of truth.

### Duplicate, delete, history, and keyboard commands

41. Duplicating one or more cards creates new cards slightly offset from the
    originals. The copies preserve relative arrangement, content, appearance,
    size, and relative layer order, but start unlocked.
42. Delete acts immediately without a confirmation dialog. About, Links, and
    Project cards retain their existing placed/unplaced semantics; deletion of
    free-form Text, Image, and Link cards retains its existing permanent-removal
    semantics within the draft.
43. The editor must maintain undo and redo history. Visible **Undo** and
    **Redo** buttons must be available at every viewport size and disabled when
    their corresponding history stack is empty.
44. Ctrl+Z performs Undo. Ctrl+Y and Ctrl+Shift+Z both perform Redo. Shortcuts
    must not intercept keystrokes while the user is typing in an input,
    textarea, select, or rich-text editing surface.
45. Undo/Redo must cover move, resize, add, delete, duplicate, cut/paste, lock,
    layering, card content/appearance edits, theme changes, background changes,
    and resource mutations. Pure selection changes are not added to history.
46. After a successful Save Layout, the saved state becomes the new published
    baseline. Undoing afterward creates a new private draft difference and does
    not silently alter the already published profile until Save Layout is used
    again.

### Operating-system clipboard

47. Ctrl+C, Ctrl+X, and Ctrl+V must use the operating system clipboard. The
    same Cut, Copy, and Paste actions must be available through the card's
    three-dot/right-click menu for touch and non-keyboard use.
48. Copy writes a structured, versioned card payload to the clipboard so cards
    can be pasted into another editor tab or session. Cut writes the same data
    and removes the selected cards as one undoable action.
49. Pasting copied cards creates slightly offset copies that preserve content,
    size, styling, relative arrangement, and relative layer order, and start
    unlocked.
50. Clipboard card payloads must identify their owning user/profile. Card data
    copied from another user's profile must be rejected rather than imported.
    Malformed, unsupported-version, or untrusted clipboard payloads must be
    ignored with a clear non-destructive message.
51. Pasting an operating-system image file or image blob into the editor must
    validate and upload it, add it to the user's Resources library, and place a
    new Image card on the canvas. Failed validation or upload must create
    neither a resource nor a card.
52. Clipboard permission denial or unavailable Clipboard API support must show
    a clear error and leave the document unchanged. Menu buttons must provide
    the same result or error behavior as their keyboard equivalents.

### Persistent image resources

53. Add a **Resources** section within the existing Library. It lists the
    signed-in user's uploaded and pasted images and allows each resource to be
    dragged or tapped onto the canvas repeatedly.
54. Image resources persist across editor sessions even when no current card
    uses them. Resources must be private to their owner during editing and use
    existing authenticated upload/access patterns.
55. Images uploaded through the Custom background editor are also added to the
    Resources library so they can be reused as card images.
56. Removing an image from Resources prevents future placements but must not
    break existing cards or a published background that already references the
    stored image. The underlying file remains available while referenced.

### Cross-device behavior and accessibility

57. All functionality in this spec must be available on desktop, tablet, and
    mobile. Remove the current desktop-only limitation on arranging the canvas.
58. Touch users must be able to drag cards, resize with corner dots, enter
    multi-select mode, use card and group actions, control layering and locking,
    edit card content/appearance, manage resources, and customize the theme and
    background.
59. Every keyboard shortcut must have a visible button or menu equivalent.
    Buttons and menus must have accessible names, keyboard focus states, and
    correct disabled/pressed state semantics.
60. Opening a menu or Edit popup moves focus into it. Escape closes it and
    returns focus to its triggering control. Only one card menu and one Edit
    popup may be active at a time.

## Constraints

- Build on the existing Next.js, React, TypeScript, Tailwind CSS, tRPC, Prisma,
  and PostgreSQL architecture. Reuse the current canvas draft/publish flow,
  theme CSS-variable approach, upload endpoint, sanitizers, and URL validation.
- The editor preview and public renderer must share the same theme,
  background, card appearance, and layer semantics to prevent preview/publish
  drift.
- Use persistent schema fields for lock state, profile background settings,
  resource ownership, and any other state that must survive sessions. Do not
  encode durable state only in client memory.
- Save Layout must commit interdependent canvas, profile, project, theme, and
  background changes transactionally or provide equivalent all-or-nothing
  behavior.
- Do not weaken authentication, authorization, content sanitization, CSP,
  upload validation, safe URL handling, or user data isolation.
- Clipboard import is untrusted input. Validate schema/version/ownership and
  sanitize all copied content again before accepting it.
- Image resources are user-scoped. A user must not enumerate or reuse another
  user's private resources through clipboard data or guessed identifiers.
- Do not add arbitrary user JavaScript or unscoped CSS. Existing custom CSS
  security boundaries remain in force.
- Preserve existing Grid and Canvas public rendering behavior except where this
  spec explicitly changes theme/background, card chrome, content, or layering.
- Do not begin implementation as part of this specification.

## Edge Cases

- **Save fails after global content edits**: no layout, profile, project,
  theme, or background change becomes public; the complete local draft remains
  available for retry.
- **Autosave completes near Save Layout**: stale autosave data cannot overwrite
  the published snapshot or the post-save draft baseline.
- **Custom background image fails validation/upload**: retain the prior
  background, show an error, and do not create a Resource entry.
- **Custom image is removed with a color configured**: render the color. If no
  custom color remains, render the selected theme default.
- **Very tall or narrow page**: background remains centered and cover-sized
  without leaving unstyled page regions.
- **Selection rectangle touches a card by one pixel**: the card is selected
  because intersection, not full containment, is the rule.
- **Touch selection conflicts with page scroll**: page scrolling remains
  possible outside explicit card manipulation or multi-select gestures.
- **Selected card is obscured by another card**: the accent selection overlay
  and controls render above card content for editing, but the saved card layer
  does not change until a Layer action is chosen.
- **Bring forward/backward at an endpoint**: the action is a no-op and does not
  create a redundant history entry.
- **Layering a multi-selection with interleaved unselected cards**: move the
  selected set as one group and preserve selected-card relative order.
- **Group drag contains a locked card**: no selected card moves; lock icons
  identify which cards caused the blocked drag.
- **Duplicate/paste near a canvas edge**: preserve the group arrangement while
  clamping or choosing an alternate offset that keeps every copy reachable.
- **Delete then Undo**: restore cards, content, lock state, layer order,
  resource references, and selection-relevant document state exactly.
- **Undo after publishing**: change only the private draft until Save Layout is
  clicked again.
- **Clipboard permission denied/unavailable**: show an actionable message and
  do not change selection or document history.
- **Clipboard contains both structured card data and an image**: prefer the
  app's valid structured card payload; otherwise import the valid image.
- **Clipboard payload belongs to another user/profile**: reject it without
  exposing copied content or creating resources/cards.
- **Pasted image upload fails**: create neither the Resource entry nor Image
  card, and keep clipboard contents untouched.
- **Resource removed while referenced**: existing draft/published cards and
  backgrounds continue rendering; the removed resource no longer appears for
  new placements.
- **Edit popup near top/right/left viewport edge**: reposition it below or
  horizontally inward so all controls remain visible and operable.
- **Edit applied to invalid global content**: show field-level validation and
  keep the invalid change out of the publish snapshot; username and categories
  remain read-only.
- **Multiple cards selected**: Edit is disabled; all applicable menu/direct
  actions clearly target the complete selection.
- **Theme identifier is missing or invalid**: safely fall back to the default
  built-in theme without losing stored custom-background data.

## Definition of Done

- [ ] `/profile/canvas` previews every built-in theme with the same tokens and
      typography as `/<username>`.
- [ ] The theme picker includes Custom; Custom opens full-page color, image,
      remove-image, and reset controls without creating a third layout mode.
- [ ] Custom backgrounds render across the complete published page in both
      Grid and Canvas modes, with cover/center/crop behavior verified.
- [ ] Save Layout publishes the full editor snapshot atomically and redirects
      to `/<username>` on success; a forced failure publishes nothing and
      leaves the draft recoverable.
- [ ] Unselected and published cards have no outer border; selected cards show
      only the solid accent border; outer card chrome is transparent.
- [ ] Single click, Shift-click, intersecting drag-box selection, Shift-drag
      additive selection, and touch Select multiple mode are covered by tests.
- [ ] Selected cards expose Duplicate, Delete, Lock/Unlock, four resize dots,
      and the three-dot menu at every supported viewport size.
- [ ] Three-dot and right-click entry points open the same menu implementation,
      including Edit, Cut/Copy/Paste, Layer submenu, and Delete.
- [ ] Edit opens one viewport-safe popup above/near the card with merged content
      and appearance controls; About/Links/Project editing no longer navigates
      away.
- [ ] Display name, school, avatar, bio, links, and project content edits commit
      globally only on Save Layout; username and categories cannot be edited.
- [ ] Clicking/selecting never changes saved layer order. All four Layer actions
      work for one card and groups, persist, and render correctly publicly.
- [ ] Lock state persists; locked cards show editor-only icons; a mixed
      selection containing a locked card cannot group-drag.
- [ ] Group move, duplicate, delete, lock/unlock, clipboard, and layering work;
      duplicates are offset, preserve arrangement/styling, and start unlocked.
- [ ] Undo/Redo buttons and Ctrl+Z, Ctrl+Y, and Ctrl+Shift+Z cover every required
      document mutation without intercepting text-entry keystrokes.
- [ ] Ctrl+C/X/V and menu equivalents use the operating-system clipboard,
      validate structured payload ownership/version, and reject foreign or
      malformed card data safely.
- [ ] Pasting a valid image uploads it, adds a persistent Resource, and places
      an Image card; invalid/failed images create neither object.
- [ ] The Library contains a reusable Resources section. Removing a resource
      blocks future reuse without breaking existing card/background references.
- [ ] Every feature is operable on mobile/touch as well as desktop, and every
      shortcut has a visible accessible control equivalent.
- [ ] Focus management, Escape behavior, accessible labels, disabled states,
      and selection/lock pressed states pass component accessibility checks.
- [ ] Server tests cover transactional publish, lock/layer persistence,
      resource ownership/reference behavior, clipboard payload validation, and
      global content validation.
- [ ] Component tests cover selection, marquee intersection, group actions,
      history, menus, Edit popup positioning, theme/background preview, and
      mobile/touch interactions.
- [ ] Existing canvas, profile, upload, authorization, sanitization, and public
      rendering tests remain green; `npm test` and `npm run build` pass.
