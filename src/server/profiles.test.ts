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
    siteStylePublished: {
      typefacePairing: "archivo-plexmono",
      colorBg: "#10100f",
      colorText: "#f1eee6",
      colorAccent: "#ed4b2a",
      colorLine: "#3a3935",
      cornerRadius: 10,
      motionLevel: "subtle",
    },
    sitePublishedAt: null,
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
      siteStylePublished: true,
      sitePublishedAt: true,
      customCss: true,
      projects: {
        where: projectWhere,
        include: { media: { orderBy: { order: "asc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  };
}

function textBlock() {
  return {
    id: "block-text",
    sectionId: "section-about",
    type: "TEXT",
    key: "text",
    order: 0,
    projectId: null,
    textContent: "<p>About Alice</p>",
    imageUrl: null,
    imageResourceId: null,
    imageCaption: null,
    galleryImages: null,
    embedUrl: null,
    codeContent: null,
    codeLanguage: null,
    quoteText: null,
    quoteAttribution: null,
    linkLabel: null,
    linkUrl: null,
    project: null,
  };
}

function projectBlock(
  id: string,
  project: { id: string; private: boolean; media: unknown[] } | null,
) {
  return {
    ...textBlock(),
    id: `block-${id}`,
    sectionId: "section-projects",
    type: "PROJECT",
    key: id,
    projectId: id,
    textContent: null,
    project,
  };
}

function sectionMocks(rows: unknown[] = []) {
  return {
    findMany: vi.fn().mockResolvedValue(rows),
  };
}

function devlogMocks(rows: unknown[] = []) {
  return {
    findMany: vi.fn().mockResolvedValue(rows),
  };
}

// getPublicProfile calls ensureSiteContent(profile.id, database) before
// reading Section rows. Mocking section.findFirst to resolve truthy makes
// ensureSiteContent short-circuit to "already seeded" without needing to
// mock the user/transaction path these tests aren't exercising.
function siteContentMocks() {
  return {
    section: { findFirst: vi.fn().mockResolvedValue({ id: "existing" }) },
  };
}

describe("getPublicProfile", () => {
  it("returns a private sentinel to non-owners and the full profile to the owner", async () => {
    const users = {
      findFirst: vi.fn().mockResolvedValue(profile({ private: true })),
    };
    const projects = { findMany: vi.fn().mockResolvedValue([]) };
    const sections = sectionMocks();
    const devlog = devlogMocks();
    const database = siteContentMocks();

    await expect(
      getPublicProfile(
        "Alice",
        "other",
        users,
        projects,
        sections,
        devlog,
        database as never,
      ),
    ).resolves.toEqual({ isPrivate: true });
    expect(projects.findMany).not.toHaveBeenCalled();
    expect(sections.findMany).not.toHaveBeenCalled();

    await expect(
      getPublicProfile(
        "Alice",
        "u1",
        users,
        projects,
        sections,
        devlog,
        database as never,
      ),
    ).resolves.toMatchObject({
      id: "u1",
      private: true,
      categories: [],
      sections: [],
    });
  });

  it("filters nested projects for visitors and retains private projects for the owner", async () => {
    const users = { findFirst: vi.fn().mockResolvedValue(profile()) };
    const projects = { findMany: vi.fn().mockResolvedValue([]) };
    const sections = sectionMocks();
    const devlog = devlogMocks();
    const database = siteContentMocks();

    await getPublicProfile(
      "Alice",
      null,
      users,
      projects,
      sections,
      devlog,
      database as never,
    );
    expect(users.findFirst).toHaveBeenLastCalledWith(
      expectedFindFirst({ private: false }),
    );

    await getPublicProfile(
      "Alice",
      "u1",
      users,
      projects,
      sections,
      devlog,
      database as never,
    );
    expect(users.findFirst).toHaveBeenLastCalledWith(
      expectedFindFirst({ OR: [{ userId: "u1" }, { private: false }] }),
    );
  });

  it("returns ordered published sections and filters private project blocks for visitors", async () => {
    const publicProject = { id: "p1", private: false, media: [] };
    const privateProject = { id: "p2", private: true, media: [] };
    const rows = [
      {
        id: "section-projects",
        userId: "u1",
        state: "PUBLISHED",
        kind: "PROJECT_GRID",
        order: 1,
        visible: true,
        blocks: [
          projectBlock("p1", publicProject),
          projectBlock("p2", privateProject),
          projectBlock("deleted", null),
        ],
      },
      {
        id: "section-about",
        userId: "u1",
        state: "PUBLISHED",
        kind: "ABOUT",
        order: 2,
        visible: true,
        blocks: [textBlock()],
      },
    ];
    const users = { findFirst: vi.fn().mockResolvedValue(profile()) };
    const projects = {
      findMany: vi.fn().mockResolvedValue([{ category: "DESIGNER" }]),
    };
    const sections = sectionMocks(rows);
    const devlog = devlogMocks([
      { id: "d1", label: "SHIPPED", body: "Cut v1." },
    ]);
    const database = siteContentMocks();

    const visitor = await getPublicProfile(
      "Alice",
      "other",
      users,
      projects,
      sections,
      devlog,
      database as never,
    );
    expect(visitor).toMatchObject({
      categories: ["DESIGNER"],
      sections: [
        { blocks: [{ projectId: "p1" }] },
        { blocks: [{ type: "TEXT" }] },
      ],
      siteProjects: [{ id: "p1" }],
      devlogEntries: [{ id: "d1", label: "SHIPPED" }],
    });
    // Resolved projects are hoisted out of the block rows.
    expect(
      visitor && "sections" in visitor
        ? visitor.sections[0]?.blocks[0]
        : undefined,
    ).not.toHaveProperty("project");
    expect(sections.findMany).toHaveBeenCalledWith({
      where: { userId: "u1", state: "PUBLISHED" },
      orderBy: { order: "asc" },
      include: {
        blocks: {
          orderBy: { order: "asc" },
          include: {
            project: {
              include: { media: { orderBy: { order: "asc" } } },
            },
          },
        },
      },
    });

    const owner = await getPublicProfile(
      "Alice",
      "u1",
      users,
      projects,
      sections,
      devlog,
      database as never,
    );
    expect(owner).toMatchObject({
      sections: [
        {
          blocks: [
            { projectId: "p1" },
            { projectId: "p2" },
            { projectId: "deleted" },
          ],
        },
        { blocks: [{ type: "TEXT" }] },
      ],
      // The deleted project resolves to nothing, so the owner's renderer shows
      // an "unavailable" placeholder for that block.
      siteProjects: [{ id: "p1" }, { id: "p2" }],
    });
  });
});
