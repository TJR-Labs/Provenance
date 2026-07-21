# Grid Block Builder — Spec

## Objective

Build an easy-to-use, structured block editor for profile Grid mode and project pages. Owners can arrange project, image, text, and link blocks with enough freedom to create distinct layouts while snapping, collision rules, previews, and fixed visual styling keep the editor predictable.

The three-day MVP upgrades the existing profile Grid mode without changing the freeform Canvas mode. It also introduces the same structured editor for project pages. A profile layout is edited as a private draft and explicitly published; a project layout becomes public when explicitly saved, subject to the page's existing visibility settings.

Success means an owner can create, preview, safely link, and publish a responsive layout without code, while viewers receive a stable desktop layout and a readable single-column mobile layout.

## Requirements

### Must-have MVP requirements

1. **Scope and permissions**
   1. Only the profile owner may edit that profile's Grid layout.
   2. Only the project owner may edit that project's structured layout. Project collaborators do not receive layout-editing access in this MVP.
   3. The builder controls the page's main content area. Navigation, profile or project identity, privacy controls, and owner actions remain fixed outside the grid.
   4. The existing freeform profile Canvas mode remains available and unchanged.
   5. Project pages use the structured grid builder only; this work does not add freeform Canvas mode to projects.
   6. Existing profile, project, and page visibility rules continue to control who may view a published layout.

2. **Editor grid and placement**
   1. The desktop editor uses a 12-column grid with whole-cell horizontal and vertical placement.
   2. Blocks snap to grid cells and to nearby block edges. Edge snapping must resolve to valid grid coordinates.
   3. Every block can be dragged and resized.
   4. A block cannot be moved outside the grid or resized below its minimum size:
      - Project: 3 columns by 2 rows.
      - Image: 2 columns by 2 rows.
      - Link: 2 columns by 1 row.
      - Text: 2 columns by 1 row.
   5. When a block is dropped over another block, the two blocks retain their sizes and exchange positions only if both resulting footprints are within the grid and do not overlap any block.
   6. An invalid swap is canceled, and the dragged block returns to its previous position. The editor shows the valid or invalid result before drop.
   7. Layouts support no more than 50 blocks. At the limit, add controls are disabled and explain the limit.
   8. Owners can add a block either by dragging a block type from a palette or by clicking a block type to place it in the next available grid space.
   9. If no valid space exists for a new block, the block is not added and the editor explains why.
   10. Selecting a block opens its content and link controls in a side panel while keeping the grid visible.
   11. Deleting a block happens immediately and offers a brief Undo action rather than a confirmation dialog.
   12. Editor undo and redo cover block addition, deletion, movement, and resizing for the current editing session.
   13. Text editing uses the browser's native text undo history in the MVP.
   14. A selected block can be moved one grid cell with the arrow keys. Shift plus an arrow key resizes it by one cell in the corresponding dimension, subject to grid boundaries, minimum sizes, and collision rules.

3. **Block types**
   1. Profile Grid layouts and project layouts offer the same four MVP block types: project, image, text, and standalone link.
   2. **Project blocks:**
      - Owners can select only projects they own.
      - The default presentation contains the project's cover image, title, short description, and destination.
      - The default destination is the selected project's page.
      - The owner may override the default destination with another approved internal or external link.
   3. **Image blocks:**
      - Owners can upload a new image or select an existing image previously uploaded to their own account.
      - Accepted uploads are JPEG, PNG, and WebP files no larger than 10 MB.
      - SVG and animated GIF uploads are rejected.
      - Images always preserve their original aspect ratio and are never stretched or distorted.
      - The MVP uses cover cropping and lets the owner drag the image to set its focal position within the block.
      - Cropping never modifies the original uploaded file.
      - Before publication, every non-empty image block must have descriptive alt text or be explicitly marked Decorative.
      - An image block may have an optional approved destination link.
   4. **Text blocks:**
      - Owners can enter paragraphs and apply bold, italic, and inline-link formatting.
      - Individual text selections can have different links.
      - The owner may also assign an optional approved destination to the whole block.
   5. **Standalone link blocks:**
      - Owners provide an approved destination and may provide a custom title.
      - The MVP displays a simple card containing the custom title when present and the destination domain.
      - Automatic remote title, description, and thumbnail metadata are not fetched in the MVP.

4. **Responsive display and preview**
   1. Layout editing is desktop-only in the MVP. Mobile viewers do not receive editing controls.
   2. On narrow screens, published blocks stack into one column.
   3. Mobile order is determined by desktop grid position: top-to-bottom by row, then left-to-right within a row.
   4. Profile and project editors provide full-page desktop and mobile previews of the currently edited state.
   5. Public pages never display editor handles, palettes, pending drag previews, or owner-only review details.

5. **Profile draft and publication**
   1. Profile Grid mode has one private editable draft and one active public layout in the MVP.
   2. Draft changes autosave every 30 seconds while unsaved changes exist.
   3. The owner can save the private draft immediately with a Save Draft action.
   4. Autosaving or saving a draft does not change the active public layout.
   5. A separate Publish action validates the draft and replaces the active public Grid layout atomically.
   6. Leaving the editor while changes have not yet been saved to the draft triggers a warning.
   7. If draft saving fails, local changes remain in the editor, a persistent error is shown, and autosave retries without publishing.

6. **Project saving and publication**
   1. Project layouts do not autosave.
   2. A single Save & Publish action validates and atomically stores the layout.
   3. A successful save is visible to viewers immediately, subject to the project's existing visibility setting.
   4. Leaving with unsaved changes triggers a warning.
   5. If saving fails, local changes remain in the editor, the previous public layout remains unchanged, and a persistent error is shown.

7. **Publication cleanup and validation**
   1. Empty blocks may exist while editing a profile draft or an unsaved project layout.
   2. Publish and Save & Publish automatically remove empty blocks before storing the public layout.
   3. A block is empty when it has no selected project, uploaded or selected image, text content, or link destination, as applicable to its type.
   4. A non-empty image without alt text or the Decorative setting is not treated as empty. Publication is blocked, and the editor identifies the image that needs accessibility information.
   5. Blocks containing links that are pending review may be published, but the pending links remain disabled for viewers.
   6. After cleanup, an otherwise empty layout may be published and displays the application's existing empty-page state.

8. **Internal and external links**
   1. Image, text, project, and standalone link blocks support internal app destinations and external destinations.
   2. External destinations accept only normalized `http` and `https` URLs.
   3. Malformed URLs, dangerous schemes such as `javascript:`, `data:`, and `file:`, URLs containing embedded credentials, and destinations resolving to local, loopback, link-local, or private network addresses are rejected.
   4. Approved external links open directly in a new tab with protections that prevent the destination from controlling the originating page.
   5. Internal destinations open according to the application's existing navigation behavior and are not sent to the external reputation service.
   6. Editing a destination invalidates any prior approval associated with the old destination and starts validation for the new exact URL.

9. **URL reputation and admin review**
   1. The server checks every new or changed external URL with Google Cloud Web Risk's Lookup API before making the link clickable.
   2. Reputation results are cached by normalized exact URL to reduce external API usage. Cached results must have a bounded lifetime so an implementation cannot treat them as permanent approvals.
   3. Web Risk credentials remain server-side and are never returned to the browser or committed to source control.
   4. A URL that Web Risk reports as clean can become clickable after all local URL validation passes.
   5. A URL that Web Risk flags produces an owner-visible warning and enters Pending review status.
   6. If Web Risk is unavailable or returns an indeterminate result, the link fails closed and remains Pending review.
   7. While pending, the block remains in the editor with a Pending review label. Viewers may see the block's non-link content but receive no clickable link or link interaction.
   8. Existing administrators use an admin-only review queue showing the normalized exact URL, reputation result, threat categories, owner, page, block, and submission time.
   9. An administrator can approve or reject an exact URL. Approval never approves the entire domain.
   10. Approval enables only the reviewed exact URL. If the URL changes, it requires a new check and approval.
   11. Rejection removes the destination from the block and records an owner-visible rejection status or banner in the affected editor.
   12. Admin decisions are recorded with the administrator, exact URL, decision, and timestamp.
   13. An administrator's approval remains valid while a subsequent check reports the same threat status. A changed URL or newly reported threat category requires review again.
   14. The MVP does not build a general notification center; link-review results are visible in the affected block and editor.

10. **Concurrency and data integrity**
    1. Layout saves use a revision or equivalent optimistic-concurrency check.
    2. A stale editor tab cannot overwrite a newer saved revision.
    3. On conflict, the stale tab retains its local state, is prevented from saving over the newer revision, and prompts the owner to reload or reopen the editor.
    4. Draft publication and project Save & Publish are transactional: a failure must not leave a partially updated public layout.

11. **Existing-content migration**
    1. Existing profile Grid content is converted into the initial private Grid draft and active public Grid layout without losing visible content.
    2. Existing project-page content is converted into an initial structured layout without losing visible content.
    3. Migration preserves existing profile/project ownership, privacy, media, project references, text, and valid links.
    4. Existing public pages remain viewable during and after migration.

### Explicitly deferred post-MVP requirements

1. A profile-version library supporting at most three versions per user.
2. Version actions: create blank, duplicate, rename, preview, delete, and set active.
3. The active profile version cannot be deleted until another version is active, and deleting an inactive version requires confirmation.
4. Automatic standalone-link metadata previews containing remote title, description, thumbnail, and domain, with a simple-card fallback.
5. Email notifications and a general in-app notification center for URL-review decisions.
6. Rechecking approved external URLs every 24 hours and automatically returning newly flagged URLs to review.
7. Adjustable image zoom within the crop frame.
8. Rich-text headings and lists.
9. One unified undo/redo history spanning layout and rich-text content changes.
10. Mobile or touchscreen layout editing.
11. Freeform Canvas mode for project pages.

## Constraints

1. The MVP target is three days from the start of implementation.
2. Preserve the existing Next.js/React, tRPC, Prisma, Supabase Storage, authentication, authorization, profile Canvas, and project architecture.
3. Reuse existing upload, reusable image-resource, admin-role, moderation, safe-external-URL, profile Canvas, undo/redo, and 30-second draft-autosave capabilities where applicable.
4. Do not add a drag-and-drop, grid, rich-text, email, or other dependency without explicit approval.
5. The MVP does not add visual style customization. Fonts, colors, borders, themes, and other presentation styling continue to use existing application styles.
6. URL reputation checking is a risk-reduction layer, not a guarantee that an approved destination is harmless. Local validation, server-side checks, exact-URL review, and safe browser-link attributes remain required.
7. The Web Risk Lookup API must be used in a way that can remain within its available free monthly request allowance at small scale; redundant checks should use the bounded cache.
8. Public rendering must not expose private drafts, owner-only media, private projects, moderation details, Web Risk credentials, or links that are not approved.
9. All editor controls, warnings, validation messages, previews, and keyboard interactions must remain usable without relying on color alone.
10. The builder must remain usable with the maximum 50 blocks: dragging and resizing must continue responding to input, and saving or publishing must complete without dropping blocks.

## Edge Cases

1. **Invalid swap:** If differently sized blocks cannot exchange positions without overlap or leaving the grid, cancel the swap and restore the original layout.
2. **No placement space:** If clicking or dragging from the palette cannot find valid space, do not add the block and explain the failure.
3. **Maximum reached:** The 51st block cannot be added.
4. **Minimum size:** Mouse and keyboard resizing stop at the block type's minimum dimensions.
5. **Upload failure or invalid image:** Keep the existing block state, show the upload error, and do not create a broken image reference.
6. **Missing image resource:** Do not leak a storage URL or render broken interactive content. Show the owner an unavailable-media state and a way to replace or remove it.
7. **Deleted, private, or unavailable project:** Hide inaccessible project data from viewers. Show the owner that the project block is unavailable so it can be replaced or removed.
8. **Incomplete image accessibility:** Block publication until alt text or Decorative is set; do not silently delete a non-empty image.
9. **Empty blocks:** Remove them only as part of profile Publish or project Save & Publish; do not remove them during draft editing.
10. **Flagged URL:** Keep block content, disable its link for viewers, and place the exact URL in the admin queue.
11. **Reputation outage:** Keep the link pending and disabled; do not treat an error as a clean result.
12. **Rejected URL:** Remove only the rejected destination, retain the rest of the block, and show the decision to the owner.
13. **Approved URL edited later:** Disable the changed destination until the new exact URL passes validation and reputation checking.
14. **Multiple tabs:** Reject a stale save without discarding either the newer server revision or the stale tab's local edits.
15. **Network failure during profile autosave:** Preserve local changes, show a persistent failure state, and retry on a later autosave interval.
16. **Network failure during project publication:** Keep the previous public layout unchanged and preserve the editor's local changes.
17. **Mobile ordering tie:** When blocks begin in the same grid row, order them by their leftmost column.
18. **Privacy change after publication:** Existing profile/project privacy rules take effect immediately without requiring the layout to be republished.

## Definition of Done

- [ ] Profile Grid mode opens the new structured editor for the owner, while profile Canvas mode behaves as it did before this feature.
- [ ] Project owners can edit project main content in the structured editor; non-owners cannot access its mutations or editing UI.
- [ ] All four block types can be added by click and drag, moved, resized, configured in the side panel, and deleted with Undo.
- [ ] Grid snapping, edge snapping, minimum sizes, boundaries, valid swaps, invalid-swap rollback, and the 50-block limit work with both mouse and keyboard controls.
- [ ] Project blocks can select only owner-owned projects and show the agreed default fields and destination.
- [ ] Image blocks accept only the agreed formats and size, preserve aspect ratio and the original file, support focal positioning, and use only owner-accessible media.
- [ ] Text blocks support paragraphs, bold, italic, inline links, and an optional whole-block destination.
- [ ] Standalone link blocks render a custom title and domain without fetching remote preview metadata.
- [ ] Desktop and mobile previews match public rendering, and mobile public rendering follows row-then-column order in a single column.
- [ ] Profile drafts autosave every 30 seconds while dirty, support Save Draft, remain private, and update the active layout only through Publish.
- [ ] Project layouts never autosave and update public content only through a successful Save & Publish.
- [ ] Unsaved-navigation warnings, save-failure preservation, and stale-revision conflict handling work for both editors as applicable.
- [ ] Publish and Save & Publish remove empty blocks, but block publication for non-empty images missing alt text or Decorative.
- [ ] Local URL validation rejects malformed, dangerous-scheme, credential-bearing, and private/local-network destinations.
- [ ] New or changed external URLs are checked server-side through Google Cloud Web Risk, and clean, flagged, and unavailable-service responses produce the specified states.
- [ ] Pending links remain non-clickable to viewers while preserving the block's non-link content.
- [ ] Admins can review exact URLs, approve or reject them, and see the required context; non-admins cannot access the review queue or mutations.
- [ ] Approval enables only the exact reviewed URL; rejection removes only the destination and shows the result in the owner's editor.
- [ ] Approved external links open in a new tab without granting control of the originating page.
- [ ] Automated tests cover grid placement/swap rules, mobile ordering, ownership checks, draft-versus-public behavior, stale revisions, URL validation, reputation states, and admin authorization.
- [ ] A migration test demonstrates that representative existing profile Grid and project content becomes editable without losing visible content or weakening privacy.
- [ ] A manual acceptance check with 50 mixed blocks confirms that movement, resizing, previewing, saving, and publishing remain usable and retain all valid blocks.
- [ ] Setup documentation names the required Google Cloud Web Risk configuration, where its secret is stored, expected free-tier behavior, and what happens when the service is unavailable.
- [ ] The smallest relevant test, type-check, lint, and build checks available in the repository pass, with no regression in existing Canvas mode or public profile/project rendering.
