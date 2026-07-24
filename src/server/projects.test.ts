import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));
const storageMocks = vi.hoisted(() => ({
  remove: vi.fn(async () => ({ data: {}, error: null })),
}));
vi.mock("~/server/storage", () => ({
  createStorageClient: () => ({
    storage: { from: () => ({ remove: storageMocks.remove }) },
  }),
}));

import {
  createProject,
  deleteProject,
  discoverProjects,
  getPublicProject,
  listMyProjects,
  listPopularHashtags,
  listProjectsByUsername,
  updateProject,
} from "~/server/projects";
import { publicGridBlockSelect } from "~/server/grid-layouts";

const projectInput = {
  title: "Project",
  description: "Description",
  category: "SOFTWARE_ENGINEER" as const,
  hashtags: [],
  links: [],
  layout: "default" as const,
  private: false,
  excludeFromFeed: false,
  media: [] as {
    kind: "UPLOAD" | "EXTERNAL";
    url: string;
    mimeType: string | null;
  }[],
};

function projectListRow(
  id: string,
  createdAt: string,
  options: {
    private?: boolean;
    ownerPrivate?: boolean;
    ownerBanned?: boolean;
    excludeFromFeed?: boolean;
  } = {},
) {
  return {
    id,
    title: `Project ${id}`,
    description: `Description ${id}`,
    category: "SOFTWARE_ENGINEER" as const,
    hashtags: ["test"],
    createdAt: new Date(createdAt),
    private: options.private ?? false,
    excludeFromFeed: options.excludeFromFeed ?? false,
    media: [{ url: `https://example.com/${id}.png`, mimeType: "image/png" }],
    user: {
      id: `owner-${id}`,
      username: "alice",
      displayName: "Alice",
      private: options.ownerPrivate ?? false,
      banned: options.ownerBanned ?? false,
    },
  };
}

function storageLifecycleDatabase(options: { includeProject?: boolean } = {}) {
  const pending = new Map<
    string,
    { bucket: string; path: string; reason: string }
  >();
  let project =
    options.includeProject === false
      ? null
      : {
          id: "project-1",
          userId: "user-1",
          media: [
            {
              storageBucket: "media",
              storagePath: "user-1/owned.png",
            },
            { storageBucket: null, storagePath: null },
          ],
        };
  const pendingStorageDeletion = {
    createMany: vi.fn(
      async ({
        data,
      }: {
        data: typeof pending extends Map<string, infer V> ? V[] : never;
      }) => {
        for (const row of data) pending.set(`${row.bucket}/${row.path}`, row);
        return { count: data.length };
      },
    ),
    findMany: vi.fn(async () =>
      [...pending.values()].map(({ bucket, path }) => ({ bucket, path })),
    ),
    findUnique: vi.fn(
      async ({
        where,
      }: {
        where: { bucket_path: { bucket: string; path: string } };
      }) =>
        pending.get(`${where.bucket_path.bucket}/${where.bucket_path.path}`) ??
        null,
    ),
    delete: vi.fn(
      async ({
        where,
      }: {
        where: { bucket_path: { bucket: string; path: string } };
      }) => {
        pending.delete(`${where.bucket_path.bucket}/${where.bucket_path.path}`);
        return {};
      },
    ),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    updateMany: vi.fn(async () => ({ count: 0 })),
  };
  const projectDelegate = {
    findUnique: vi.fn(async () => project),
    delete: vi.fn(async () => {
      const deleted = project;
      project = null;
      return deleted;
    }),
    update: vi.fn(async ({ data }: { data: unknown }) => ({
      id: "project-1",
      data,
    })),
    create: vi.fn(async ({ data }: { data: unknown }) => ({
      id: "project-1",
      data,
    })),
  };
  const uploadIntent = {
    findFirst: vi.fn(async () => ({
      id: "intent-1",
      resultUrl: "https://cdn.example.test/owned.png",
      storageDeletedAt: null,
    })),
    findMany: vi.fn(async ({ select }: { select: { id?: boolean } }) =>
      select.id
        ? [{ id: "intent-1" }]
        : [
            {
              resultUrl: "https://cdn.example.test/owned.png",
              resultStorageBucket: "media",
              resultStoragePath: "user-1/owned.png",
              resultByteSize: 8,
            },
          ],
    ),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  const database = {
    project: projectDelegate,
    uploadIntent,
    pendingStorageDeletion,
    projectMedia: { count: vi.fn(async () => 0) },
    imageResource: { count: vi.fn(async () => 0) },
    user: { count: vi.fn(async () => 0) },
    $queryRaw: vi.fn(async () => []),
    $transaction: vi.fn(),
  };
  database.$transaction.mockImplementation(
    async (operation: (transaction: typeof database) => Promise<unknown>) =>
      operation(database),
  );
  return {
    database: database as never,
    pending,
    pendingStorageDeletion,
    projectDelegate,
  };
}

describe("owned project media lifecycle", () => {
  it("copies finalized intent metadata onto new owned ProjectMedia rows", async () => {
    const fixture = storageLifecycleDatabase({ includeProject: false });
    await createProject(
      "user-1",
      {
        ...projectInput,
        media: [
          {
            kind: "UPLOAD",
            url: "https://cdn.example.test/owned.png",
            mimeType: "image/png",
          },
          {
            kind: "EXTERNAL",
            url: "https://example.test/external.png",
            mimeType: null,
          },
        ],
      },
      fixture.database,
    );

    const createInput = fixture.projectDelegate.create.mock.calls[0]?.[0] as {
      data: { media: { create: Record<string, unknown>[] } };
    };
    expect(createInput.data.media.create[0]).toMatchObject({
      storageBucket: "media",
      storagePath: "user-1/owned.png",
      storageByteSize: 8,
    });
    expect(createInput.data.media.create[1]).not.toHaveProperty(
      "storageBucket",
    );
  });

  it("queues only owned media in the delete transaction, then removes Storage", async () => {
    storageMocks.remove.mockClear();
    const fixture = storageLifecycleDatabase();

    await deleteProject("project-1", "user-1", fixture.database);

    expect(fixture.pendingStorageDeletion.createMany).toHaveBeenCalledWith({
      data: [
        {
          bucket: "media",
          path: "user-1/owned.png",
          reason: "project deleted",
        },
      ],
      skipDuplicates: true,
    });
    expect(storageMocks.remove).toHaveBeenCalledWith(["user-1/owned.png"]);
    expect(fixture.pending.size).toBe(0);
  });

  it("uses the same outbox path when project media is replaced", async () => {
    storageMocks.remove.mockClear();
    const fixture = storageLifecycleDatabase();

    await updateProject("project-1", "user-1", projectInput, fixture.database);

    expect(fixture.pendingStorageDeletion.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ reason: "project media replaced" })],
      }),
    );
    expect(storageMocks.remove).toHaveBeenCalledWith(["user-1/owned.png"]);
  });
});

describe("listPopularHashtags", () => {
  it("orders tags by usage frequency, most-used first", async () => {
    const database = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([
          { tag: "robotics" },
          { tag: "ai" },
          { tag: "web" },
        ]),
    };

    const result = await listPopularHashtags(20, database);

    expect(result).toEqual(["robotics", "ai", "web"]);
    const query = database.$queryRaw.mock.calls[0]?.[0] as {
      strings: string[];
      values: unknown[];
    };
    const sql = query.strings.join("?");
    expect(sql).toContain("UNNEST");
    expect(sql).toContain('project."private" = false');
    expect(sql).toContain('owner."private" = false');
    expect(sql).toContain('owner."banned" = false');
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("ORDER BY COUNT(*) DESC");
    expect(query.values).toEqual([20]);
  });

  it("passes a bounded result limit to Postgres", async () => {
    const database = {
      $queryRaw: vi.fn().mockResolvedValue([{ tag: "a" }, { tag: "b" }]),
    };

    const result = await listPopularHashtags(2, database);

    expect(result).toEqual(["a", "b"]);
    expect(
      (database.$queryRaw.mock.calls[0]?.[0] as { values: unknown[] }).values,
    ).toEqual([2]);
  });

  it("returns an empty list when no projects have hashtags", async () => {
    const database = { $queryRaw: vi.fn().mockResolvedValue([]) };

    expect(await listPopularHashtags(20, database as never)).toEqual([]);
  });
});

describe("discoverProjects", () => {
  it("excludes feed-opted-out projects only from the unfiltered feed", async () => {
    const projects = { findMany: vi.fn().mockResolvedValue([]) };

    await discoverProjects({}, null, projects as never);
    expect(projects.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          user: { banned: false, private: false },
          private: false,
          excludeFromFeed: false,
        },
      }),
    );

    await discoverProjects(
      { category: "SOFTWARE_ENGINEER" },
      null,
      projects as never,
    );
    expect(projects.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          user: { banned: false, private: false },
          private: false,
          category: "SOFTWARE_ENGINEER",
        },
      }),
    );

    await discoverProjects({ hashtag: "x" }, null, projects as never);
    expect(projects.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          user: { banned: false, private: false },
          private: false,
          hashtags: { has: "x" },
        },
      }),
    );
  });

  it("returns first and subsequent pages with a stable createdAt/id tie-breaker", async () => {
    const tiedAt = "2026-07-20T12:00:00.000Z";
    const projects = {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([
          projectListRow("project-c", tiedAt),
          projectListRow("project-b", tiedAt),
          projectListRow("project-a", tiedAt),
        ])
        .mockResolvedValueOnce([projectListRow("project-a", tiedAt)]),
    };

    const firstPage = await discoverProjects(
      { limit: 2 },
      null,
      projects as never,
    );
    const secondPage = await discoverProjects(
      { limit: 2, cursor: firstPage.nextCursor! },
      null,
      projects as never,
    );

    expect(firstPage.items.map((project) => project.id)).toEqual([
      "project-c",
      "project-b",
    ]);
    expect(firstPage.nextCursor).toBe(`${tiedAt}|project-b`);
    expect(secondPage.items.map((project) => project.id)).toEqual([
      "project-a",
    ]);
    expect(secondPage.nextCursor).toBeNull();
    expect(projects.findMany.mock.calls[0]?.[0]).toMatchObject({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 3,
      select: {
        media: {
          orderBy: [{ order: "asc" }, { id: "asc" }],
          take: 1,
        },
      },
    });
    expect(projects.findMany.mock.calls[1]?.[0]).toMatchObject({
      where: {
        AND: [
          expect.any(Object),
          {
            OR: [
              { createdAt: { lt: new Date(tiedAt) } },
              {
                createdAt: new Date(tiedAt),
                id: { lt: "project-b" },
              },
            ],
          },
        ],
      },
    });
  });

  it("rejects a malformed cursor before querying", async () => {
    const projects = { findMany: vi.fn() };

    await expect(
      discoverProjects({ cursor: "not-a-cursor" }, null, projects as never),
    ).rejects.toThrow("Invalid pagination cursor");
    expect(projects.findMany).not.toHaveBeenCalled();
  });

  it("clamps oversized pages to 100 records", async () => {
    const projects = { findMany: vi.fn().mockResolvedValue([]) };

    await discoverProjects({ limit: 1_000 }, null, projects as never);

    expect(projects.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
  });

  it("keeps public visibility filters on the query after a page boundary", async () => {
    const publicNewest = projectListRow(
      "public-newest",
      "2026-07-20T04:00:00.000Z",
    );
    const privateProject = projectListRow(
      "private-middle",
      "2026-07-20T03:00:00.000Z",
      { private: true },
    );
    const bannedOwnerProject = projectListRow(
      "banned-middle",
      "2026-07-20T02:00:00.000Z",
      { ownerBanned: true },
    );
    const publicOldest = projectListRow(
      "public-oldest",
      "2026-07-20T01:00:00.000Z",
    );
    const sourceRows = [
      publicNewest,
      privateProject,
      bannedOwnerProject,
      publicOldest,
    ];
    const projects = {
      findMany: vi.fn(
        async (query: {
          where: {
            AND?: unknown[];
            private?: boolean;
            excludeFromFeed?: boolean;
            user?: { banned?: boolean; private?: boolean };
          };
          take: number;
        }) => {
          const visibility = (query.where.AND?.[0] ?? query.where) as {
            private?: boolean;
            excludeFromFeed?: boolean;
            user?: { banned?: boolean; private?: boolean };
          };
          const cursor = query.where.AND?.[1] as
            | {
                OR: [
                  { createdAt: { lt: Date } },
                  { createdAt: Date; id: { lt: string } },
                ];
              }
            | undefined;
          return sourceRows
            .filter(
              (row) =>
                (visibility.private !== false || !row.private) &&
                (visibility.excludeFromFeed !== false ||
                  !row.excludeFromFeed) &&
                (visibility.user?.banned !== false || !row.user.banned) &&
                (visibility.user?.private !== false || !row.user.private),
            )
            .filter(
              (row) =>
                !cursor ||
                row.createdAt < cursor.OR[0].createdAt.lt ||
                (row.createdAt.getTime() === cursor.OR[1].createdAt.getTime() &&
                  row.id < cursor.OR[1].id.lt),
            )
            .sort(
              (a, b) =>
                b.createdAt.getTime() - a.createdAt.getTime() ||
                b.id.localeCompare(a.id),
            )
            .slice(0, query.take);
        },
      ),
    };

    const firstPage = await discoverProjects(
      { limit: 1 },
      null,
      projects as never,
    );
    const secondPage = await discoverProjects(
      { limit: 1, cursor: firstPage.nextCursor! },
      null,
      projects as never,
    );

    expect(firstPage.items.map((project) => project.id)).toEqual([
      "public-newest",
    ]);
    expect(secondPage.items.map((project) => project.id)).toEqual([
      "public-oldest",
    ]);
    expect(
      [...firstPage.items, ...secondPage.items].map((project) => project.id),
    ).not.toContain("private-middle");
    expect(
      [...firstPage.items, ...secondPage.items].map((project) => project.id),
    ).not.toContain("banned-middle");
    expect(projects.findMany.mock.calls[1]?.[0]).toMatchObject({
      where: {
        AND: [
          {
            user: { banned: false, private: false },
            private: false,
            excludeFromFeed: false,
          },
          expect.any(Object),
        ],
      },
    });
  });
});

describe("getPublicProject", () => {
  const privateProject = {
    id: "p",
    userId: "owner",
    private: true,
    user: {
      id: "owner",
      username: "alice",
      displayName: "Alice",
      private: false,
    },
    media: [],
  };

  it("returns null for a non-owner and the row for the owner of a private project", async () => {
    const projects = {
      findFirst: vi.fn().mockResolvedValue(privateProject),
    };

    expect(await getPublicProject("p", "other", projects as never)).toBeNull();
    expect(await getPublicProject("p", "owner", projects as never)).toBe(
      privateProject,
    );
  });

  it("applies the same owner bypass to projects on a private profile", async () => {
    const project = {
      ...privateProject,
      private: false,
      user: { ...privateProject.user, private: true },
    };
    const projects = { findFirst: vi.fn().mockResolvedValue(project) };

    expect(await getPublicProject("p", "other", projects as never)).toBeNull();
    expect(await getPublicProject("p", "owner", projects as never)).toBe(
      project,
    );
  });

  function gridBlock(overrides: Record<string, unknown> = {}) {
    return {
      key: "block-1",
      order: 0,
      type: "PROJECT",
      x: 0,
      y: 0,
      width: 3,
      height: 2,
      projectId: "referenced",
      textContent: null,
      imageUrl: null,
      imageMimeType: null,
      imageAlt: null,
      linkLabel: null,
      linkUrl: null,
      project: {
        id: "referenced",
        title: "Referenced project",
        description: "Current referenced description",
        private: false,
        media: [],
      },
      ...overrides,
    };
  }

  it("returns only a published Grid rendering payload without layout or owner metadata", async () => {
    const project = {
      ...privateProject,
      private: false,
      media: [{ url: "https://example.com/cover.png", mimeType: "image/png" }],
    };
    const projects = { findFirst: vi.fn().mockResolvedValue(project) };
    const gridLayouts = {
      findFirst: vi.fn().mockResolvedValue({
        id: "layout-1",
        ownerId: "owner",
        state: "PUBLISHED",
        revision: 4,
        blocks: [gridBlock()],
      }),
    };

    const result = await getPublicProject(
      "p",
      null,
      projects as never,
      gridLayouts,
    );

    expect(gridLayouts.findFirst).toHaveBeenCalledWith({
      where: {
        ownerId: "owner",
        projectId: "p",
        scope: "PROJECT",
        state: "PUBLISHED",
      },
      select: {
        blocks: {
          orderBy: [{ order: "asc" }, { key: "asc" }],
          select: publicGridBlockSelect,
        },
      },
    });
    expect(result).toMatchObject({
      gridLayout: {
        blocks: [
          {
            key: "block-1",
            order: 0,
            type: "PROJECT",
            x: 0,
            y: 0,
            width: 3,
            height: 2,
            projectId: "referenced",
            textContent: null,
            imageUrl: null,
            imageMimeType: null,
            imageAlt: null,
            linkLabel: null,
            linkUrl: null,
          },
        ],
        projects: [
          {
            id: "referenced",
            title: "Referenced project",
            description: "Current referenced description",
            private: false,
            media: [],
          },
        ],
      },
    });
    if (!result || !("gridLayout" in result)) {
      throw new Error("Expected a public Grid payload.");
    }
    expect(Object.keys(result.gridLayout)).toEqual(["blocks", "projects"]);
    expect(result.gridLayout).not.toHaveProperty("id");
    expect(result.gridLayout).not.toHaveProperty("ownerId");
    expect(result.gridLayout).not.toHaveProperty("state");
    expect(result.gridLayout).not.toHaveProperty("revision");
  });

  it("applies referenced-project privacy and deletion immediately for viewers while retaining owner preview context", async () => {
    const project = { ...privateProject, private: false };
    const projects = { findFirst: vi.fn().mockResolvedValue(project) };
    const publicReference = gridBlock();
    const privateReference = gridBlock({
      project: {
        id: "referenced",
        title: "Now private",
        description: "Must not leak",
        private: true,
        media: [],
      },
    });
    const deletedReference = gridBlock({ project: null });
    const gridLayouts = {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce({ blocks: [publicReference] })
        .mockResolvedValueOnce({ blocks: [privateReference] })
        .mockResolvedValueOnce({ blocks: [privateReference] })
        .mockResolvedValueOnce({ blocks: [deletedReference] })
        .mockResolvedValueOnce({ blocks: [deletedReference] }),
    };

    const publicResult = await getPublicProject(
      "p",
      "other",
      projects as never,
      gridLayouts,
    );
    expect(publicResult).toMatchObject({
      gridLayout: {
        blocks: [{ projectId: "referenced" }],
        projects: [{ id: "referenced" }],
      },
    });

    const newlyPrivateResult = await getPublicProject(
      "p",
      "other",
      projects as never,
      gridLayouts,
    );
    expect(newlyPrivateResult).toMatchObject({
      gridLayout: { blocks: [], projects: [] },
    });

    const ownerPrivateResult = await getPublicProject(
      "p",
      "owner",
      projects as never,
      gridLayouts,
    );
    expect(ownerPrivateResult).toMatchObject({
      gridLayout: {
        blocks: [{ projectId: "referenced" }],
        projects: [{ id: "referenced", private: true }],
      },
    });

    const ownerDeletedResult = await getPublicProject(
      "p",
      "owner",
      projects as never,
      gridLayouts,
    );
    expect(ownerDeletedResult).toMatchObject({
      gridLayout: {
        blocks: [{ projectId: "referenced" }],
        projects: [],
      },
    });

    const viewerDeletedResult = await getPublicProject(
      "p",
      "other",
      projects as never,
      gridLayouts,
    );
    expect(viewerDeletedResult).toMatchObject({
      gridLayout: { blocks: [], projects: [] },
    });
  });

  it("keeps a video-bearing project on the legacy payload even when a Grid layout is stored", async () => {
    const project = {
      ...privateProject,
      private: false,
      description: "Legacy description",
      links: ["https://example.com/legacy"],
      media: [
        { url: "https://example.com/cover.png", mimeType: "image/png" },
        { url: "https://example.com/demo.mp4", mimeType: "video/mp4" },
      ],
    };
    const projects = { findFirst: vi.fn().mockResolvedValue(project) };
    const gridLayouts = {
      findFirst: vi.fn().mockResolvedValue({ blocks: [gridBlock()] }),
    };

    const result = await getPublicProject(
      "p",
      null,
      projects as never,
      gridLayouts,
    );

    expect(result).toMatchObject({
      description: "Legacy description",
      links: ["https://example.com/legacy"],
      media: project.media,
    });
    expect(result).not.toHaveProperty("gridLayout");
    expect(gridLayouts.findFirst).not.toHaveBeenCalled();
  });

  it("retains the legacy project payload when no published Grid layout exists", async () => {
    const project = {
      ...privateProject,
      private: false,
      description: "Legacy description",
      links: ["https://example.com/legacy"],
      media: [],
    };
    const projects = { findFirst: vi.fn().mockResolvedValue(project) };
    const gridLayouts = { findFirst: vi.fn().mockResolvedValue(null) };

    const result = await getPublicProject(
      "p",
      null,
      projects as never,
      gridLayouts,
    );

    expect(result).toMatchObject({
      description: "Legacy description",
      links: ["https://example.com/legacy"],
      media: [],
    });
    expect(result).not.toHaveProperty("gridLayout");
  });
});

describe("listProjectsByUsername", () => {
  it("lets a signed-in owner see their projects and limits other branches to public content", async () => {
    const projects = { findMany: vi.fn().mockResolvedValue([]) };

    await listProjectsByUsername("Alice", "owner", projects as never);

    expect(projects.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user: { username: "alice", banned: false },
          OR: [
            { userId: "owner" },
            { private: false, user: { private: false } },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 25,
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          hashtags: true,
          createdAt: true,
          media: {
            select: { url: true, mimeType: true },
            orderBy: [{ order: "asc" }, { id: "asc" }],
            take: 1,
          },
          user: {
            select: { username: true, displayName: true },
          },
        },
      }),
    );
  });

  it("limits signed-out viewers to public projects on public profiles", async () => {
    const projects = { findMany: vi.fn().mockResolvedValue([]) };

    await listProjectsByUsername("Alice", null, projects as never);

    expect(projects.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          private: false,
          user: { username: "alice", banned: false, private: false },
        },
      }),
    );
  });
});

describe("listMyProjects", () => {
  it("lists the user's own projects newest-first with thumbnail and placed status", async () => {
    const projects = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "project-2",
          title: "Second",
          createdAt: new Date("2026-07-17T00:00:00.000Z"),
          media: [{ url: "https://example.com/2.png" }],
        },
        {
          id: "project-1",
          title: "First",
          createdAt: new Date("2026-07-16T00:00:00.000Z"),
          media: [],
        },
      ]),
    };
    const users = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        canvasDraftSavedAt: null,
        canvasPublishedAt: new Date("2026-07-16T12:00:00Z"),
      }),
    };
    const canvasElements = {
      findMany: vi.fn().mockResolvedValue([{ projectId: "project-2" }]),
    };

    const result = await listMyProjects(
      "user-1",
      projects as never,
      users,
      canvasElements,
    );

    expect(projects.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 25,
      }),
    );
    expect(result).toEqual({
      items: [
        {
          id: "project-2",
          title: "Second",
          thumbnailUrl: "https://example.com/2.png",
          placed: true,
        },
        {
          id: "project-1",
          title: "First",
          thumbnailUrl: null,
          placed: false,
        },
      ],
      nextCursor: null,
    });
  });

  it("returns a cursor for the signed-in user's next project page", async () => {
    const tiedAt = new Date("2026-07-17T00:00:00.000Z");
    const projects = {
      findMany: vi.fn().mockResolvedValue([
        { id: "project-b", title: "B", createdAt: tiedAt, media: [] },
        { id: "project-a", title: "A", createdAt: tiedAt, media: [] },
      ]),
    };
    const users = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        canvasDraftSavedAt: null,
        canvasPublishedAt: null,
      }),
    };
    const canvasElements = { findMany: vi.fn() };

    const result = await listMyProjects(
      "user-1",
      projects as never,
      users,
      canvasElements,
      { limit: 1 },
    );

    expect(result.items.map((project) => project.id)).toEqual(["project-b"]);
    expect(result.nextCursor).toBe("2026-07-17T00:00:00.000Z|project-b");
    expect(canvasElements.findMany).not.toHaveBeenCalled();
  });

  it("resolves placement against the DRAFT state when the draft is newer than the last publish", async () => {
    const projects = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "project-1",
          title: "Only",
          createdAt: new Date("2026-07-17T00:00:00.000Z"),
          media: [],
        },
      ]),
    };
    const users = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        canvasDraftSavedAt: new Date("2026-07-17T00:00:00Z"),
        canvasPublishedAt: new Date("2026-07-16T00:00:00Z"),
      }),
    };
    const canvasElements = {
      findMany: vi.fn().mockResolvedValue([{ projectId: "project-1" }]),
    };

    await listMyProjects("user-1", projects as never, users, canvasElements);

    expect(canvasElements.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        state: "DRAFT",
        type: "PROJECT",
        projectId: { in: ["project-1"] },
      },
      select: { projectId: true },
    });
  });

  it("returns an empty list for a user with no projects, without querying canvas elements", async () => {
    const projects = { findMany: vi.fn().mockResolvedValue([]) };
    const users = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        canvasDraftSavedAt: null,
        canvasPublishedAt: null,
      }),
    };
    const canvasElements = { findMany: vi.fn() };

    const result = await listMyProjects(
      "user-1",
      projects as never,
      users,
      canvasElements,
    );

    expect(result).toEqual({ items: [], nextCursor: null });
    expect(canvasElements.findMany).not.toHaveBeenCalled();
  });
});
