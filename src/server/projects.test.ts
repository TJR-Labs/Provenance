import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import {
  discoverProjects,
  getPublicProject,
  listMyProjects,
  listPopularHashtags,
  listProjectsByUsername,
} from "~/server/projects";

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
