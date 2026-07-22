import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import {
  discoverProjects,
  getPublicProject,
  listMyProjects,
  listPopularHashtags,
  listProjectsByUsername,
} from "~/server/projects";
import { publicGridBlockSelect } from "~/server/grid-layouts";

describe("listPopularHashtags", () => {
  it("orders tags by usage frequency, most-used first", async () => {
    const projects = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { hashtags: ["robotics", "ai"] },
          { hashtags: ["robotics", "web"] },
          { hashtags: ["robotics", "ai"] },
          { hashtags: ["web"] },
        ]),
    };

    const result = await listPopularHashtags(20, projects as never);

    // robotics=3, ai=2, web=2; ties (ai/web) fall back to alphabetical.
    expect(result).toEqual(["robotics", "ai", "web"]);
    // Only public projects on public, non-banned profiles are counted.
    expect(projects.findMany).toHaveBeenCalledWith({
      where: { user: { banned: false, private: false }, private: false },
      select: { hashtags: true },
    });
  });

  it("caps the result at the requested limit", async () => {
    const projects = {
      findMany: vi.fn().mockResolvedValue([{ hashtags: ["a", "b", "c", "d"] }]),
    };

    const result = await listPopularHashtags(2, projects as never);

    expect(result).toHaveLength(2);
  });

  it("returns an empty list when no projects have hashtags", async () => {
    const projects = {
      findMany: vi.fn().mockResolvedValue([{ hashtags: [] }, { hashtags: [] }]),
    };

    expect(await listPopularHashtags(20, projects as never)).toEqual([]);
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
          media: [{ url: "https://example.com/2.png" }],
        },
        { id: "project-1", title: "First", media: [] },
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
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(result).toEqual([
      {
        id: "project-2",
        title: "Second",
        thumbnailUrl: "https://example.com/2.png",
        placed: true,
      },
      { id: "project-1", title: "First", thumbnailUrl: null, placed: false },
    ]);
  });

  it("resolves placement against the DRAFT state when the draft is newer than the last publish", async () => {
    const projects = {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: "project-1", title: "Only", media: [] }]),
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
      where: { userId: "user-1", state: "DRAFT", type: "PROJECT" },
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

    expect(result).toEqual([]);
    expect(canvasElements.findMany).not.toHaveBeenCalled();
  });
});
