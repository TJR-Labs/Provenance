# Canvas Editor Refinements — Spec

## Objective

The canvas portfolio builder (`specs/portfolio-canvas-builder.md`) shipped
drag/resize/publish for About, Links, and Project elements. This spec refines
the editor's interaction quality and extends what can be placed on the
canvas, based on hands-on use of the shipped editor.

This supersedes two "explicitly deferred" items from the original spec:
manual/immediate layer ordering (previously: recency-based only) and new
element types beyond About/Links/Project (previously: deferred entirely).

Success looks like: clicking a card instantly brings it to front (not just
after a completed drag), right-click gives quick edit/delete access,
elements resize from any corner, the canvas's visible border matches its
actual placeable area, and a user can add free-form Text, Image, and Link
elements to the canvas — not just their existing profile content.

## Requirements

### Layering
1. Clicking/pressing down on any placed element immediately brings it to the
   front (updates its z-index above all others), before any drag or resize
   occurs — not only after a completed move, as today. A click that results
   in no movement still brings the element to front.

### Context menu
2. Right-clicking a placed element opens a context menu with two actions:
   **Edit** and **Delete**. This replaces the current always-visible hover
   "Remove" button.
3. Delete removes the element from the canvas (returns it to "unplaced" for
   About/Links/Project; permanently removes Text/Image/Link elements, which
   have no unplaced state — see Requirement 8).
4. Edit behavior depends on element type:
   - **About / Links**: navigates to `/profile/edit`.
   - **Project**: navigates to that project's edit page.
   - **Text / Image / Link** (new types, see below): opens inline editing
     for that element's content directly on the canvas, without navigating
     away.

### Resize from any corner
5. Each placed element has drag handles on all four corners (top-left,
   top-right, bottom-left, bottom-right), not only bottom-right as today.
   Dragging any corner resizes the element, keeping the opposite corner
   anchored in place, subject to the existing min/max size clamping.

### Canvas border alignment
6. The visible right border of the canvas editing surface matches the actual
   right edge of the placeable area (`CANVAS_WIDTH`). Today the scroll
   container stretches to fill available flex space while the placeable
   surface stays fixed-width, leaving a visible gap between the surface's
   right edge and the container's border on wider viewports.

### Add Component: new element types
7. A new "Add component" control lets a user add **Text**, **Image**, and
   **Link** elements directly to the canvas. Unlike About/Links/Project,
   these are not pre-existing profile content, so they do not appear in the
   Library sidebar as placed/unplaced — they're created fresh:
   - **Text**: opens a constrained rich-text editor (bold, italic, lists,
     links — no arbitrary HTML/scripts). Output is sanitized server-side
     against an allowlist before it is stored or rendered on the public
     profile.
   - **Image**: opens a file picker and uploads through the existing
     `uploadFile` (Supabase Storage) pipeline used by project media, subject
     to the same type/size validation (`upload-validation.ts`). Supports an
     optional caption, shown as a text overlay/label under or on the image.
   - **Link**: a small form for a label and a URL. Rendered with a favicon
     fetched from a third-party favicon-by-domain service (e.g. Google's
     `s2/favicons`) referenced via `<img src>` — the server never fetches
     the user-supplied URL itself, so there's no server-side-request/SSRF
     surface.
8. A user may add any number of Text, Image, and Link elements (no cap,
   unlike the one-each cap on About/Links). Each new element is added at a
   default size/position (clamped within canvas bounds) and brought to
   front.
9. Deleting a Text/Image/Link element removes its canvas record. The
   underlying uploaded file (for Image) is not deleted from storage —
   consistent with existing project media deletion, which also leaves the
   file in storage today.

## Constraints

- Build on the existing stack: Next.js 15 (App Router), React 19, tRPC,
  Prisma with Supabase Postgres, Tailwind CSS v4.
- `CanvasElement`'s `type` enum gains `TEXT`, `IMAGE`, `LINK` alongside the
  existing `ABOUT`, `LINKS`, `PROJECT`. New content fields (rich-text HTML,
  image URL + caption, link label + URL) are added to the schema; choice of
  a specific rich-text editor library and HTML sanitizer is a build-phase
  decision, not fixed by this spec, but sanitization is mandatory before
  storing or rendering any user-authored HTML.
- No server-side fetch of user-supplied Link URLs (avoids SSRF); favicon
  rendering must go through a client-side `<img>` request to a third-party
  favicon service, never a server fetch of the target URL's HTML.
- Reuse the existing `uploadFile`/`validateUpload` pipeline for Image
  elements rather than introducing a second upload path.
- No change to unrelated existing infrastructure (auth, rate limiting,
  security headers, CI pipeline) is required or expected by this spec.

## Edge Cases

- **Right-click on empty canvas space (not on an element)**: no context menu
  appears; only right-clicking a placed element opens it.
- **Edit action navigates away from the canvas editor mid-session**: current
  autosave-on-unmount behavior (`controllerRef.current?.flush()`) still
  fires, so in-progress drag/resize/add changes aren't lost.
- **Resizing from a corner past the opposite edge (e.g. dragging top-left
  past bottom-right)**: clamped by the existing min-size floor so the
  element cannot invert or collapse past its minimum dimensions.
- **Adding a Text/Image/Link element when the canvas is already full/tall**:
  new element is placed at a default position clamped within bounds (may
  land near existing elements); user repositions manually, consistent with
  how drag-from-library placement already works.
- **Image upload fails validation (wrong type/too large) or the network
  request fails**: the element is not added to the canvas; the user sees an
  inline error in the Add Component flow and can retry.
- **Rich text saved with disallowed HTML (e.g. a pasted `<script>` or
  `<iframe>`)**: stripped by server-side sanitization before storage; never
  reaches the public profile render.
- **Link URL is empty, malformed, or javascript:/data:-scheme**: rejected by
  the same `safeExternalUrl` validation already used for profile Links;
  element cannot be saved with an unsafe URL.
- **Deleting a Text/Image/Link element**: no "unplaced" state to return to
  (unlike About/Links/Project) — it's gone; re-adding requires creating a
  new element via Add Component.
- **Multiple context-menu-triggering right-clicks in quick succession /
  right-click during an active drag**: only one context menu is open at a
  time; opening a new one closes any previous one; right-click during an
  active pointer-captured drag is ignored until the drag ends.

## Definition of Done

- [ ] Clicking a placed element brings it to front immediately, verified by
      a test that clicks (no drag) and asserts z-index changes.
- [ ] Right-clicking a placed element opens an Edit/Delete menu; the old
      always-visible Remove button no longer appears.
- [ ] Edit on About/Links routes to `/profile/edit`; Edit on Project routes
      to that project's edit page; Edit on Text/Image/Link opens inline
      editing on the canvas without navigation.
- [ ] Delete removes About/Links/Project elements to "unplaced" (still
      selectable from the Library) and permanently removes Text/Image/Link
      elements.
- [ ] Every placed element has four working corner resize handles, each
      anchoring the opposite corner, verified by a test per corner.
- [ ] The canvas surface's right border visually aligns with `CANVAS_WIDTH`
      at common desktop/tablet viewport widths — no visible gap between the
      surface edge and the scroll container's border.
- [ ] "Add component" lets a user create a Text element (rich text,
      sanitized), an Image element (uploaded via existing pipeline, with
      optional caption), and a Link element (label + URL + favicon from a
      third-party service, no server-side fetch of the URL).
- [ ] Multiple Text, Image, and Link elements can coexist on one canvas with
      no artificial cap, verified by a test.
- [ ] Server-side sanitization strips disallowed HTML/script content from
      Text elements before storage, verified by a test with a malicious
      payload.
- [ ] Link elements reject unsafe URL schemes using the existing
      `safeExternalUrl` validation.
- [ ] Public profile rendering (`[username]/page.tsx`) renders published
      Text/Image/Link elements the same way it renders About/Links/Project
      today (desktop absolute-positioned, mobile linear fallback via
      `sortForMobile`).
- [ ] `npm run build` and `npm test` pass with no regression to existing
      canvas editor or public profile tests.
