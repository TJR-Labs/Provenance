import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import { getPublicProfile } from "~/server/profiles";

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    private: false,
    username: "alice",
    displayName: "Alice",
    bio: null,
    school: null,
    avatarUrl: null,
    links: [],
    theme: "default",
    layoutSections: [],
    layoutMode: "GRID",
    customCss: null,
    projects: [],
    ...overrides,
  };
}

function expectedFindFirst(projectWhere: unknown) {
  return {
    where: { username: "alice", banned: false },
    select: {
      id: true,
      private: true,
      username: true,
      displayName: true,
      bio: true,
      school: true,
      avatarUrl: true,
      links: true,
      theme: true,
      canvasBackgroundColor: true,
      canvasBackgroundImageUrl: true,
      layoutSections: true,
      layoutMode: true,
      customCss: true,
      projects: {
        where: projectWhere,
        include: { media: { orderBy: { order: "asc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  };
}

function gridBlock(overrides: Record<string, unknown> = {}) {
  return {
    key: "block-1",
    order: 0,
    type: "PROJECT",
    x: 0,
    y: 0,
    width: 3,
    height: 2,
    projectId: "p1",
    textContent: null,
    imageUrl: null,
    imageMimeType: null,
    imageAlt: null,
    linkLabel: null,
    linkUrl: null,
    project: {
      id: "p1",
      title: "Current title",
      description: "Current description",
      private: false,
      media: [
        { url: "https://example.com/current.png", mimeType: "image/png" },
      ],
    },
    ...overrides,
  };
}

describe("getPublicProfile", () => {
  it("returns a private sentinel to non-owners and the full profile to the owner", async () => {
    const users = {
      findFirst: vi.fn().mockResolvedValue(profile({ private: true })),
    };
    const projects = { findMany: vi.fn().mockResolvedValue([]) };
    const canvasElements = { findMany: vi.fn() };

    await expect(
      getPublicProfile(
        "Alice",
        "other",
        users as never,
        projects as never,
        canvasElements as never,
      ),
    ).resolves.toEqual({ isPrivate: true });
    expect(projects.findMany).not.toHaveBeenCalled();

    const ownerResult = await getPublicProfile(
      "Alice",
      "u1",
      users,
      projects,
      canvasElements,
    );
    expect(ownerResult).toMatchObject({
      id: "u1",
      private: true,
      categories: [],
    });
  });

  it("filters nested projects for non-owners", async () => {
    const users = { findFirst: vi.fn().mockResolvedValue(profile()) };
    const projects = { findMany: vi.fn().mockResolvedValue([]) };
    const canvasElements = { findMany: vi.fn() };

    await getPublicProfile("Alice", null, users, projects, canvasElements);

    expect(users.findFirst).toHaveBeenCalledWith(
      expectedFindFirst({ private: false }),
    );
  });

  it("uses an owner-or-public nested filter so owners retain private projects", async () => {
    const users = { findFirst: vi.fn().mockResolvedValue(profile()) };
    const projects = { findMany: vi.fn().mockResolvedValue([]) };
    const canvasElements = { findMany: vi.fn() };

    await getPublicProfile("Alice", "u1", users, projects, canvasElements);

    expect(users.findFirst).toHaveBeenCalledWith(
      expectedFindFirst({ OR: [{ userId: "u1" }, { private: false }] }),
    );
  });

  it("drops private project cards from a non-owner canvas but keeps them for the owner", async () => {
    const privateCard = {
      id: "element-1",
      type: "PROJECT",
      project: { id: "p1", private: true, media: [] },
    };
    const publicText = { id: "element-2", type: "TEXT", project: null };
    const users = {
      findFirst: vi.fn().mockResolvedValue(profile({ layoutMode: "CANVAS" })),
    };
    const projects = { findMany: vi.fn().mockResolvedValue([]) };
    const canvasElements = {
      findMany: vi.fn().mockResolvedValue([privateCard, publicText]),
    };

    const visitorResult = await getPublicProfile(
      "Alice",
      "other",
      users,
      projects,
      canvasElements,
    );
    expect(visitorResult).toMatchObject({ canvasElements: [publicText] });

    const ownerResult = await getPublicProfile(
      "Alice",
      "u1",
      users,
      projects,
      canvasElements,
    );
    expect(ownerResult).toMatchObject({
      canvasElements: [privateCard, publicText],
    });
  });

  it("returns only a published Grid rendering payload without layout or owner metadata", async () => {
    const users = { findFirst: vi.fn().mockResolvedValue(profile()) };
    const projects = { findMany: vi.fn().mockResolvedValue([]) };
    const canvasElements = { findMany: vi.fn() };
    const block = gridBlock();
    const gridLayouts = {
      findFirst: vi.fn().mockResolvedValue({
        id: "layout-1",
        ownerId: "u1",
        state: "PUBLISHED",
        revision: 7,
        blocks: [block],
      }),
    };

    const result = await getPublicProfile(
      "Alice",
      null,
      users,
      projects,
      canvasElements,
      gridLayouts as never,
    );

    expect(gridLayouts.findFirst).toHaveBeenCalledWith({
      where: { ownerId: "u1", scope: "PROFILE", state: "PUBLISHED" },
      select: {
        blocks: {
          orderBy: [{ order: "asc" }, { key: "asc" }],
          select: expect.objectContaining({
            key: true,
            project: expect.any(Object),
          }),
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
            projectId: "p1",
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
            id: "p1",
            title: "Current title",
            description: "Current description",
            private: false,
            media: [
              {
                url: "https://example.com/current.png",
                mimeType: "image/png",
              },
            ],
          },
        ],
      },
    });
    if (!result || "isPrivate" in result || !result.gridLayout) {
      throw new Error("Expected a public Grid payload.");
    }
    expect(Object.keys(result.gridLayout)).toEqual(["blocks", "projects"]);
    expect(result.gridLayout).not.toHaveProperty("id");
    expect(result.gridLayout).not.toHaveProperty("ownerId");
    expect(result.gridLayout).not.toHaveProperty("state");
    expect(result.gridLayout).not.toHaveProperty("revision");
  });

  it("applies referenced-project privacy and deletion immediately for viewers while retaining owner preview context", async () => {
    const users = { findFirst: vi.fn().mockResolvedValue(profile()) };
    const projects = { findMany: vi.fn().mockResolvedValue([]) };
    const canvasElements = { findMany: vi.fn() };
    const publicReference = gridBlock();
    const privateReference = gridBlock({
      project: {
        id: "p1",
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

    const publicResult = await getPublicProfile(
      "Alice",
      "other",
      users,
      projects,
      canvasElements,
      gridLayouts as never,
    );
    expect(publicResult).toMatchObject({
      gridLayout: { blocks: [{ projectId: "p1" }], projects: [{ id: "p1" }] },
    });

    const newlyPrivateResult = await getPublicProfile(
      "Alice",
      "other",
      users,
      projects,
      canvasElements,
      gridLayouts as never,
    );
    expect(newlyPrivateResult).toMatchObject({
      gridLayout: { blocks: [], projects: [] },
    });

    const ownerPrivateResult = await getPublicProfile(
      "Alice",
      "u1",
      users,
      projects,
      canvasElements,
      gridLayouts as never,
    );
    expect(ownerPrivateResult).toMatchObject({
      gridLayout: {
        blocks: [{ projectId: "p1" }],
        projects: [{ id: "p1", private: true }],
      },
    });

    const ownerDeletedResult = await getPublicProfile(
      "Alice",
      "u1",
      users,
      projects,
      canvasElements,
      gridLayouts as never,
    );
    expect(ownerDeletedResult).toMatchObject({
      gridLayout: { blocks: [{ projectId: "p1" }], projects: [] },
    });

    const viewerDeletedResult = await getPublicProfile(
      "Alice",
      "other",
      users,
      projects,
      canvasElements,
      gridLayouts as never,
    );
    expect(viewerDeletedResult).toMatchObject({
      gridLayout: { blocks: [], projects: [] },
    });
  });

  it("retains the legacy profile payload when no published Grid layout exists", async () => {
    const users = {
      findFirst: vi.fn().mockResolvedValue(
        profile({
          bio: "Legacy bio",
          layoutSections: ["about", "projects"],
          projects: [{ id: "legacy-project" }],
        }),
      ),
    };
    const projects = { findMany: vi.fn().mockResolvedValue([]) };
    const canvasElements = { findMany: vi.fn() };
    const gridLayouts = { findFirst: vi.fn().mockResolvedValue(null) };

    const result = await getPublicProfile(
      "Alice",
      null,
      users,
      projects,
      canvasElements,
      gridLayouts as never,
    );

    expect(result).toMatchObject({
      bio: "Legacy bio",
      layoutSections: ["about", "projects"],
      projects: [{ id: "legacy-project" }],
    });
    expect(result).not.toHaveProperty("gridLayout");
  });
});
