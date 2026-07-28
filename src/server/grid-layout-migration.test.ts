import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import type { GridBlock } from "~/lib/grid-layout";
import {
  ensureProfileGridLayouts,
  ensureProjectGridLayout,
  migrateGridLayouts,
} from "~/server/grid-layout-migration";
import {
  getProfileGridEditorState,
  getProjectGridEditorState,
} from "~/server/grid-layouts";

type UserFixture = {
  id: string;
  layoutMode: "GRID" | "CANVAS";
  bio: string | null;
  links: unknown;
  layoutSections: unknown;
};

type ProjectFixture = {
  id: string;
  userId: string;
  title: string;
  description: string;
  private: boolean;
  createdAt: Date;
  links: string[];
  media: { url: string; mimeType: string | null; order: number }[];
};

type StoredLayout = {
  id: string;
  ownerId: string;
  projectId: string | null;
  scope: "PROFILE" | "PROJECT";
  state: "DRAFT" | "PUBLISHED";
  revision: number;
};

type StoredBlock = GridBlock & { id: string; layoutId: string };

const now = new Date("2026-07-20T12:00:00.000Z");

function project(
  id: string,
  userId = "user-1",
  overrides: Partial<ProjectFixture> = {},
): ProjectFixture {
  return {
    id,
    userId,
    title: `Title ${id}`,
    description: `Description ${id}`,
    private: false,
    createdAt: now,
    links: [],
    media: [],
    ...overrides,
  };
}

function createMockDatabase({
  users = [],
  projects = [],
  layouts = [],
  blocks = [],
}: {
  users?: UserFixture[];
  projects?: ProjectFixture[];
  layouts?: StoredLayout[];
  blocks?: Array<{ layoutId: string; block: GridBlock }>;
}) {
  let layoutRows = layouts.map((layout) => ({ ...layout }));
  let blockRows: StoredBlock[] = blocks.map(({ layoutId, block }, index) => ({
    ...block,
    id: `seed-block-${index}`,
    layoutId,
  }));

  const user = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const match = users.find((candidate) => candidate.id === where.id);
      return match ? { ...match } : null;
    }),
    findMany: vi.fn(
      async ({ where }: { where?: { layoutMode?: "GRID" | "CANVAS" } }) =>
        users
          .filter(
            (candidate) =>
              !where?.layoutMode || candidate.layoutMode === where.layoutMode,
          )
          .map(({ id }) => ({ id })),
    ),
  };

  const projectDelegate = {
    findUnique: vi.fn(
      async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: { userId?: boolean };
      }) => {
        const match = projects.find((candidate) => candidate.id === where.id);
        if (!match) return null;
        if (select?.userId && Object.keys(select).length === 1) {
          return { userId: match.userId };
        }
        return {
          ...match,
          media: [...match.media].sort(
            (left, right) => left.order - right.order,
          ),
        };
      },
    ),
    findMany: vi.fn(
      async ({
        where,
        select,
      }: {
        where?: { userId?: string };
        select?: { title?: boolean };
      } = {}) => {
        const matches = projects
          .filter(
            (candidate) => !where?.userId || candidate.userId === where.userId,
          )
          .sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime(),
          );
        if (select?.title) {
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
        return matches.map((match) => ({ ...match }));
      },
    ),
  };

  const gridLayout = {
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: Partial<
          Pick<StoredLayout, "ownerId" | "projectId" | "scope" | "state">
        >;
      }) => {
        const match = layoutRows.find((candidate) =>
          Object.entries(where).every(
            ([key, value]) => candidate[key as keyof StoredLayout] === value,
          ),
        );
        if (!match) return null;
        return {
          ...match,
          blocks: blockRows
            .filter((block) => block.layoutId === match.id)
            .sort(
              (left, right) =>
                left.order - right.order || left.key.localeCompare(right.key),
            )
            .map((block) => ({ ...block })),
        };
      },
    ),
    create: vi.fn(
      async ({
        data,
      }: {
        data: Omit<StoredLayout, "id" | "revision"> & {
          blocks: { create: GridBlock[] };
        };
      }) => {
        const layout: StoredLayout = {
          id: `layout-${layoutRows.length + 1}`,
          ownerId: data.ownerId,
          projectId: data.projectId,
          scope: data.scope,
          state: data.state,
          revision: 0,
        };
        layoutRows.push(layout);
        for (const block of data.blocks.create) {
          blockRows.push({
            ...block,
            id: `block-${blockRows.length + 1}`,
            layoutId: layout.id,
          });
        }
        return { ...layout };
      },
    ),
  };

  const database = {
    user,
    project: projectDelegate,
    gridLayout,
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
    layouts: () => layoutRows.map((layout) => ({ ...layout })),
    mocks: {
      gridLayout,
      project: projectDelegate,
      transaction: database.$transaction,
    },
    rows: (layoutId: string) =>
      blockRows
        .filter((block) => block.layoutId === layoutId)
        .sort((left, right) => left.order - right.order)
        .map(({ id: _id, layoutId: _layoutId, ...block }) => block),
  };
}

function emptyFields() {
  return {
    projectId: null,
    textContent: null,
    imageUrl: null,
    imageMimeType: null,
    imageAlt: null,
    linkLabel: null,
    linkUrl: null,
  };
}

describe("legacy Grid layout migration", () => {
  it("leaves retired profile-scope Grid content untouched", async () => {
    const fixture = createMockDatabase({
      users: [
        {
          id: "user-1",
          layoutMode: "GRID",
          bio: "  Original biography  ",
          layoutSections: ["links", "about", "projects"],
          links: [
            { label: "First", url: "https://example.com/first" },
            { label: "Invalid", url: "javascript:alert(1)" },
            { label: "Third", url: "https://example.com/third" },
          ],
        },
      ],
      projects: [
        project("older", "user-1", {
          createdAt: new Date("2026-07-18T00:00:00.000Z"),
        }),
        project("newer", "user-1", {
          createdAt: new Date("2026-07-19T00:00:00.000Z"),
        }),
      ],
    });

    await expect(
      ensureProfileGridLayouts("user-1", fixture.database),
    ).resolves.toBe("ready");

    const layouts = fixture.layouts();
    expect(layouts).toEqual([]);
    expect(fixture.mocks.transaction).not.toHaveBeenCalled();
  });

  it("preserves project description, media, and links with deterministic keys", async () => {
    const fixture = createMockDatabase({
      projects: [
        project("project-1", "user-1", {
          title: "Migration project",
          description: "Keep this description exactly.",
          media: [
            { url: "https://example.com/photo.png", mimeType: null, order: 2 },
            {
              url: "https://example.com/reference",
              mimeType: "application/pdf",
              order: 5,
            },
          ],
          links: ["https://example.com/one", "https://example.com/two"],
        }),
      ],
    });

    await expect(
      ensureProjectGridLayout("project-1", fixture.database),
    ).resolves.toBe("ready");

    const layout = fixture.layouts()[0]!;
    expect(layout).toMatchObject({
      ownerId: "user-1",
      projectId: "project-1",
      scope: "PROJECT",
      state: "PUBLISHED",
    });
    expect(fixture.rows(layout.id)).toEqual([
      expect.objectContaining({
        key: "legacy-project-description",
        order: 0,
        type: "TEXT",
        textContent: "Keep this description exactly.",
      }),
      expect.objectContaining({
        key: "legacy-project-media-0",
        order: 1,
        type: "IMAGE",
        imageUrl: "https://example.com/photo.png",
        imageMimeType: null,
        imageAlt: "Migration project",
      }),
      expect.objectContaining({
        key: "legacy-project-media-1",
        order: 2,
        type: "LINK",
        linkLabel: "Open media",
        linkUrl: "https://example.com/reference",
      }),
      expect.objectContaining({
        key: "legacy-project-link-0",
        order: 3,
        type: "LINK",
        linkLabel: "Open project link",
        linkUrl: "https://example.com/one",
      }),
      expect.objectContaining({
        key: "legacy-project-link-1",
        order: 4,
        type: "LINK",
        linkLabel: "Open project link",
        linkUrl: "https://example.com/two",
      }),
    ]);
  });

  it("returns fallback eligibility without writes for video and oversized records", async () => {
    const tooManyProjects = Array.from({ length: 51 }, (_, index) =>
      project(`profile-project-${index}`),
    );
    const fixture = createMockDatabase({
      users: [
        {
          id: "user-1",
          layoutMode: "GRID",
          bio: null,
          links: [],
          layoutSections: ["projects"],
        },
      ],
      projects: [
        ...tooManyProjects,
        project("video-project", "video-owner", {
          media: [
            {
              url: "https://example.com/demo.mp4",
              mimeType: null,
              order: 0,
            },
          ],
        }),
        project("oversized-project", "large-owner", {
          media: Array.from({ length: 30 }, (_, index) => ({
            url: `https://example.com/image-${index}.png`,
            mimeType: "image/png",
            order: index,
          })),
          links: Array.from(
            { length: 20 },
            (_, index) => `https://example.com/link-${index}`,
          ),
        }),
      ],
    });

    await expect(
      ensureProfileGridLayouts("user-1", fixture.database),
    ).resolves.toBe("ready");
    await expect(
      ensureProjectGridLayout("video-project", fixture.database),
    ).resolves.toBe("video");
    await expect(
      ensureProjectGridLayout("oversized-project", fixture.database),
    ).resolves.toBe("oversized");
    expect(fixture.layouts()).toEqual([]);
    expect(fixture.mocks.gridLayout.create).not.toHaveBeenCalled();
    expect(fixture.mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not duplicate layouts or overwrite edited blocks on rerun", async () => {
    const edited: GridBlock = {
      key: "owner-edit",
      order: 0,
      type: "TEXT",
      x: 5,
      y: 7,
      width: 4,
      height: 2,
      ...emptyFields(),
      textContent: "Owner edit",
    };
    const fixture = createMockDatabase({
      users: [
        {
          id: "user-1",
          layoutMode: "GRID",
          bio: "Legacy biography",
          links: [],
          layoutSections: ["about"],
        },
      ],
      layouts: [
        {
          id: "existing-draft",
          ownerId: "user-1",
          projectId: null,
          scope: "PROFILE",
          state: "DRAFT",
          revision: 9,
        },
      ],
      blocks: [{ layoutId: "existing-draft", block: edited }],
    });

    await ensureProfileGridLayouts("user-1", fixture.database);
    await ensureProfileGridLayouts("user-1", fixture.database);

    expect(fixture.layouts()).toHaveLength(1);
    expect(fixture.rows("existing-draft")).toEqual([edited]);
    expect(fixture.mocks.gridLayout.create).not.toHaveBeenCalled();
    expect(fixture.mocks.transaction).not.toHaveBeenCalled();
  });

  it("initializes only project layouts during editor-state loading", async () => {
    const fixture = createMockDatabase({
      users: [
        {
          id: "user-1",
          layoutMode: "GRID",
          bio: "Lazy profile",
          links: [],
          layoutSections: ["about"],
        },
      ],
      projects: [
        project("project-1", "user-1", {
          description: "Lazy project",
        }),
      ],
    });

    await expect(
      getProfileGridEditorState("user-1", fixture.database),
    ).rejects.toThrow("This Grid layout is not available.");
    const projectEditor = await getProjectGridEditorState(
      "project-1",
      "user-1",
      fixture.database,
    );

    expect(projectEditor.blocks).toEqual([
      expect.objectContaining({
        key: "legacy-project-description",
        textContent: "Lazy project",
      }),
    ]);
    expect(fixture.layouts()).toHaveLength(1);
  });

  it("reports exact bulk counts across migrated, existing, and fallback records", async () => {
    const oversizedMedia = Array.from({ length: 30 }, (_, index) => ({
      url: `https://example.com/image-${index}.png`,
      mimeType: "image/png",
      order: index,
    }));
    const fixture = createMockDatabase({
      users: [
        {
          id: "new-profile",
          layoutMode: "GRID",
          bio: "New profile",
          links: [],
          layoutSections: ["about"],
        },
        {
          id: "existing-profile",
          layoutMode: "GRID",
          bio: "Existing profile",
          links: [],
          layoutSections: ["about"],
        },
        {
          id: "canvas-profile",
          layoutMode: "CANVAS",
          bio: "Canvas stays untouched",
          links: [],
          layoutSections: ["about"],
        },
      ],
      projects: [
        project("eligible-project", "new-profile"),
        project("existing-project", "existing-profile"),
        project("video-project", "new-profile", {
          media: [{ url: "/demo.webm", mimeType: "video/webm", order: 0 }],
        }),
        project("oversized-project", "new-profile", {
          media: oversizedMedia,
          links: Array.from(
            { length: 20 },
            (_, index) => `https://example.com/link-${index}`,
          ),
        }),
      ],
      layouts: [
        {
          id: "existing-profile-draft",
          ownerId: "existing-profile",
          projectId: null,
          scope: "PROFILE",
          state: "DRAFT",
          revision: 3,
        },
        {
          id: "existing-project-layout",
          ownerId: "existing-profile",
          projectId: "existing-project",
          scope: "PROJECT",
          state: "PUBLISHED",
          revision: 4,
        },
      ],
    });

    await expect(migrateGridLayouts(fixture.database)).resolves.toEqual({
      migratedProfiles: 0,
      migratedProjects: 1,
      alreadyMigrated: 1,
      skippedVideo: 1,
      skippedOversized: 1,
    });
  });
});
