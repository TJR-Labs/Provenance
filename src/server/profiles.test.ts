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
});
