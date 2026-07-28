import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import {
  ensureSiteContent,
  migrateSiteContent,
} from "~/server/site-content-migration";

type UserFixture = {
  id: string;
  links: unknown;
  devlogEntryCount: number;
  siteStyleDraft: unknown;
  siteStylePublished: unknown;
};

type StoredSection = {
  id: string;
  userId: string;
  state: "DRAFT" | "PUBLISHED";
  kind: "HERO" | "PROJECT_GRID" | "ABOUT" | "BUILD_LOG" | "LINKS";
  order: number;
  visible: boolean;
};

const defaultSiteStyle = {
  typefacePairing: "archivo-plexmono",
  colorBg: "#10100f",
  colorText: "#f1eee6",
  colorAccent: "#ed4b2a",
  colorLine: "#3a3935",
  cornerRadius: 10,
  motionLevel: "subtle",
};

function user(id: string, overrides: Partial<UserFixture> = {}): UserFixture {
  return {
    id,
    links: [],
    devlogEntryCount: 0,
    siteStyleDraft: null,
    siteStylePublished: null,
    ...overrides,
  };
}

function createMockDatabase({
  users = [],
  sections = [],
}: {
  users?: UserFixture[];
  sections?: Omit<StoredSection, "id">[];
}) {
  let userRows = users.map((candidate) => ({ ...candidate }));
  let sectionRows: StoredSection[] = sections.map((section, index) => ({
    ...section,
    id: `seed-section-${index}`,
  }));

  const userDelegate = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const match = userRows.find((candidate) => candidate.id === where.id);
      return match
        ? {
            links: match.links,
            _count: { devlogEntries: match.devlogEntryCount },
          }
        : null;
    }),
    findMany: vi.fn(async () =>
      [...userRows]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(({ id }) => ({ id })),
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: {
          siteStyleDraft: unknown;
          siteStylePublished: unknown;
        };
      }) => {
        const index = userRows.findIndex(
          (candidate) => candidate.id === where.id,
        );
        if (index < 0) throw new Error("User not found");
        userRows[index] = { ...userRows[index]!, ...data };
        return { ...userRows[index] };
      },
    ),
  };

  const section = {
    findFirst: vi.fn(
      async ({ where }: { where: { userId: string } }) =>
        sectionRows.find((candidate) => candidate.userId === where.userId) ??
        null,
    ),
    createMany: vi.fn(
      async ({ data }: { data: Omit<StoredSection, "id">[] }) => {
        for (const candidate of data) {
          sectionRows.push({
            ...candidate,
            id: `section-${sectionRows.length + 1}`,
          });
        }
        return { count: data.length };
      },
    ),
  };

  const database = {
    user: userDelegate,
    section,
    $transaction: vi.fn(),
  };
  database.$transaction.mockImplementation(
    async (operation: (transaction: typeof database) => Promise<unknown>) => {
      const savedUsers = userRows.map((candidate) => ({ ...candidate }));
      const savedSections = sectionRows.map((candidate) => ({ ...candidate }));
      try {
        return await operation(database);
      } catch (error) {
        userRows = savedUsers;
        sectionRows = savedSections;
        throw error;
      }
    },
  );

  return {
    database: database as never,
    mocks: {
      section,
      transaction: database.$transaction,
      user: userDelegate,
    },
    sections: (userId: string) =>
      sectionRows
        .filter((candidate) => candidate.userId === userId)
        .sort(
          (left, right) =>
            left.state.localeCompare(right.state) || left.order - right.order,
        )
        .map(({ id: _id, userId: _userId, ...candidate }) => candidate),
    user: (userId: string) => {
      const match = userRows.find((candidate) => candidate.id === userId);
      return match ? { ...match } : null;
    },
  };
}

const expectedHiddenOptionalSections = [
  { state: "DRAFT", kind: "HERO", order: 0, visible: true },
  { state: "DRAFT", kind: "PROJECT_GRID", order: 1, visible: true },
  { state: "DRAFT", kind: "ABOUT", order: 2, visible: true },
  { state: "DRAFT", kind: "BUILD_LOG", order: 3, visible: false },
  { state: "DRAFT", kind: "LINKS", order: 4, visible: false },
  { state: "PUBLISHED", kind: "HERO", order: 0, visible: true },
  { state: "PUBLISHED", kind: "PROJECT_GRID", order: 1, visible: true },
  { state: "PUBLISHED", kind: "ABOUT", order: 2, visible: true },
  { state: "PUBLISHED", kind: "BUILD_LOG", order: 3, visible: false },
  { state: "PUBLISHED", kind: "LINKS", order: 4, visible: false },
];

describe("site content migration", () => {
  it("creates matching empty draft and published trees with default visibility and styles", async () => {
    const fixture = createMockDatabase({ users: [user("user-1")] });

    await expect(ensureSiteContent("user-1", fixture.database)).resolves.toBe(
      "ready",
    );

    expect(fixture.sections("user-1")).toEqual(expectedHiddenOptionalSections);
    expect(fixture.user("user-1")).toMatchObject({
      siteStyleDraft: defaultSiteStyle,
      siteStylePublished: defaultSiteStyle,
    });
    expect(fixture.mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("shows Build log and Links when the profile has entries and a non-empty links array", async () => {
    const fixture = createMockDatabase({
      users: [
        user("user-1", {
          links: [{ label: "Portfolio", url: "https://example.com" }],
          devlogEntryCount: 1,
        }),
      ],
    });

    await ensureSiteContent("user-1", fixture.database);

    expect(
      fixture
        .sections("user-1")
        .filter(({ kind }) => kind === "BUILD_LOG" || kind === "LINKS"),
    ).toEqual([
      { state: "DRAFT", kind: "BUILD_LOG", order: 3, visible: true },
      { state: "DRAFT", kind: "LINKS", order: 4, visible: true },
      { state: "PUBLISHED", kind: "BUILD_LOG", order: 3, visible: true },
      { state: "PUBLISHED", kind: "LINKS", order: 4, visible: true },
    ]);
  });

  it("is idempotent and does not duplicate rows on a second ensure", async () => {
    const fixture = createMockDatabase({ users: [user("user-1")] });

    await ensureSiteContent("user-1", fixture.database);
    await ensureSiteContent("user-1", fixture.database);

    expect(fixture.sections("user-1")).toHaveLength(10);
    expect(fixture.mocks.section.createMany).toHaveBeenCalledTimes(1);
    expect(fixture.mocks.user.update).toHaveBeenCalledTimes(1);
    expect(fixture.mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("reports exact bulk counts for multiple seeded and existing profiles", async () => {
    const fixture = createMockDatabase({
      users: [user("existing"), user("new-a"), user("new-b")],
      sections: [
        {
          userId: "existing",
          state: "DRAFT",
          kind: "HERO",
          order: 0,
          visible: true,
        },
      ],
    });

    await expect(migrateSiteContent(fixture.database)).resolves.toEqual({
      seededProfiles: 2,
      alreadyReady: 1,
    });
    expect(fixture.sections("existing")).toHaveLength(1);
    expect(fixture.sections("new-a")).toHaveLength(10);
    expect(fixture.sections("new-b")).toHaveLength(10);
  });
});
