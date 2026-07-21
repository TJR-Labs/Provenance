import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import type { GridBlock } from "~/lib/grid-layout";
import {
  getProfileGridEditorState,
  getProjectGridEditorState,
  GridLayoutConflictError,
  GridLayoutOwnershipError,
  GridLayoutUnavailableError,
  gridProjectSaveInputSchema,
  gridSaveInputSchema,
  publishProfileGrid,
  publishProjectGrid,
  saveProfileGridDraft,
  serializePublicGridLayout,
} from "~/server/grid-layouts";

type LayoutScope = "PROFILE" | "PROJECT";
type LayoutState = "DRAFT" | "PUBLISHED";

type StoredLayout = {
  id: string;
  ownerId: string;
  projectId: string | null;
  scope: LayoutScope;
  state: LayoutState;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

type StoredBlock = GridBlock & { id: string; layoutId: string };

type ProjectFixture = {
  id: string;
  userId: string;
  title: string;
  description: string;
  private: boolean;
  createdAt: Date;
  media: { url: string; mimeType: string | null; order: number }[];
};

const now = new Date("2026-07-20T12:00:00.000Z");

function textBlock(
  key: string,
  order: number,
  overrides: Partial<GridBlock> = {},
): GridBlock {
  return {
    key,
    order,
    type: "TEXT",
    x: 0,
    y: order,
    width: 2,
    height: 1,
    projectId: null,
    textContent: `Text ${order}`,
    imageUrl: null,
    imageMimeType: null,
    imageAlt: null,
    linkLabel: null,
    linkUrl: null,
    ...overrides,
  };
}

function imageBlock(
  key: string,
  order: number,
  overrides: Partial<GridBlock> = {},
): GridBlock {
  return textBlock(key, order, {
    type: "IMAGE",
    y: order * 2,
    width: 2,
    height: 2,
    textContent: null,
    ...overrides,
  });
}

function linkBlock(
  key: string,
  order: number,
  overrides: Partial<GridBlock> = {},
): GridBlock {
  return textBlock(key, order, {
    type: "LINK",
    textContent: null,
    ...overrides,
  });
}

function projectBlock(
  key: string,
  order: number,
  projectId: string,
  overrides: Partial<GridBlock> = {},
): GridBlock {
  return textBlock(key, order, {
    type: "PROJECT",
    y: order * 2,
    width: 3,
    height: 2,
    projectId,
    textContent: null,
    ...overrides,
  });
}

function storedLayout(
  id: string,
  scope: LayoutScope,
  state: LayoutState,
  revision: number,
  projectId: string | null = null,
): StoredLayout {
  return {
    id,
    ownerId: "user-1",
    projectId,
    scope,
    state,
    revision,
    createdAt: now,
    updatedAt: now,
  };
}

describe("grid layout input schemas", () => {
  it("accepts a complete project-save payload", () => {
    expect(
      gridProjectSaveInputSchema.safeParse({
        projectId: "project-1",
        expectedRevision: 4,
        blocks: [textBlock("project-text", 0)],
      }).success,
    ).toBe(true);
  });

  it("restricts projectId to PROJECT blocks while allowing selected and empty PROJECT blocks", () => {
    expect(
      gridSaveInputSchema.safeParse({
        expectedRevision: 0,
        blocks: [textBlock("crafted-text", 0, { projectId: "project-2" })],
      }).success,
    ).toBe(false);
    expect(
      gridSaveInputSchema.safeParse({
        expectedRevision: 0,
        blocks: [projectBlock("selected-project", 0, "project-1")],
      }).success,
    ).toBe(true);
    expect(
      gridSaveInputSchema.safeParse({
        expectedRevision: 0,
        blocks: [
          projectBlock("empty-project", 0, "project-1", { projectId: null }),
        ],
      }).success,
    ).toBe(true);
  });
});

describe("public grid layout serialization", () => {
  const privateProject = {
    id: "project-2",
    title: "Private project",
    description: "Must not leak",
    private: true,
    media: [{ url: "/private.png", mimeType: "image/png" }],
  };

  it("does not serialize a private project nested on a legacy non-PROJECT row", () => {
    const legacyText = textBlock("legacy-text", 0, {
      projectId: privateProject.id,
    });

    expect(
      serializePublicGridLayout(
        { blocks: [{ ...legacyText, project: privateProject }] },
        false,
      ),
    ).toEqual({ blocks: [legacyText], projects: [] });
  });

  it("excludes a private PROJECT row and project for a non-owner", () => {
    const privateProjectBlock = projectBlock(
      "private-project",
      0,
      privateProject.id,
    );

    expect(
      serializePublicGridLayout(
        { blocks: [{ ...privateProjectBlock, project: privateProject }] },
        false,
      ),
    ).toEqual({ blocks: [], projects: [] });
  });
});

function createMockDatabase({
  layouts = [
    storedLayout("profile-draft", "PROFILE", "DRAFT", 2),
    storedLayout("profile-public", "PROFILE", "PUBLISHED", 1),
    storedLayout("project-public", "PROJECT", "PUBLISHED", 4, "project-1"),
  ],
  blocks = [],
  projects = [
    {
      id: "project-1",
      userId: "user-1",
      title: "First project",
      description: "First description",
      private: false,
      createdAt: new Date("2026-07-20T10:00:00.000Z"),
      media: [{ url: "/first.png", mimeType: "image/png", order: 0 }],
    },
    {
      id: "project-2",
      userId: "user-1",
      title: "Second project",
      description: "Second description",
      private: true,
      createdAt: new Date("2026-07-20T11:00:00.000Z"),
      media: [],
    },
    {
      id: "foreign-project",
      userId: "user-2",
      title: "Foreign project",
      description: "Not owned",
      private: false,
      createdAt: now,
      media: [],
    },
  ],
}: {
  layouts?: StoredLayout[];
  blocks?: Array<{ layoutId: string; block: GridBlock }>;
  projects?: ProjectFixture[];
} = {}) {
  let layoutRows = layouts.map((layout) => ({ ...layout }));
  let blockRows: StoredBlock[] = blocks.map(({ layoutId, block }, index) => ({
    ...block,
    id: `block-${index + 1}`,
    layoutId,
  }));
  let failNextCreate = false;

  const gridLayout = {
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: Partial<
          Pick<StoredLayout, "id" | "ownerId" | "projectId" | "scope" | "state">
        >;
      }) => {
        const layout = layoutRows.find((candidate) =>
          Object.entries(where).every(
            ([key, value]) => candidate[key as keyof StoredLayout] === value,
          ),
        );
        if (!layout) return null;
        return {
          ...layout,
          blocks: blockRows
            .filter((block) => block.layoutId === layout.id)
            .sort((left, right) => left.order - right.order)
            .map((block) => ({ ...block })),
        };
      },
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { revision: number };
      }) => {
        const layout = layoutRows.find(
          (candidate) => candidate.id === where.id,
        );
        if (!layout) throw new Error("Layout not found");
        layout.revision = data.revision;
        return { ...layout };
      },
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; revision: number };
        data: { revision: { increment: number } };
      }) => {
        const layout = layoutRows.find(
          (candidate) =>
            candidate.id === where.id && candidate.revision === where.revision,
        );
        if (!layout) return { count: 0 };
        layout.revision += data.revision.increment;
        return { count: 1 };
      },
    ),
  };

  const gridBlock = {
    deleteMany: vi.fn(async ({ where }: { where: { layoutId: string } }) => {
      const before = blockRows.length;
      blockRows = blockRows.filter(
        (block) => block.layoutId !== where.layoutId,
      );
      return { count: before - blockRows.length };
    }),
    createMany: vi.fn(
      async ({ data }: { data: Array<GridBlock & { layoutId: string }> }) => {
        if (failNextCreate) {
          failNextCreate = false;
          throw new Error("simulated create failure");
        }
        for (const row of data) {
          blockRows.push({
            ...row,
            id: `block-${blockRows.length + 1}`,
          });
        }
        return { count: data.length };
      },
    ),
  };

  const project = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const match = projects.find((candidate) => candidate.id === where.id);
      return match ? { userId: match.userId } : null;
    }),
    findMany: vi.fn(
      async ({
        where,
        select,
      }: {
        where: { userId: string; id?: { in: string[] } };
        select: Record<string, unknown>;
      }) => {
        const matches = projects
          .filter(
            (candidate) =>
              candidate.userId === where.userId &&
              (!where.id || where.id.in.includes(candidate.id)),
          )
          .sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime(),
          );
        if (select.title) {
          return matches.map(
            ({ id, title, description, private: isPrivate, media }) => ({
              id,
              title,
              description,
              private: isPrivate,
              media: [...media]
                .sort((left, right) => left.order - right.order)
                .map(({ url, mimeType }) => ({ url, mimeType })),
            }),
          );
        }
        return matches.map(({ id }) => ({ id }));
      },
    ),
  };

  const database = {
    gridLayout,
    gridBlock,
    project,
    user: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(),
  };

  database.$transaction.mockImplementation(
    async (operation: (transaction: typeof database) => Promise<unknown>) => {
      const savedLayouts = layoutRows.map((layout) => ({ ...layout }));
      const savedBlocks = blockRows.map((block) => ({ ...block }));
      try {
        return await operation(database);
      } catch (error) {
        layoutRows = savedLayouts;
        blockRows = savedBlocks;
        throw error;
      }
    },
  );

  return {
    database: database as never,
    failNextCreate: () => {
      failNextCreate = true;
    },
    layouts: () => layoutRows.map((layout) => ({ ...layout })),
    mocks: {
      gridBlock,
      gridLayout,
      project,
      transaction: database.$transaction,
    },
    rows: (layoutId: string) =>
      blockRows
        .filter((block) => block.layoutId === layoutId)
        .sort((left, right) => left.order - right.order)
        .map(({ id: _id, layoutId: _layoutId, ...block }) => block),
  };
}

describe("grid layout persistence", () => {
  it("loads only the owner's profile draft and owned project options", async () => {
    const draft = textBlock("draft-text", 0);
    const published = textBlock("public-text", 0, { textContent: "Public" });
    const fixture = createMockDatabase({
      blocks: [
        { layoutId: "profile-draft", block: draft },
        { layoutId: "profile-public", block: published },
      ],
    });

    const editor = await getProfileGridEditorState("user-1", fixture.database);

    expect(editor).toEqual({
      scope: "profile",
      revision: 2,
      blocks: [draft],
      projects: [
        {
          id: "project-2",
          title: "Second project",
          description: "Second description",
          private: true,
          media: [],
        },
        {
          id: "project-1",
          title: "First project",
          description: "First description",
          private: false,
          media: [{ url: "/first.png", mimeType: "image/png" }],
        },
      ],
    });
    expect(editor).not.toHaveProperty("id");
    expect(editor).not.toHaveProperty("ownerId");
    expect(fixture.mocks.gridLayout.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerId: "user-1", scope: "PROFILE" }),
      }),
    );
  });

  it("reports an unavailable profile layout instead of reading another owner's rows", async () => {
    const foreign = {
      ...storedLayout("other-draft", "PROFILE", "DRAFT", 1),
      ownerId: "user-2",
    };
    const fixture = createMockDatabase({ layouts: [foreign] });

    await expect(
      getProfileGridEditorState("user-1", fixture.database),
    ).rejects.toBeInstanceOf(GridLayoutUnavailableError);
  });

  it("saves a profile draft without changing public rows and preserves empty shells", async () => {
    const oldDraft = textBlock("old-draft", 0);
    const oldPublic = textBlock("old-public", 0, { textContent: "Still live" });
    const emptyImage = imageBlock("empty-image", 0);
    const emptyLink = linkBlock("empty-link", 1, { x: 3 });
    const fixture = createMockDatabase({
      blocks: [
        { layoutId: "profile-draft", block: oldDraft },
        { layoutId: "profile-public", block: oldPublic },
      ],
    });

    const result = await saveProfileGridDraft(
      "user-1",
      { expectedRevision: 2, blocks: [emptyImage, emptyLink] },
      fixture.database,
    );

    expect(result).toEqual({ revision: 3, blocks: [emptyImage, emptyLink] });
    expect(fixture.rows("profile-draft")).toEqual([emptyImage, emptyLink]);
    expect(fixture.rows("profile-public")).toEqual([oldPublic]);
  });

  it("publishes a cleaned profile copy while retaining the exact local draft", async () => {
    const kept = textBlock("kept", 0, { textContent: "Publish me" });
    const empty = linkBlock("empty", 1, { x: 3 });
    const fixture = createMockDatabase();

    const result = await publishProfileGrid(
      "user-1",
      { expectedRevision: 2, blocks: [kept, empty] },
      fixture.database,
    );

    expect(result).toEqual({ revision: 3, blocks: [kept, empty] });
    expect(fixture.rows("profile-draft")).toEqual([kept, empty]);
    expect(fixture.rows("profile-public")).toEqual([kept]);
    expect(
      fixture.layouts().find((layout) => layout.id === "profile-public")
        ?.revision,
    ).toBe(3);
  });

  it("loads and publishes a project layout only for the project owner", async () => {
    const existing = textBlock("project-text", 0);
    const empty = imageBlock("empty-image", 1);
    const fixture = createMockDatabase({
      blocks: [{ layoutId: "project-public", block: existing }],
    });

    const editor = await getProjectGridEditorState(
      "project-1",
      "user-1",
      fixture.database,
    );
    expect(editor.scope).toBe("project");
    expect(editor.revision).toBe(4);
    expect(editor.blocks).toEqual([existing]);

    const result = await publishProjectGrid(
      "project-1",
      "user-1",
      { expectedRevision: 4, blocks: [existing, empty] },
      fixture.database,
    );
    expect(result).toEqual({ revision: 5, blocks: [existing, empty] });
    expect(fixture.rows("project-public")).toEqual([existing]);
  });

  it("distinguishes a missing project layout from a project owned by someone else", async () => {
    const fixture = createMockDatabase();

    await expect(
      getProjectGridEditorState("foreign-project", "user-1", fixture.database),
    ).rejects.toBeInstanceOf(GridLayoutOwnershipError);
    await expect(
      getProjectGridEditorState("missing", "user-1", fixture.database),
    ).rejects.toBeInstanceOf(GridLayoutUnavailableError);
    await expect(
      publishProjectGrid(
        "foreign-project",
        "user-1",
        { expectedRevision: 0, blocks: [] },
        fixture.database,
      ),
    ).rejects.toBeInstanceOf(GridLayoutOwnershipError);
    expect(fixture.mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a 51st block",
      Array.from({ length: 51 }, (_, index) => textBlock(`b-${index}`, index)),
    ],
    ["fractional geometry", [textBlock("bad", 0, { x: 0.5 })]],
    ["a negative row", [textBlock("bad", 0, { y: -1 })]],
    [
      "a block smaller than its type minimum",
      [projectBlock("bad", 0, "project-1", { width: 2 })],
    ],
    ["a block outside the 12-column grid", [textBlock("bad", 0, { x: 11 })]],
    [
      "colliding blocks",
      [textBlock("a", 0), textBlock("b", 1, { y: 0, x: 1 })],
    ],
    ["duplicate stable keys", [textBlock("same", 0), textBlock("same", 1)]],
    [
      "duplicate stable orders",
      [textBlock("a", 0), textBlock("b", 0, { y: 1 })],
    ],
  ])("rejects %s before opening a transaction", async (_label, blocks) => {
    const fixture = createMockDatabase();

    await expect(
      saveProfileGridDraft(
        "user-1",
        { expectedRevision: 2, blocks },
        fixture.database,
      ),
    ).rejects.toThrow();
    expect(fixture.mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects project references not owned by the layout owner", async () => {
    const fixture = createMockDatabase();

    await expect(
      saveProfileGridDraft(
        "user-1",
        {
          expectedRevision: 2,
          blocks: [projectBlock("foreign", 0, "foreign-project")],
        },
        fixture.database,
      ),
    ).rejects.toBeInstanceOf(GridLayoutOwnershipError);
    expect(fixture.mocks.transaction).not.toHaveBeenCalled();
  });

  it("detects a stale revision before deleting or recreating rows", async () => {
    const existing = textBlock("existing", 0);
    const fixture = createMockDatabase({
      blocks: [{ layoutId: "profile-draft", block: existing }],
    });

    await expect(
      saveProfileGridDraft(
        "user-1",
        { expectedRevision: 1, blocks: [textBlock("replacement", 0)] },
        fixture.database,
      ),
    ).rejects.toBeInstanceOf(GridLayoutConflictError);
    expect(fixture.mocks.gridBlock.deleteMany).not.toHaveBeenCalled();
    expect(fixture.mocks.gridBlock.createMany).not.toHaveBeenCalled();
    expect(fixture.rows("profile-draft")).toEqual([existing]);
  });

  it("preserves the old revision and rows when transactional replacement fails", async () => {
    const existing = textBlock("existing", 0);
    const fixture = createMockDatabase({
      blocks: [{ layoutId: "profile-draft", block: existing }],
    });
    fixture.failNextCreate();

    await expect(
      saveProfileGridDraft(
        "user-1",
        { expectedRevision: 2, blocks: [textBlock("replacement", 0)] },
        fixture.database,
      ),
    ).rejects.toThrow("simulated create failure");
    expect(fixture.rows("profile-draft")).toEqual([existing]);
    expect(
      fixture.layouts().find((layout) => layout.id === "profile-draft")
        ?.revision,
    ).toBe(2);
  });

  it.each([
    [
      "IMAGE",
      imageBlock("new", 0, { imageUrl: "https://example.com/new.png" }),
    ],
    ["LINK", linkBlock("new", 0, { linkUrl: "https://example.com" })],
  ] as const)(
    "rejects non-null content on a new %s shell",
    async (_type, block) => {
      const fixture = createMockDatabase();

      await expect(
        saveProfileGridDraft(
          "user-1",
          { expectedRevision: 2, blocks: [block] },
          fixture.database,
        ),
      ).rejects.toThrow(/read-only/i);
      expect(fixture.mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["image URL", "imageUrl", "https://example.com/changed.png"],
    ["image MIME", "imageMimeType", "image/webp"],
    ["image alt", "imageAlt", "Changed alt"],
    ["link label", "linkLabel", "Changed label"],
    ["link URL", "linkUrl", "https://example.com/changed"],
  ] as const)(
    "rejects edits to migrated %s content",
    async (_label, field, value) => {
      const migratedImage = imageBlock("migrated-image", 0, {
        imageUrl: "https://example.com/original.png",
        imageMimeType: "image/png",
        imageAlt: "Original alt",
      });
      const migratedLink = linkBlock("migrated-link", 1, {
        x: 3,
        linkLabel: "Original label",
        linkUrl: "https://example.com/original",
      });
      const fixture = createMockDatabase({
        blocks: [
          { layoutId: "profile-draft", block: migratedImage },
          { layoutId: "profile-draft", block: migratedLink },
        ],
      });
      const next = [migratedImage, migratedLink].map((block) =>
        field in block && block[field] !== null
          ? { ...block, [field]: value }
          : block,
      );

      await expect(
        saveProfileGridDraft(
          "user-1",
          { expectedRevision: 2, blocks: next },
          fixture.database,
        ),
      ).rejects.toThrow(/read-only/i);
      expect(fixture.mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it("allows migrated image/link geometry changes and deletion", async () => {
    const migratedImage = imageBlock("migrated-image", 0, {
      imageUrl: "https://example.com/original.png",
      imageMimeType: "image/png",
      imageAlt: "Original alt",
    });
    const migratedLink = linkBlock("migrated-link", 1, {
      x: 3,
      linkLabel: "Original label",
      linkUrl: "https://example.com/original",
    });
    const movedImage = { ...migratedImage, x: 4, y: 3 };
    const fixture = createMockDatabase({
      blocks: [
        { layoutId: "profile-draft", block: migratedImage },
        { layoutId: "profile-draft", block: migratedLink },
      ],
    });

    await expect(
      saveProfileGridDraft(
        "user-1",
        { expectedRevision: 2, blocks: [movedImage] },
        fixture.database,
      ),
    ).resolves.toEqual({ revision: 3, blocks: [movedImage] });
    expect(fixture.rows("profile-draft")).toEqual([movedImage]);
  });
});
