# Project Document Creator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing form-first project editor with the real Figma screen 09 document creator while preserving every legacy project grid until an owner explicitly publishes a document.

**Architecture:** Add dedicated draft/published project-document records and ordered typed blocks, exposed through a focused service and tRPC router. The editor autosaves revisioned drafts and shares one renderer with draft preview and the public project page; publication atomically snapshots the draft and synchronizes existing `Project` metadata. Existing `GridLayout` and legacy rendering remain unchanged fallbacks until the first document publish.

**Tech Stack:** Next.js App Router, React, TypeScript, tRPC, Prisma/PostgreSQL, Zod, Tailwind CSS with existing Provenance tokens, Vitest/Testing Library, Playwright.

## Global Constraints

- Do not add dependencies.
- Reuse `WorkspaceRail`, semantic Tailwind tokens, current fonts, upload infrastructure, `safeExternalUrl`, and the site embed allowlist/CSP.
- Project documents support only `TEXT`, `LINK`, `EMBED`, and `DEVLOG` blocks in this pass.
- Text blocks are multiline plain text rendered with preserved line breaks; do not introduce a rich-text framework.
- GitHub URLs remain ordinary link blocks.
- Keep project `GridLayout`/`GridBlock` rows untouched and use them as public fallback until a document is published.
- Preserve existing project/private-profile/banned-user authorization by keeping `getPublicProject` as the public gate.
- Existing account-wide devlogs remain valid; `DevlogEntry.projectId` is nullable and uses `onDelete: SetNull`.
- A newly uploaded draft cover must not appear in the legacy public media list before document publication. Store it as `ProjectMedia.documentOnly = true`; existing media remain `false`.
- Use optimistic draft revisions. Conflicts must lock save and publish until reload; never overwrite another tab.
- Publishing must be transactional and must preserve the previous public state on failure.
- Use Codex `gpt-5.6-sol` with high reasoning for code-writing tasks; if unavailable, use an Agent with model `opus` as the documented fallback.
- Commit after every task once its focused checks pass. Do not stage unrelated files.
- Final verification must include the real development database and Playwright account `pvtestms3i203e`; mocked tests alone are insufficient.

---

## File map

### New files

- `prisma/migrations/20260728020000_project_documents/migration.sql` — project-document schema migration.
- `src/lib/project-document.ts` — block/draft types, constants, Zod validation, and URL normalization.
- `src/lib/project-document.test.ts` — validation unit tests.
- `src/server/project-documents.ts` — owner draft lifecycle, publication transaction, serialization, and cover attachment.
- `src/server/project-documents.test.ts` — service and database-behavior tests.
- `src/server/api/routers/project-document.ts` — authenticated tRPC adapter and error translation.
- `src/app/project-document-renderer.tsx` — shared draft/public renderer.
- `src/app/project-document-renderer.test.tsx` — safe rendering and missing-reference tests.
- `src/app/(protected)/projects/[id]/edit/use-project-document-autosave.ts` — debounce/revision/conflict state machine.
- `src/app/(protected)/projects/[id]/edit/use-project-document-autosave.test.ts` — deterministic autosave tests.
- `src/app/(protected)/projects/[id]/edit/project-document-editor.tsx` — creator shell, metadata, blocks, inspector, preview, and publishing.
- `src/app/(protected)/projects/[id]/edit/project-document-editor.test.tsx` — editor interaction tests.

### Modified files

- `prisma/schema.prisma` — new enums/models/relations plus `Project.summary`, `ProjectMedia.documentOnly`, and nullable devlog project relation.
- `src/server/api/root.ts` — register `projectDocumentRouter`.
- `src/server/api/routers/devlog.ts` — accept project association and expose project-filtered entries where required.
- `src/server/devlog.ts` — validate project ownership when creating/listing project-linked entries.
- `src/server/devlog.test.ts` — project-linked/account-wide behavior.
- `src/server/projects.ts` — include published documents and filter document-only media without changing authorization.
- `src/server/projects.test.ts` — document precedence and legacy fallback regression coverage.
- `src/app/projects/[id]/page.tsx` — select `ProjectDocumentRenderer` before grid/legacy renderers.
- `src/app/(protected)/projects/[id]/edit/page.tsx` — load and render the new owner-only creator.
- `src/app/(protected)/projects/project-form.tsx` — preserve document-only media when legacy project data is updated.
- `src/app/layout.tsx` — workspace chrome predicate for project creator routes.
- `src/app/workspace-rail.tsx` — Build active-route predicate.
- `src/middleware.ts` — only if tests show the existing workspace pathname propagation excludes project edit routes; embed CSP already exists and must not be duplicated.

---

### Task 1: Project-document schema and validation contract

**Files:**
- Create: `src/lib/project-document.ts`
- Create: `src/lib/project-document.test.ts`
- Create: `prisma/migrations/20260728020000_project_documents/migration.sql`
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `ProjectDocumentBlockInput`, `ProjectDocumentDraftInput`, `projectDocumentBlockInputSchema`, `projectDocumentDraftInputSchema`, `normalizeProjectDocumentDraft(raw)`.
- Produces Prisma models `ProjectDocument`, `ProjectDocumentBlock` and enum values `ProjectDocumentState.DRAFT/PUBLISHED`, `ProjectDocumentBlockKind.TEXT/LINK/EMBED/DEVLOG`.
- Later tasks rely on `ProjectMedia.documentOnly`, `Project.summary`, and `DevlogEntry.projectId`.

- [ ] **Step 1: Write failing validation tests**

Create `src/lib/project-document.test.ts` with focused cases:

```ts
import { describe, expect, it } from "vitest";
import { normalizeProjectDocumentDraft } from "./project-document";

describe("normalizeProjectDocumentDraft", () => {
  it("normalizes safe links and preserves deterministic block order", () => {
    const draft = normalizeProjectDocumentDraft({
      title: " Swarm Ops ",
      summary: " Field runtime ",
      description: "Coordination layer",
      category: "SOFTWARE",
      coverMediaId: null,
      private: false,
      excludeFromFeed: false,
      blocks: [
        { key: "b", order: 1, kind: "LINK", linkLabel: "Repo", linkUrl: "https://github.com/acme/swarm" },
        { key: "a", order: 0, kind: "TEXT", textContent: "First" },
      ],
    });

    expect(draft.title).toBe("Swarm Ops");
    expect(draft.summary).toBe("Field runtime");
    expect(draft.blocks.map((block) => block.key)).toEqual(["a", "b"]);
    expect(draft.blocks[1]?.linkUrl).toBe("https://github.com/acme/swarm");
  });

  it("rejects unsupported embed hosts", () => {
    expect(() =>
      normalizeProjectDocumentDraft({
        title: "Swarm Ops",
        summary: null,
        description: "Coordination layer",
        category: "SOFTWARE",
        coverMediaId: null,
        private: false,
        excludeFromFeed: false,
        blocks: [{ key: "embed", order: 0, kind: "EMBED", embedUrl: "https://example.com/frame" }],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests and verify the missing module/export failure**

Run:

```powershell
npx vitest run src/lib/project-document.test.ts
```

Expected: FAIL because `src/lib/project-document.ts` does not exist.

- [ ] **Step 3: Define schema models and relations**

Add:

```prisma
enum ProjectDocumentState {
  DRAFT
  PUBLISHED
}

enum ProjectDocumentBlockKind {
  TEXT
  LINK
  EMBED
  DEVLOG
}
```

Add `Project.summary String?`, `Project.documents ProjectDocument[]`, `ProjectMedia.documentOnly Boolean @default(false)`, document-cover relations, and nullable `DevlogEntry.projectId` with `onDelete: SetNull` and `@@index([projectId, createdAt])`.

Define `ProjectDocument` with `@@unique([projectId, state])`, revision/timestamps, metadata snapshot, cover relation, and cascading blocks. Define `ProjectDocumentBlock` with stable `key`, `order`, typed nullable content columns, optional devlog relation, `@@unique([documentId, key])`, and `@@unique([documentId, order])`.

Use `onDelete: SetNull` for cover media and devlog references so deleting either optional resource cannot crash the document.

- [ ] **Step 4: Write the migration SQL**

Create `prisma/migrations/20260728020000_project_documents/migration.sql` using the exact enum/table/column/index names generated by Prisma for the schema. Include:

- `Project.summary`
- `ProjectMedia.documentOnly NOT NULL DEFAULT false`
- nullable `DevlogEntry.projectId`
- document enums and tables
- unique/index constraints
- cascade from project → documents → blocks
- `SET NULL` for project → devlog, media → cover, and devlog → document block

Generate the SQL with Prisma rather than hand-guessing identifiers:

```powershell
npx prisma migrate dev --name project_documents --create-only
```

If Prisma creates a different timestamped directory, keep that generated directory and remove the preselected empty path from the plan implementation.

- [ ] **Step 5: Implement validation without new dependencies**

In `src/lib/project-document.ts`:

- Define maximums explicitly: title 120, summary 240, description 10,000, 50 blocks, text 20,000, link label 120, URL 2,048.
- Use discriminated Zod block schemas.
- Reuse `safeExternalUrl` behavior for links and `isAllowedEmbedUrl` for embeds.
- Require contiguous unique orders `0..n-1` and unique non-empty keys.
- Clear fields that do not belong to a block’s kind.
- Return a normalized draft sorted by order.

- [ ] **Step 6: Validate Prisma and pass unit tests**

Run:

```powershell
npx prisma format
npx prisma validate
npx prisma generate
npx vitest run src/lib/project-document.test.ts
```

Expected: all commands succeed and the test file passes.

- [ ] **Step 7: Commit the contract**

```powershell
git add prisma/schema.prisma prisma/migrations src/lib/project-document.ts src/lib/project-document.test.ts
git commit -m "feat: add project document schema"
```

---

### Task 2: Draft lifecycle and atomic publication service

**Files:**
- Create: `src/server/project-documents.ts`
- Create: `src/server/project-documents.test.ts`
- Modify: `src/server/projects.ts`
- Test: `src/server/projects.test.ts`

**Interfaces:**
- Consumes: normalized contract from `src/lib/project-document.ts` and generated Prisma types.
- Produces:

```ts
getProjectDocumentEditorState(projectId: string, userId: string, database?: PrismaClient): Promise<ProjectDocumentEditorState>
saveProjectDocumentDraft(projectId: string, userId: string, expectedRevision: number, rawDraft: unknown, database?: PrismaClient): Promise<ProjectDocumentEditorState>
publishProjectDocument(projectId: string, userId: string, expectedRevision: number, database?: PrismaClient): Promise<ProjectDocumentEditorState>
attachProjectDocumentCover(projectId: string, userId: string, media: UploadedProjectMediaInput, database?: PrismaClient): Promise<ProjectDocumentCoverOption>
serializePublicProjectDocument(document: ProjectDocumentWithBlocks): PublicProjectDocument
```

- Produces: `ProjectDocumentConflictError`, `ProjectDocumentOwnershipError`, `ProjectDocumentValidationError`.

- [ ] **Step 1: Write failing service tests**

Create tests using the same injected-database/mock style as `src/server/site-editor.test.ts`. Cover at minimum:

```ts
it("seeds a draft without creating published state or changing the project", async () => {
  const state = await getProjectDocumentEditorState("project-1", "owner-1", db);
  expect(state.draft.title).toBe("Swarm Ops");
  expect(state.draft.revision).toBe(0);
  expect(db.projectDocument.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ state: "DRAFT" }),
  }));
  expect(db.project.update).not.toHaveBeenCalled();
});

it("rejects a stale revision without writing", async () => {
  await expect(saveProjectDocumentDraft("project-1", "owner-1", 4, validDraft, db))
    .rejects.toBeInstanceOf(ProjectDocumentConflictError);
  expect(db.$transaction).not.toHaveBeenCalled();
});

it("publishes the snapshot and project metadata in one transaction", async () => {
  const state = await publishProjectDocument("project-1", "owner-1", 3, db);
  expect(state.publishedAt).toBeTruthy();
  expect(transaction.project.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ title: "Swarm Ops", summary: "Field runtime" }),
  }));
});
```

Also test foreign cover media, foreign/unlinked devlogs, failed transaction rollback, deleted optional references, and legacy grid rows never being updated/deleted.

- [ ] **Step 2: Run service tests and verify failure**

```powershell
npx vitest run src/server/project-documents.test.ts
```

Expected: FAIL because the service module is missing.

- [ ] **Step 3: Implement owner lookup and lazy draft seeding**

Use a single ownership query that loads project metadata, non-document-only media, existing draft/published documents, and recent project-linked devlogs. Throw `ProjectDocumentOwnershipError` for a project not owned by `userId` using existing project error semantics.

When no draft exists, create one with current metadata, first compatible public project media as cover, and no blocks. Do not write `Project`, `GridLayout`, or published state.

- [ ] **Step 4: Implement revisioned complete-snapshot saves**

Normalize the complete draft payload first. Verify cover media belongs to the target project and each devlog block references an entry where both `userId` and `projectId` match.

Inside a transaction:

1. `updateMany` the draft with `(id, revision: expectedRevision)` and increment revision.
2. Throw `ProjectDocumentConflictError` if count is zero.
3. Replace draft blocks in normalized order.
4. Reload and serialize authoritative state.

Do not update `Project` during draft save.

- [ ] **Step 5: Implement document-only cover attachment**

Reuse the validated upload-input shape from `src/server/projects.ts`. Consume the uploaded asset into a `ProjectMedia` row with `documentOnly: true` only after ownership/storage checks pass. Return only `{ id, url, mimeType, kind }`.

Update legacy project media replacement/deletion logic in `src/server/projects.ts` so it operates only on `documentOnly: false` rows and cannot remove draft/published document covers.

- [ ] **Step 6: Implement atomic publish and serialization**

Within one transaction:

1. Reload and validate the draft at `expectedRevision`.
2. Verify all optional references again.
3. Upsert the `PUBLISHED` document metadata.
4. Replace published blocks with the draft snapshot.
5. Update `Project.title`, `summary`, `description`, `category`, `private`, and `excludeFromFeed`.
6. Stamp `publishedAt` and return editor state.

Do not mutate or delete project `GridLayout`/`GridBlock` rows.

- [ ] **Step 7: Pass service and project regression tests**

```powershell
npx vitest run src/server/project-documents.test.ts src/server/projects.test.ts
```

Expected: PASS, including explicit assertions that draft saves leave public project fields and legacy grids unchanged.

- [ ] **Step 8: Commit the service**

```powershell
git add src/server/project-documents.ts src/server/project-documents.test.ts src/server/projects.ts src/server/projects.test.ts
git commit -m "feat: add project document lifecycle"
```

---

### Task 3: tRPC document API and project-linked devlogs

**Files:**
- Create: `src/server/api/routers/project-document.ts`
- Modify: `src/server/api/root.ts`
- Modify: `src/server/devlog.ts`
- Modify: `src/server/devlog.test.ts`
- Modify: `src/server/api/routers/devlog.ts`

**Interfaces:**
- Consumes: Task 2 service functions/errors.
- Produces router namespace:
  - `api.projectDocument.getEditorState.useQuery({ projectId })`
  - `api.projectDocument.saveDraft.useMutation()` with `{ projectId, expectedRevision, draft }`
  - `api.projectDocument.attachCover.useMutation()` with validated uploaded-media input
  - `api.projectDocument.publish.useMutation()` with `{ projectId, expectedRevision }`
- Extends devlog create/list service with optional `projectId` while preserving existing callers.

- [ ] **Step 1: Write failing devlog ownership tests**

In `src/server/devlog.test.ts`, add cases proving:

```ts
await createDevlogEntry("owner-1", {
  projectId: "project-1",
  label: "V0.4",
  body: "Failover path holds.",
}, db);

expect(db.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({
  where: { id: "project-1", userId: "owner-1" },
}));
```

Also assert foreign project IDs are rejected and omitting `projectId` still creates an account-wide entry.

- [ ] **Step 2: Run the tests and verify failure**

```powershell
npx vitest run src/server/devlog.test.ts
```

Expected: FAIL because the current devlog input has no `projectId` behavior.

- [ ] **Step 3: Extend the devlog service/router**

Add optional `projectId` to the existing Zod input. When present, verify project ownership before create. Add a project-filtered list used by the editor that returns only entries matching both owner and project, newest first. Preserve the existing account-wide list unchanged.

- [ ] **Step 4: Add project-document router error mapping and rate limits**

Map:

- ownership → `FORBIDDEN`
- conflict → `CONFLICT`
- validation → `BAD_REQUEST`
- missing project/document → existing `NOT_FOUND` convention

Use the existing authenticated mutation rate-limit configuration rather than inventing a second limiter policy. Register the router as `projectDocument` in `src/server/api/root.ts`.

- [ ] **Step 5: Run focused API/service tests and typecheck**

```powershell
npx vitest run src/server/devlog.test.ts src/server/project-documents.test.ts
npm run check
```

Expected: PASS.

- [ ] **Step 6: Commit the API**

```powershell
git add src/server/api/routers/project-document.ts src/server/api/root.ts src/server/devlog.ts src/server/devlog.test.ts src/server/api/routers/devlog.ts
git commit -m "feat: expose project document API"
```

---

### Task 4: Public document precedence and shared renderer

**Files:**
- Create: `src/app/project-document-renderer.tsx`
- Create: `src/app/project-document-renderer.test.tsx`
- Modify: `src/server/projects.ts`
- Modify: `src/server/projects.test.ts`
- Modify: `src/app/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `PublicProjectDocument` from Task 2.
- Produces:

```ts
export function ProjectDocumentRenderer(props: {
  document: PublicProjectDocument;
  preview?: boolean;
}): JSX.Element
```

- Extends `getPublicProject` response with nullable `document`; it remains the sole authorization gate.

- [ ] **Step 1: Write failing resolver precedence tests**

Add cases to `src/server/projects.test.ts`:

```ts
it("returns a published document before the legacy grid", async () => {
  const project = await getPublicProject("project-1", undefined, db);
  expect(project.document?.title).toBe("Swarm Ops");
  expect(project.publishedGrid).toBeUndefined();
});

it("keeps the published grid when no document exists", async () => {
  const project = await getPublicProject("project-1", undefined, dbWithoutDocument);
  expect(project.document).toBeNull();
  expect(project.publishedGrid?.blocks).toHaveLength(1);
});
```

Retain existing private-project, private-profile, banned-user, and owner-view cases.

- [ ] **Step 2: Write failing renderer tests**

Test text line breaks, safe external links, allowlisted embeds, project build logs, and omitted/unavailable deleted references. Assert unsafe links never become clickable and missing optional cover/devlog data does not throw.

- [ ] **Step 3: Run tests and verify failure**

```powershell
npx vitest run src/server/projects.test.ts src/app/project-document-renderer.test.tsx
```

Expected: FAIL because document selection/renderer do not exist.

- [ ] **Step 4: Integrate document selection after authorization**

Keep all current authorization checks first. Query the published document only after the viewer is allowed. Filter `Project.media` used by legacy output to `documentOnly: false`. Return exactly one of:

- `document`
- `publishedGrid`
- legacy fields/media

Do not expose draft records or revision metadata publicly.

- [ ] **Step 5: Implement the shared renderer**

Use existing semantic classes and typography. Render:

- cover via existing media handling
- title, summary, category, description
- text with `whitespace-pre-wrap`
- links through `safeExternalUrl`
- embeds only from already validated allowlisted URLs
- devlog label/date/body without owner-only metadata

Use the same component for preview and public output; `preview` may add creator-only visual boundaries but must not change content semantics.

- [ ] **Step 6: Switch the public page with fallback intact**

In `src/app/projects/[id]/page.tsx`:

```tsx
if (project.document) {
  return <ProjectDocumentRenderer document={project.document} />;
}

if (project.publishedGrid) {
  return <GridLayoutRenderer layout={project.publishedGrid} />;
}
```

Leave the existing legacy renderer path after those branches.

- [ ] **Step 7: Pass public regression tests**

```powershell
npx vitest run src/server/projects.test.ts src/app/project-document-renderer.test.tsx src/app/grid-layout-renderer.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit public rendering**

```powershell
git add src/server/projects.ts src/server/projects.test.ts src/app/project-document-renderer.tsx src/app/project-document-renderer.test.tsx src/app/projects/[id]/page.tsx
git commit -m "feat: render published project documents"
```

---

### Task 5: Revision-aware autosave state machine

**Files:**
- Create: `src/app/(protected)/projects/[id]/edit/use-project-document-autosave.ts`
- Create: `src/app/(protected)/projects/[id]/edit/use-project-document-autosave.test.ts`

**Interfaces:**
- Produces:

```ts
type ProjectDocumentSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

function createProjectDocumentAutosaveController<T>(options: {
  delayMs: number;
  initialRevision: number;
  save: (draft: T, expectedRevision: number) => Promise<{ revision: number; savedAt: string }>;
  onStatus: (state: { status: ProjectDocumentSaveStatus; revision: number; savedAt: string | null; error: string | null }) => void;
}): {
  update(draft: T): void;
  flush(): Promise<void>;
  dispose(): void;
}
```

- The React editor may wrap this controller in `useProjectDocumentAutosave`; tests target the deterministic controller directly.

- [ ] **Step 1: Write failing fake-timer tests**

Cover:

- many updates collapse into one save with the latest draft
- successful save advances revision and timestamp
- edits made during an in-flight save trigger one follow-up save
- ordinary errors retain dirty content and allow retry
- conflict enters terminal conflict state and suppresses later writes
- `flush()` waits for the current/latest save
- `dispose()` cancels pending timers

Example:

```ts
it("locks after a revision conflict", async () => {
  const save = vi.fn().mockRejectedValue(Object.assign(new Error("Conflict"), { data: { code: "CONFLICT" } }));
  const controller = createProjectDocumentAutosaveController({ delayMs: 10, initialRevision: 2, save, onStatus });

  controller.update(draft);
  await vi.advanceTimersByTimeAsync(10);
  controller.update(nextDraft);
  await vi.advanceTimersByTimeAsync(10);

  expect(save).toHaveBeenCalledTimes(1);
  expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ status: "conflict" }));
});
```

- [ ] **Step 2: Run tests and verify failure**

```powershell
npx vitest run "src/app/(protected)/projects/[id]/edit/use-project-document-autosave.test.ts"
```

Expected: FAIL because the controller module is missing.

- [ ] **Step 3: Implement the smallest state machine**

Use one timer, one in-flight promise, one latest-draft slot, and one conflict boolean. Do not add a state library. Detect tRPC conflicts by the mutation error’s `data.code === "CONFLICT"` while accepting a narrow injectable predicate if current tests require it.

- [ ] **Step 4: Pass autosave tests**

```powershell
npx vitest run "src/app/(protected)/projects/[id]/edit/use-project-document-autosave.test.ts"
```

Expected: PASS.

- [ ] **Step 5: Commit autosave**

```powershell
git add "src/app/(protected)/projects/[id]/edit/use-project-document-autosave.ts" "src/app/(protected)/projects/[id]/edit/use-project-document-autosave.test.ts"
git commit -m "feat: add project document autosave"
```

---

### Task 6: Creator shell, metadata, cover, and inspector

**Files:**
- Create: `src/app/(protected)/projects/[id]/edit/project-document-editor.tsx`
- Create: `src/app/(protected)/projects/[id]/edit/project-document-editor.test.tsx`
- Modify: `src/app/(protected)/projects/[id]/edit/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/workspace-rail.tsx`
- Modify: `src/app/(protected)/projects/project-form.tsx`

**Interfaces:**
- Consumes: project-document tRPC procedures, autosave controller, `uploadFileDirect(file, "project-media")`, and `ProjectDocumentRenderer`.
- Produces the complete Figma screen shell and editable metadata/inspector. Task 7 fills block operations and preview/publish behavior in the same component.

- [ ] **Step 1: Write failing shell interaction tests**

Mock tRPC at the same boundary used by nearby editor tests. Assert:

- Workspace utility bar shows title and real save status.
- Editing title/summary/description/category marks the draft dirty and saves the complete snapshot.
- Visibility and show-in-feed update the draft, not public project mutations.
- Selecting existing media changes `coverMediaId`.
- Uploading a new cover calls `uploadFileDirect`, then `attachCover`, and retains the previous cover if either fails.
- Project-linked devlogs populate the inspector; account-wide entries do not.
- Inspector stacks below the canvas at the project’s established narrow breakpoint.

- [ ] **Step 2: Run editor tests and verify failure**

```powershell
npx vitest run "src/app/(protected)/projects/[id]/edit/project-document-editor.test.tsx"
```

Expected: FAIL because the editor component is missing.

- [ ] **Step 3: Replace the edit page loader**

Keep owner authentication on the server page. Fetch `projectDocument.getEditorState({ projectId })`; map ownership/missing errors through the existing protected-page conventions. Pass only serialized editor state into the client component.

Do not render the old `ProjectForm` on `/projects/[id]/edit`. Keep it for project creation and any remaining explicit legacy path.

- [ ] **Step 4: Build the Figma shell with existing tokens**

Implement:

- 56px utility bar with project title, save status, Preview, Publish
- centered 680px document measure
- 324px inspector on desktop
- existing workspace rail supplied by root layout
- responsive inspector below the document

Reuse `bg-canvas`, `bg-surface`, `text-ink`, `text-muted`, border tokens, Archivo/Schibsted/IBM Plex classes already established in the app. Do not paste Figma raw hex values.

- [ ] **Step 5: Add metadata and inspector controls**

Use controlled native inputs for title, summary, category, description, privacy, and feed inclusion. Wire every change into one normalized draft object passed to autosave.

Render project-linked devlog preview rows with real dates/labels/bodies. Do not synthesize entries.

- [ ] **Step 6: Add safe cover selection/upload**

Existing media options come from editor state. New uploads:

1. `uploadFileDirect(file, "project-media")`
2. `projectDocument.attachCover` with returned storage metadata
3. select returned document-only media ID
4. autosave the changed draft

On error, retain the prior cover selection and show an inline retryable message.

- [ ] **Step 7: Update workspace route predicates**

In `src/app/layout.tsx`, recognize only `/projects/new`, `/projects/:id/edit`, and `/projects/:id/layout` as workspace project routes; do not hide global chrome on public `/projects/:id`.

In `workspace-rail.tsx`, use the same route predicate for Build active state. Add focused route-predicate tests if these predicates are extracted; otherwise cover through existing component tests.

Update legacy `ProjectForm` media replacement so it preserves `documentOnly: true` records through the server behavior introduced in Task 2.

- [ ] **Step 8: Pass editor shell and existing form tests**

```powershell
npx vitest run "src/app/(protected)/projects/[id]/edit/project-document-editor.test.tsx" "src/app/(protected)/projects/project-form.test.tsx"
```

Expected: PASS.

- [ ] **Step 9: Commit creator shell**

```powershell
git add "src/app/(protected)/projects/[id]/edit" src/app/layout.tsx src/app/workspace-rail.tsx "src/app/(protected)/projects/project-form.tsx"
git commit -m "feat: build project document creator shell"
```

---

### Task 7: Document blocks, draft preview, and publish behavior

**Files:**
- Modify: `src/app/(protected)/projects/[id]/edit/project-document-editor.tsx`
- Modify: `src/app/(protected)/projects/[id]/edit/project-document-editor.test.tsx`
- Modify: `src/app/project-document-renderer.tsx`
- Test: `src/app/project-document-renderer.test.tsx`

**Interfaces:**
- Consumes: the four block contract variants, autosave `flush()`, preview renderer, and publish mutation.
- Produces complete screen 09 behavior.

- [ ] **Step 1: Add failing block-operation tests**

Cover each operation with observable serialized output:

- Add text, link, embed, and devlog blocks from empty-state picker.
- Edit each block’s valid fields.
- Reject unsafe link/unsupported embed inline without autosaving invalid data.
- Move blocks up/down and rewrite contiguous orders.
- Delete a block and compact orders.
- Insert a devlog only from inspector entries linked to this project.
- Preserve stable block keys across edits/reorders.

- [ ] **Step 2: Add failing preview/publish tests**

Assert:

- Preview uses current local draft without invoking publish.
- Publish waits for `flush()` and is disabled during save, validation error, or conflict.
- Successful publish updates revision/timestamp/status.
- Failed publish leaves editor content and prior published state intact.
- Legacy layout link appears only when `hasPublishedDocument === false` and `hasLegacyGrid === true`.

- [ ] **Step 3: Run tests and verify failure**

```powershell
npx vitest run "src/app/(protected)/projects/[id]/edit/project-document-editor.test.tsx"
```

Expected: FAIL on missing block/preview/publish controls.

- [ ] **Step 4: Implement ordered block editing without abstractions**

Keep block manipulation as small pure functions adjacent to the editor or in `src/lib/project-document.ts` if shared by tests:

```ts
const reorderBlocks = (blocks: ProjectDocumentBlockInput[], from: number, to: number) =>
  arrayMove(blocks, from, to).map((block, order) => ({ ...block, order }));
```

If no installed `arrayMove` exists, implement the three-line `slice/splice` version locally; do not add a dependency or generic collection library.

Use native textarea/input/select controls. Render inline validation from the same Zod contract used server-side.

- [ ] **Step 5: Implement draft preview**

Open a creator-owned preview panel/modal that renders the current normalized draft through `ProjectDocumentRenderer` with `preview`. It must not call publish or alter `Project` metadata.

- [ ] **Step 6: Implement guarded publishing**

Before publish:

1. validate local draft
2. await autosave `flush()`
3. stop if status is error/conflict
4. call publish with the controller’s authoritative revision
5. replace local editor state with the returned authoritative state

Show a specific conflict/reload message for `CONFLICT`; show retryable inline errors for other failures.

- [ ] **Step 7: Pass editor and renderer tests**

```powershell
npx vitest run "src/app/(protected)/projects/[id]/edit/project-document-editor.test.tsx" src/app/project-document-renderer.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit complete creator behavior**

```powershell
git add "src/app/(protected)/projects/[id]/edit/project-document-editor.tsx" "src/app/(protected)/projects/[id]/edit/project-document-editor.test.tsx" src/app/project-document-renderer.tsx src/app/project-document-renderer.test.tsx
git commit -m "feat: add project document blocks and publishing"
```

---

### Task 8: Real-database migration and end-to-end verification

**Files:**
- Modify only files required by defects found during verification.
- Update tests adjacent to every corrected defect.

**Interfaces:**
- Consumes the completed creator and existing reusable account.
- Produces verified development-database migration and browser walkthrough evidence.

- [ ] **Step 1: Run all focused suites**

```powershell
npx vitest run src/lib/project-document.test.ts src/server/project-documents.test.ts src/server/devlog.test.ts src/server/projects.test.ts src/app/project-document-renderer.test.tsx "src/app/(protected)/projects/[id]/edit/use-project-document-autosave.test.ts" "src/app/(protected)/projects/[id]/edit/project-document-editor.test.tsx" src/app/grid-layout-renderer.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run repository checks**

```powershell
npm test
npm run check
```

Expected: PASS. If the pre-existing CRLF/LF formatting mismatch is the only unrelated failure, record the exact output and run formatting only on changed files; do not reformat the repository.

- [ ] **Step 3: Apply the migration to the real development database**

```powershell
npm run db:migrate
```

Expected: migration applies successfully and Prisma reports the database up to date.

- [ ] **Step 4: Start the app using the existing project run/Playwright workflow**

Use the repository’s established dev-server command and Playwright setup. Do not substitute curl smoke checks.

Log in with:

- username: `pvtestms3i203e`
- password: `supersecretpw`
- project: `Swarm Ops`

- [ ] **Step 5: Verify legacy fallback before editor publication**

Record the current `/projects/[id]` output. Open `/projects/[id]/edit`, allow lazy draft initialization, reload, and confirm:

- draft content persists
- public project output is unchanged
- legacy grid records remain present

- [ ] **Step 6: Verify the creator against the real database**

Exercise:

- cover replacement/upload
- title, summary, category, and description
- visibility and show-in-feed controls
- text block
- GitHub URL as ordinary link block
- one allowlisted embed
- project-linked devlog creation/insertion
- block reorder/delete
- reload after autosave
- draft preview without public changes

- [ ] **Step 7: Publish and verify public precedence**

Publish, then confirm:

- `/projects/[id]` renders the document
- metadata/feed/privacy reflect the published snapshot
- legacy grid rows still exist
- draft-only/document-only cover media did not appear in the old public fallback before publish
- missing/deleted optional references do not crash rendering

- [ ] **Step 8: Fix only reproduced defects and rerun the narrowest checks**

For each defect, first add the smallest failing regression test, then implement the fix and rerun that test plus the affected focused suite. Do not fold unrelated cleanup into this task.

- [ ] **Step 9: Run final verification and commit fixes**

```powershell
npm test
npm run check
git status --short
```

Expected: tests/check pass and status contains only intentional verification fixes, if any.

If fixes were required:

```powershell
git add <only-the-files-changed-for-verified-defects>
git commit -m "fix: harden project document creator"
```

Replace the command’s file list with the exact changed paths shown by `git status`; never use `git add -A`.

---

## Completion criteria

- Screen 09 is the real owner project editor at `/projects/[id]/edit`.
- Draft metadata and all four block kinds autosave with visible real status.
- Revision conflicts prevent overwrites and publishing.
- Preview renders local draft without public mutation.
- Publish atomically snapshots the document and synchronizes public project metadata.
- Public rendering prefers the published document, then existing project grid, then legacy fields.
- Existing grid rows survive document creation and publication.
- New draft cover media cannot leak into legacy public output.
- Project-linked and account-wide devlogs both behave correctly.
- Existing privacy, profile privacy, banned-user, and owner-view behavior still passes.
- Focused tests, full tests, type/lint checks, real DB migration, and Playwright walkthrough all pass.
