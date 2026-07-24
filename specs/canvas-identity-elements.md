# Canvas Identity Elements — Spec

## Objective

Canvas mode (`specs/portfolio-canvas-builder.md`, `specs/canvas-editor-refinements.md`)
already lets a user freely place and style About, Links, Project, Text,
Image, and Link elements. But the identity header above the canvas — avatar,
display name, `@username`, and the category badges — is currently fixed
chrome (`src/app/[username]/page.tsx` lines ~95-139), rendered the same way
for every profile regardless of layout mode, with no positioning or styling
control at all.

This spec brings avatar, display name, username, and category badges into
the canvas element system in Canvas mode only, so a user building a canvas
layout has "full access over the whole page" the way they already do for
About/Links/Project/Text/Image/Link. Grid mode is unchanged — it keeps the
current fixed header exactly as it renders today.

Success looks like: a Canvas-mode user can drag their avatar, name, username,
and category badges anywhere on the canvas, resize them, and style each
one's color/font/avatar framing — while the values themselves (display name,
avatar image) are still edited the same way as today, via `/profile/edit`.

## Requirements

### New element types
1. `CanvasElementType` gains four new values: `AVATAR`, `NAME`, `USERNAME`,
   `CATEGORIES`. These behave like `ABOUT`/`LINKS` in the existing model: at
   most one of each per user, each has an "unplaced" state it returns to
   when removed from the canvas (not deletable — a profile always has a
   name, username, categories, and avatar slot to place), and each is part
   of the same Library sidebar as About/Links/Project.
2. Content for these four types is always derived, never typed directly into
   the canvas element itself:
   - `AVATAR` renders `User.avatarUrl` (or the existing initials fallback
     when absent).
   - `NAME` renders `User.displayName`.
   - `USERNAME` renders `@` + `User.username` (and `school`, matching the
     current header's `@username · school` format).
   - `CATEGORIES` renders the same derived, per-project category badges
     `getPublicProfile` already computes — read-only, automatically updates
     when the user's projects' categories change, exactly as it does in the
     fixed header today.
3. Right-click/"⋯" **Edit** on any of these four element types navigates to
   `/profile/edit` (same behavior as the existing About/Links Edit action) —
   there is no inline content editing for these types, since their content
   isn't independently authored (`displayName`/`avatarUrl` are `/profile/edit`
   fields; username and categories aren't user-editable at all).
4. First entry into canvas mode (`portfolio-canvas-builder.md` Requirement 14)
   additionally auto-places Avatar, Name, Username, and Categories (when at
   least one category exists) in the starting non-overlapping layout,
   above/alongside About/Links/Project.

### Per-element styling
5. Each of the six element types that render text or an image directly
   (`NAME`, `USERNAME`, `CATEGORIES`, `ABOUT`, `AVATAR`, and the existing
   `TEXT`) gains a style panel (opened the same way `TextPanel`/`ImagePanel`/
   `LinkPanel` open today) offering: text color, background color (or
   transparent), and a font choice from a fixed, curated font list (no
   arbitrary font URL/`@font-face` injection — reuses the constraint already
   established for custom CSS in `portfolio-platform.md`).
6. `AVATAR` additionally offers a frame shape (circle / square / rounded
   square) and an image position/zoom control (reusing the existing
   uploaded/URL image, not a new upload path — avatar upload itself remains
   on `/profile/edit`).
7. Style choices are stored per canvas element (new nullable columns on
   `CanvasElement`, following the existing `textContent`/`imageUrl` column
   pattern) and apply only to that element's canvas rendering — they have no
   effect on the fixed Grid-mode header or on `/profile/edit`'s own chrome.

### Inline text editing style
8. Any canvas element with directly-visible text content in an editable
   state (the `TextPanel` editor, and any future inline text editing) renders
   its input surface with a transparent background and a dotted outline
   showing the fillable bounds, instead of a solid-bordered box — so the
   editing view visually matches how the text will actually appear once
   published, rather than looking like a distinct form control. This applies
   to the canvas editor's text-entry surfaces; it does not change ordinary
   form fields on `/profile/edit` or `/projects/*` forms, which remain
   standard bordered inputs.

### Public rendering
9. `[username]/page.tsx` renders Avatar/Name/Username/Categories from
   published `CanvasElement` rows when `layoutMode === "CANVAS"`, the same
   way it already renders About/Links/Project/Text/Image/Link — positioned
   absolutely on desktop/tablet, stacked via `sortForMobile` on mobile. When
   `layoutMode === "GRID"`, the existing fixed header renders unchanged, with
   no dependency on these new element types or their styling.
10. If a Canvas-mode profile has never placed one of Avatar/Name/Username/
    Categories (e.g. an old canvas layout published before this spec
    shipped), that piece of identity does not render on the public canvas
    view — consistent with "unplaced elements are not shown" — until the
    user adds it from the Library. This spec's migration (Requirement 4's
    auto-placement) only applies to *new* first-time canvas-mode entries;
    see Edge Cases for existing published canvas layouts.

## Constraints

- Build on the existing stack: Next.js 15 (App Router), React 19, tRPC,
  Prisma with Supabase Postgres, Tailwind CSS v4.
- Reuse the existing `CanvasElement` draft/publish/autosave machinery
  (`src/server/canvas.ts`, `autosave.ts`) unchanged — these are new element
  types and new nullable content/style columns, not a new persistence
  mechanism.
- The curated font list and exact style-panel field set are a build-phase
  decision; the requirement is a fixed, small, allowlisted set (no arbitrary
  font loading, no `@font-face`/external URL injection).
- Username and category-badge *content* remain non-user-editable, consistent
  with `portfolio-platform.md` Requirements 13 and existing account
  constraints — this spec only adds position/size/style control, never a way
  to type a different username or hand-pick arbitrary tags.
- No change to unrelated existing infrastructure (auth, rate limiting,
  security headers, CI pipeline) is required or expected by this spec.

## Edge Cases

- **Existing published Canvas-mode profiles from before this spec ships**:
  they have no Avatar/Name/Username/Categories `CanvasElement` rows and
  none are auto-created (Requirement 4 only fires on *first-time* mode
  switch, which already happened for these users) — their public canvas
  view simply won't show identity elements until the user manually adds
  them from the Library. This is an acceptable one-time migration gap, not
  a bug: it matches the "unplaced elements aren't shown" rule already in
  the base spec.
- **User has zero categories (no projects yet) and places the Categories
  element**: renders an empty state consistent with how the fixed header
  already omits the badge row entirely when `categories.length === 0`.
- **User deletes their avatar image (`avatarUrl` becomes null) while an
  `AVATAR` element is placed**: renders the existing initials-fallback
  visual within whatever frame/size/style was set, not a broken image.
- **Style panel color chosen with poor contrast against the user's theme or
  custom CSS background**: no automatic contrast enforcement — same
  "user's own design responsibility" precedent as element overlap in the
  base canvas spec.
- **Right-click/"⋯" Edit on Categories or Username**: navigates to
  `/profile/edit` same as Name/Avatar, even though there's nothing on that
  page to directly change for Username/Categories — this is intentionally
  consistent rather than a dead-end with no navigation at all; the
  destination page's own content (or lack of an editable field there) is
  out of scope for this spec.

## Definition of Done

- [ ] `CanvasElementType` includes `AVATAR`, `NAME`, `USERNAME`, `CATEGORIES`;
      each behaves as placeable/unplaced/single-instance like About/Links,
      verified by a test.
- [ ] Avatar, Name, Username, and Categories elements render derived content
      (`avatarUrl`/initials fallback, `displayName`, `@username · school`,
      per-project category badges) with no directly-typed text content field.
- [ ] Edit on any of the four new types navigates to `/profile/edit`.
- [ ] First-time switch to Canvas mode auto-places all four new types
      alongside About/Links/Project in the starting layout, verified by a
      test.
- [ ] Name, Username, Categories, About, Text, and Avatar elements each
      expose a style panel (color, background, curated font list); Avatar
      additionally exposes frame shape and image position/zoom.
- [ ] Style values persist per-element and apply only to that element's
      canvas rendering, verified by a test that sets a style and checks it
      renders on the public canvas view without affecting Grid mode.
- [ ] Canvas text-entry editing surfaces render with a transparent
      background and dotted outline instead of a solid box.
- [ ] Grid-mode public profile rendering is pixel-behavior-unchanged (no
      regression), verified by existing Grid-mode tests still passing.
- [ ] `npm run build` and `npm test` pass with no regression to existing
      canvas editor, profile, or public-profile-rendering tests.
