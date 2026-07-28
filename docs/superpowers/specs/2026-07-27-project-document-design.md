# Project Document Creator Design

**Date:** 2026-07-27  
**Figma source:** “Provenance — Screens v0.1”, screen 09, node `8:79`  
**Status:** Approved for implementation planning

## Goal

Replace the current form-first project editing experience with the document-style creator shown in Figma. The creator must provide real draft autosave, preview, publishing, document blocks, project-linked build logs, visibility controls, and public rendering while preserving every existing project grid until its owner explicitly publishes a new document.

## Product decisions

- Screen 09 becomes the real project editor, not a visual-only shell.
- Project documents use dedicated models rather than extending profile `Section`/`Block` or spatial `GridLayout` models.
- A build-log entry may optionally belong to a project; existing account-wide entries remain valid.
- The first block set is text, external link, allowlisted embed, and project build-log reference.
- GitHub URLs are ordinary link blocks; no repository metadata integration is included.
- `Project.summary` is a dedicated short subtitle. Existing `Project.description` remains the opening body copy.
- Existing project grids remain the public fallback until the owner publishes a project document.

## Routes and navigation

### Creator

`/projects/[id]/edit` becomes the document creator for an existing project. It remains authenticated and owner-only.

The root layout treats project creation and editing routes as workspace routes so they use the existing `WorkspaceRail` without the global header or footer. The Build item is active for:

- `/projects/new`
- `/projects/[id]/edit`
- `/projects/[id]/layout`

### Public project

`/projects/[id]` keeps its current privacy, banned-user, and ownership checks. Rendering precedence is:

1. Published `ProjectDocument`, when present.
2. Existing published project `GridLayout`, when present.
3. Existing legacy project-field renderer.

### Legacy project layout

`/projects/[id]/layout` remains unchanged and available as **Legacy layout** while the project has no published document. Publishing a document makes the document canonical; it does not delete the grid or its blocks.

## Data model

### Project additions

Add a nullable `summary` field for the short subtitle used by project cards and the document header.

Existing public metadata remains authoritative for discovery and access control:

- `title`
- `summary`
- `description`
- `category`
- `private`
- `excludeFromFeed`

Publishing a document synchronizes these fields from the draft in one transaction.

### ProjectDocument

Each project may have at most one document for each state: `DRAFT` and `PUBLISHED`.

Required data:

- `id`
- `projectId`
- `state` (`DRAFT` or `PUBLISHED`)
- `revision`
- `title`
- nullable `summary`
- `description`
- `category`
- nullable `coverMediaId`
- `private`
- `excludeFromFeed`
- `savedAt`
- nullable `publishedAt`
- creation/update timestamps

Use a unique constraint on `(projectId, state)`. Deleting a project cascades to both document states and their blocks. A cover references an existing media record owned by the same project; no new asset store is introduced.

### ProjectDocumentBlock

Blocks belong to one document state and have stable IDs and explicit order.

Initial kinds:

- `TEXT`: plain multiline text using native controls; no rich-text dependency.
- `LINK`: safe external URL plus optional label.
- `EMBED`: URL accepted only when its host is already allowed by the site editor’s embed policy and CSP.
- `DEVLOG`: reference to a project-linked `DevlogEntry`.

Use typed nullable fields appropriate to each block kind rather than an unvalidated arbitrary payload. Enforce a unique order within a document and return blocks in deterministic order.

### DevlogEntry addition

Add nullable `projectId` with a project relation using `onDelete: SetNull` and an index suitable for recent entries per project. Existing rows remain account-wide with `projectId = null`, and deleting a project preserves its former entries as account-wide history.

A document may reference only a devlog entry owned by the project owner and linked to that same project.

## Draft lifecycle

### Lazy initialization

`getEditorState(projectId)` creates a draft only when none exists. The initial draft copies:

- Current project title, description, category, privacy, and feed setting.
- Current `summary`, if present.
- The first compatible project media item as the cover, if present.
- No document blocks.

Initialization must not create a published document, mutate public metadata, modify the legacy grid, or change public rendering.

### Autosave

The creator debounces draft saves. Each save sends the last observed revision. The server validates and updates the draft only when the revision still matches, then increments the revision and returns the authoritative saved timestamp.

A revision conflict stops autosave and asks the user to reload. It must never silently overwrite changes from another tab.

### Preview

Preview renders the current validated draft through the same document renderer used publicly, without creating or changing the published document.

### Publish

Publish is disabled while a save is pending, validation is failing, or the editor is conflict-locked.

Publishing runs in one transaction:

1. Confirm authenticated ownership and expected draft revision.
2. Validate draft metadata, cover ownership, block content, URLs, embeds, and devlog references.
3. Replace or create the `PUBLISHED` document snapshot and ordered blocks.
4. Synchronize public `Project` metadata from the draft.
5. Record publication time and return the new authoritative editor state.

A failed publish changes neither the previous published document nor public project metadata.

## Server API

Add a focused project-document service and tRPC router following existing server/router separation.

### `getEditorState`

- Protected, owner-only.
- Lazily initializes the draft.
- Returns project identity, draft metadata and blocks, revision, save/publication timestamps, eligible cover media, and recent linked build logs.

### `saveDraft`

- Protected, owner-only.
- Accepts project ID, expected revision, complete draft metadata, and ordered blocks.
- Validates the complete payload at the trust boundary.
- Returns incremented revision and saved timestamp.

### `publish`

- Protected, owner-only.
- Accepts project ID and expected draft revision.
- Performs the atomic publication flow.

### Public document lookup

Integrate published-document selection into the existing public project query rather than creating a competing authorization path. Existing private-project, private-profile, banned-user, and owner-preview behavior remains unchanged.

## Validation and security

- Reuse existing project ownership helpers and error conventions.
- Apply explicit length and block-count limits consistent with nearby project/site editor constraints.
- Normalize and validate external URLs before persistence and rendering.
- Reuse the existing embed-host allowlist and keep it synchronized with `frame-src` CSP.
- Verify cover media belongs to the target project.
- Verify referenced devlogs belong to the project owner and target project.
- Ignore client-supplied ownership, state, timestamps, and publication metadata.
- Serialize only fields required by the editor or public renderer.
- Preserve existing authorization behavior for private projects and private profiles.

## Creator interface

The screen uses the established warm-black workspace tokens and existing typography rather than Figma’s generated raw values.

### Utility bar

- Current project title.
- Real status: draft, saving, saved time, conflict, or validation error.
- Preview action.
- Publish action.

### Document canvas

A centered measure approximately 680px wide contains:

- Replaceable project-media cover.
- Inline title.
- Inline summary.
- Category control.
- Inline opening description.
- Ordered document blocks.
- Empty-state block picker for text, link/embed, or build-log reference.

Blocks support add, edit, reorder, and delete. Controls use native inputs and existing components; no editor dependency is added.

### Inspector

- Public/private visibility.
- Show-in-feed toggle.
- Recent project-linked build logs.
- Selecting a build-log entry inserts a reference block; the preview list itself is not fabricated from account-wide entries.

### Responsive behavior

Desktop matches the Figma composition: workspace rail, document canvas, and 324px inspector. At narrower widths, the document remains readable and the inspector moves below it rather than compressing the editing measure beyond usability.

## Public renderer

Create one project-document renderer shared by draft preview and public display. It renders metadata, cover media, and each supported block kind.

If referenced media or a devlog entry disappears, render a non-interactive unavailable state or omit the missing optional asset; never crash the page. External links use the existing safe-link behavior. Embeds use validated stored URLs only.

The dedicated Feed and Public overhaul sections remain responsible for their broader visual redesigns. This section only adds the minimum public project-document output required to make publication real.

## Error behavior

- Autosave failure keeps local edits and exposes retry state.
- Revision conflict locks further save/publish operations until reload.
- Invalid block content is shown adjacent to the block.
- Failed cover upload leaves the previous cover selected.
- Publish failure preserves the prior public state.
- Missing project or lost ownership returns the existing not-found/forbidden behavior.

## Verification

### Server tests

Cover:

- Owner-only editor access, save, and publish.
- Lazy draft initialization without public mutation.
- Revision conflicts.
- Transactional rollback on publication failure.
- Public metadata synchronization.
- Cover-media ownership validation.
- URL and embed validation.
- Devlog ownership and project-link validation.
- Published-document serialization.
- Legacy-grid and legacy-renderer fallback before first document publish.
- Published-document precedence after publication.
- Existing private-project and private-profile behavior.

### UI tests

Cover:

- Initial loading and empty state.
- Autosave status transitions.
- Metadata editing.
- Add/edit/reorder/delete for each initial block kind.
- Inspector visibility/feed controls.
- Build-log insertion.
- Draft preview.
- Publish disablement during pending/invalid/conflict states.
- Conflict lockout.
- Legacy-layout link visibility.
- Responsive inspector placement.

### Live verification

Use the existing Playwright setup and real development database with account `pvtestms3i203e` and project “Swarm Ops”. Verify:

1. Existing public output before opening the creator.
2. Draft initialization and persistence after reload.
3. Cover and metadata editing.
4. Text, link/embed, and build-log blocks.
5. Preview without public changes.
6. Publication and public renderer switch.
7. Visibility and feed behavior.
8. Legacy grid data still exists after publication.

Mocked unit tests alone are not sufficient for completion.

## Out of scope

- GitHub API metadata or repository cards.
- Rich-text editor dependencies.
- Automatic legacy-grid migration or deletion.
- Permanent end-user switching between grid and document modes after publication.
- Gallery, quote, code, or arbitrary custom block types.
- Feed-section redesign.
- Public portfolio/project-page visual overhaul beyond document rendering support.
