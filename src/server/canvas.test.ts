import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import {
  canvasElementInputSchema,
  CanvasOwnershipError,
  dismissCanvasHint,
  getCanvasEditorState,
  publishCanvasLayout,
  sanitizeCanvasText,
  saveCanvasDraft,
  setLayoutMode,
  type CanvasElementInput,
} from "~/server/canvas";
import { CANVAS_MIN_WIDTH, CANVAS_WIDTH } from "~/lib/canvas-constants";
import { getPublicProfile } from "~/server/profiles";
import { deleteProject } from "~/server/projects";

type ElementState = "DRAFT" | "PUBLISHED";

type StoredElement = {
  id: string;
  userId: string;
  state: ElementState;
  type: CanvasElementInput["type"];
  projectId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

type ProjectFixture = {
  id: string;
  title: string;
  media: { url: string }[];
};

function storedElement(
  input: CanvasElementInput,
  state: ElementState,
  id: string,
): StoredElement {
  return {
    id,
    userId: "user-1",
    state,
    type: input.type,
    projectId: input.projectId ?? null,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    zIndex: input.zIndex,
  };
}

function createMockDatabase({
  initialElements = [],
  projects = [],
  draftSavedAt = null,
  publishedAt = null,
  hintDismissedAt = null,
}: {
  initialElements?: StoredElement[];
  projects?: ProjectFixture[];
  draftSavedAt?: Date | null;
  publishedAt?: Date | null;
  hintDismissedAt?: Date | null;
} = {}) {
  let elements = initialElements.map((element) => ({ ...element }));
  let projectItems = projects.map((project) => ({ ...project }));
  const user = {
    id: "user-1",
    layoutMode: "GRID" as "GRID" | "CANVAS",
    canvasDraftSavedAt: draftSavedAt,
    canvasPublishedAt: publishedAt,
    canvasHintDismissedAt: hintDismissedAt,
  };

  const canvasElement = {
    count: vi.fn(
      async ({ where }: { where: { userId: string } }) =>
        elements.filter((element) => element.userId === where.userId).length,
    ),
    createMany: vi.fn(
      async ({ data }: { data: Omit<StoredElement, "id">[] }) => {
        for (const row of data) {
          elements.push({ ...row, id: `element-${elements.length + 1}` });
        }
        return { count: data.length };
      },
    ),
    deleteMany: vi.fn(
      async ({
        where,
      }: {
        where: {
          userId: string;
          state: ElementState | { in: ElementState[] };
        };
      }) => {
        const states =
          typeof where.state === "string" ? [where.state] : where.state.in;
        const before = elements.length;
        elements = elements.filter(
          (element) =>
            element.userId !== where.userId || !states.includes(element.state),
        );
        return { count: before - elements.length };
      },
    ),
    findMany: vi.fn(
      async ({ where }: { where: { userId: string; state: ElementState } }) =>
        elements
          .filter(
            (element) =>
              element.userId === where.userId && element.state === where.state,
          )
          .sort((left, right) => left.zIndex - right.zIndex)
          .map((element) => ({ ...element })),
    ),
  };

  const project = {
    findMany: vi.fn(
      async ({
        where,
        select,
      }: {
        where: { userId: string; id?: { in: string[] } };
        select: { id?: boolean; title?: boolean };
      }) => {
        const matching = projectItems.filter(
          (item) => !where.id || where.id.in.includes(item.id),
        );
        if (select.title) return matching.map((item) => ({ ...item }));
        return matching.map(({ id }) => ({ id }));
      },
    ),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const found = projectItems.find((item) => item.id === where.id);
      return found ? { userId: "user-1" } : null;
    }),
    // Simulates the schema's `onDelete: Cascade` FK on CanvasElement.projectId
    // (see prisma/migrations/20260716030000_portfolio_canvas_builder) — a real
    // Postgres delete removes dependent CanvasElement rows the same way.
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const found = projectItems.find((item) => item.id === where.id);
      projectItems = projectItems.filter((item) => item.id !== where.id);
      elements = elements.filter((element) => element.projectId !== where.id);
      return found ?? null;
    }),
  };

  const userDelegate = {
    update: vi.fn(async ({ data }: { data: Partial<typeof user> }) => {
      Object.assign(user, data);
      return { ...user };
    }),
    findUniqueOrThrow: vi.fn(async () => ({ ...user })),
  };

  const database = {
    canvasElement,
    project,
    user: userDelegate,
    $transaction: vi.fn(),
  };
  database.$transaction.mockImplementation(
    async (operation: (transaction: typeof database) => Promise<unknown>) =>
      operation(database),
  );

  return {
    database: database as never,
    mocks: {
      canvasElement,
      project,
      user: userDelegate,
      transaction: database.$transaction,
    },
    rows: () => elements.map((element) => ({ ...element })),
    user,
  };
}

function elementsOverlap(left: StoredElement, right: StoredElement) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

describe("portfolio canvas", () => {
  it("auto-places existing content as non-overlapping draft elements on first CANVAS switch", async () => {
    const fixture = createMockDatabase({
      projects: [
        { id: "project-2", title: "Second", media: [] },
        { id: "project-1", title: "First", media: [] },
      ],
    });

    await setLayoutMode("user-1", "CANVAS", fixture.database);

    const rows = fixture.rows();
    // Identity elements (Avatar, Name, Username, Categories) are auto-placed
    // above/alongside About/Links/Project on first canvas entry. Categories is
    // included because the user has at least one project (spec Requirement 4).
    expect(rows).toHaveLength(8);
    expect(rows.every((row) => row.state === "DRAFT")).toBe(true);
    expect(rows.some((row) => row.state === "PUBLISHED")).toBe(false);
    expect(rows.map((row) => row.type)).toEqual([
      "AVATAR",
      "NAME",
      "USERNAME",
      "CATEGORIES",
      "ABOUT",
      "LINKS",
      "PROJECT",
      "PROJECT",
    ]);
    for (let left = 0; left < rows.length; left += 1) {
      for (let right = left + 1; right < rows.length; right += 1) {
        expect(elementsOverlap(rows[left]!, rows[right]!)).toBe(false);
      }
    }
    expect(fixture.user.canvasDraftSavedAt).toBeInstanceOf(Date);
  });

  it("omits Categories from the starting layout when the user has no projects", async () => {
    const fixture = createMockDatabase();

    await setLayoutMode("user-1", "CANVAS", fixture.database);

    const rows = fixture.rows();
    expect(rows.map((row) => row.type)).toEqual([
      "AVATAR",
      "NAME",
      "USERNAME",
      "ABOUT",
      "LINKS",
    ]);
  });

  it("does not duplicate the initial layout on a later CANVAS switch", async () => {
    const existing = storedElement(
      { type: "ABOUT", x: 0, y: 0, width: 300, height: 200, zIndex: 1 },
      "DRAFT",
      "existing",
    );
    const fixture = createMockDatabase({ initialElements: [existing] });

    await setLayoutMode("user-1", "CANVAS", fixture.database);

    expect(fixture.rows()).toEqual([existing]);
    expect(fixture.mocks.canvasElement.createMany).not.toHaveBeenCalled();
    expect(fixture.mocks.project.findMany).not.toHaveBeenCalled();
  });

  it("switches to GRID without deleting retained canvas rows", async () => {
    const existing = storedElement(
      { type: "LINKS", x: 0, y: 0, width: 300, height: 200, zIndex: 1 },
      "PUBLISHED",
      "existing",
    );
    const fixture = createMockDatabase({ initialElements: [existing] });

    await setLayoutMode("user-1", "GRID", fixture.database);

    expect(fixture.rows()).toEqual([existing]);
    expect(fixture.mocks.canvasElement.deleteMany).not.toHaveBeenCalled();
    expect(fixture.user.layoutMode).toBe("GRID");
  });

  it("clamps draft elements to the canvas and minimum size", async () => {
    const fixture = createMockDatabase();

    const result = await saveCanvasDraft(
      "user-1",
      [
        {
          type: "ABOUT",
          x: 5000,
          y: -20,
          width: 10,
          height: 5,
          zIndex: 1,
        },
      ],
      fixture.database,
    );

    expect(result).toEqual([
      {
        type: "ABOUT",
        x: CANVAS_WIDTH - CANVAS_MIN_WIDTH,
        y: 0,
        width: 160,
        height: 80,
        zIndex: 1,
      },
    ]);
    expect(fixture.rows()[0]).toMatchObject(result[0]!);
  });

  it("rejects a project owned by another user", async () => {
    const fixture = createMockDatabase();

    await expect(
      saveCanvasDraft(
        "user-1",
        [
          {
            type: "PROJECT",
            projectId: "other-project",
            x: 0,
            y: 0,
            width: 300,
            height: 200,
            zIndex: 1,
          },
        ],
        fixture.database,
      ),
    ).rejects.toBeInstanceOf(CanvasOwnershipError);
    expect(fixture.mocks.transaction).not.toHaveBeenCalled();
  });

  it("removes an omitted draft element and reports it as unplaced", async () => {
    const about = {
      type: "ABOUT" as const,
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      zIndex: 1,
    };
    const links = {
      type: "LINKS" as const,
      x: 0,
      y: 220,
      width: 300,
      height: 100,
      zIndex: 2,
    };
    const fixture = createMockDatabase({
      initialElements: [
        storedElement(about, "DRAFT", "about"),
        storedElement(links, "DRAFT", "links"),
      ],
      draftSavedAt: new Date("2026-07-16T12:00:00Z"),
    });

    await saveCanvasDraft("user-1", [about], fixture.database);
    const editor = await getCanvasEditorState("user-1", fixture.database);

    expect(editor.elements).toHaveLength(1);
    expect(editor.elements[0]).toMatchObject({ type: "ABOUT" });
    expect(editor.library.find((item) => item.type === "ABOUT")).toEqual({
      type: "ABOUT",
      placed: true,
    });
    expect(editor.library.find((item) => item.type === "LINKS")).toEqual({
      type: "LINKS",
      placed: false,
    });
  });

  it("publishes the caller's elements to both states and reloads that exact layout", async () => {
    const staleDraft = storedElement(
      { type: "ABOUT", x: 0, y: 0, width: 300, height: 200, zIndex: 1 },
      "DRAFT",
      "stale",
    );
    const fixture = createMockDatabase({
      initialElements: [staleDraft],
      draftSavedAt: new Date("2026-07-16T12:00:00Z"),
    });
    const current = {
      type: "LINKS" as const,
      x: 40,
      y: 60,
      width: 400,
      height: 180,
      zIndex: 7,
    };

    await publishCanvasLayout("user-1", [current], fixture.database);

    expect(fixture.mocks.canvasElement.createMany).toHaveBeenCalledTimes(2);
    expect(fixture.rows()).toEqual([
      expect.objectContaining({ ...current, state: "DRAFT" }),
      expect.objectContaining({ ...current, state: "PUBLISHED" }),
    ]);
    expect(fixture.user.canvasDraftSavedAt).toBe(
      fixture.user.canvasPublishedAt,
    );

    const editor = await getCanvasEditorState("user-1", fixture.database);
    expect(editor.elements).toHaveLength(1);
    expect(editor.elements[0]).toMatchObject(current);
    expect(editor.elements[0]?.state).toBe("PUBLISHED");
  });

  it("shows the hint only when undismissed and no elements are placed", async () => {
    const fresh = createMockDatabase();
    expect(
      (await getCanvasEditorState("user-1", fresh.database)).shouldShowHint,
    ).toBe(true);

    const dismissed = createMockDatabase({
      hintDismissedAt: new Date("2026-07-16T12:00:00Z"),
    });
    expect(
      (await getCanvasEditorState("user-1", dismissed.database)).shouldShowHint,
    ).toBe(false);

    const withElement = createMockDatabase({
      initialElements: [
        storedElement(
          { type: "ABOUT", x: 0, y: 0, width: 300, height: 200, zIndex: 1 },
          "DRAFT",
          "about",
        ),
      ],
      draftSavedAt: new Date("2026-07-16T12:00:00Z"),
    });
    expect(
      (await getCanvasEditorState("user-1", withElement.database))
        .shouldShowHint,
    ).toBe(false);
  });

  it("dismissCanvasHint persists the dismissal so the hint stays suppressed", async () => {
    const fixture = createMockDatabase();

    await dismissCanvasHint("user-1", fixture.database);

    expect(fixture.user.canvasHintDismissedAt).toBeInstanceOf(Date);
    expect(
      (await getCanvasEditorState("user-1", fixture.database)).shouldShowHint,
    ).toBe(false);
  });

  it("removes a deleted project's canvas placement with no dangling reference", async () => {
    const placedProject = storedElement(
      {
        type: "PROJECT",
        projectId: "project-1",
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        zIndex: 1,
      },
      "PUBLISHED",
      "placed-project",
    );
    const fixture = createMockDatabase({
      initialElements: [placedProject],
      projects: [{ id: "project-1", title: "Deleted later", media: [] }],
      publishedAt: new Date("2026-07-16T12:00:00Z"),
    });

    await deleteProject("project-1", "user-1", fixture.mocks.project as never);

    // The FK cascade (simulated by the mock's `delete`, matching the real
    // `onDelete: Cascade` in the schema) already removed the row directly.
    expect(fixture.rows()).toHaveLength(0);

    const editor = await getCanvasEditorState("user-1", fixture.database);
    expect(editor.elements).toHaveLength(0);
    expect(editor.library.some((item) => item.type === "PROJECT")).toBe(false);
  });
});

describe("canvas identity elements", () => {
  it("treats identity types as single-instance like About/Links", async () => {
    const fixture = createMockDatabase();

    await expect(
      saveCanvasDraft(
        "user-1",
        [
          { type: "NAME", x: 0, y: 0, width: 300, height: 64, zIndex: 1 },
          { type: "NAME", x: 0, y: 100, width: 300, height: 64, zIndex: 2 },
        ],
        fixture.database,
      ),
    ).rejects.toThrow();
  });

  it("rejects a directly-typed text content field on an identity element", async () => {
    const result = canvasElementInputSchema.safeParse({
      type: "NAME",
      textContent: "typed name",
      x: 0,
      y: 0,
      width: 300,
      height: 64,
      zIndex: 1,
    });
    expect(result.success).toBe(false);
  });

  it("persists per-element style columns and scopes them to that element", async () => {
    const fixture = createMockDatabase();

    await saveCanvasDraft(
      "user-1",
      [
        {
          type: "NAME",
          x: 0,
          y: 0,
          width: 300,
          height: 64,
          zIndex: 1,
          textColor: "#ff0000",
          backgroundColor: "transparent",
          fontFamily: "serif",
        },
        {
          type: "AVATAR",
          x: 0,
          y: 100,
          width: 160,
          height: 160,
          zIndex: 2,
          avatarShape: "square",
          avatarZoom: 150,
          avatarOffsetX: 40,
          avatarOffsetY: 60,
        },
        { type: "ABOUT", x: 0, y: 300, width: 400, height: 200, zIndex: 3 },
      ],
      fixture.database,
    );

    const rows = fixture.rows() as unknown as Array<{
      type: string;
      textColor: string | null;
      backgroundColor: string | null;
      fontFamily: string | null;
      avatarShape: string | null;
      avatarZoom: number | null;
    }>;
    const name = rows.find((row) => row.type === "NAME")!;
    const avatar = rows.find((row) => row.type === "AVATAR")!;
    const about = rows.find((row) => row.type === "ABOUT")!;

    expect(name.textColor).toBe("#ff0000");
    expect(name.backgroundColor).toBe("transparent");
    expect(name.fontFamily).toBe("serif");
    expect(avatar.avatarShape).toBe("square");
    expect(avatar.avatarZoom).toBe(150);
    // Style is scoped per element: the unstyled About carries no style.
    expect(about.textColor).toBeNull();
    expect(about.fontFamily).toBeNull();
    // Avatar-only fields never leak onto non-avatar elements.
    expect(name.avatarShape).toBeNull();
  });

  it("rejects an unsafe (non-hex) style color", async () => {
    const result = canvasElementInputSchema.safeParse({
      type: "NAME",
      textColor: "red; background: url(evil)",
      x: 0,
      y: 0,
      width: 300,
      height: 64,
      zIndex: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("public profile canvas data", () => {
  it("attaches only published canvas elements in CANVAS mode", async () => {
    const users = {
      findFirst: vi.fn().mockResolvedValue({
        id: "user-1",
        username: "alice",
        layoutMode: "CANVAS",
        projects: [],
      }),
    };
    const projects = {
      findMany: vi.fn().mockResolvedValue([{ category: "DESIGNER" }]),
    };
    const publishedElements = [
      { id: "element-1", state: "PUBLISHED", type: "ABOUT" },
    ];
    const canvasElements = {
      findMany: vi.fn().mockResolvedValue(publishedElements),
    };

    const profile = await getPublicProfile(
      "Alice",
      null,
      users,
      projects,
      canvasElements,
    );

    expect(users.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { username: "alice", banned: false },
      }),
    );
    expect(canvasElements.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", state: "PUBLISHED" },
      include: {
        project: {
          include: { media: { orderBy: { order: "asc" } } },
        },
      },
      orderBy: { zIndex: "asc" },
    });
    expect(profile).toMatchObject({
      categories: ["DESIGNER"],
      canvasElements: publishedElements,
    });
  });

  it("does not query canvas rows in GRID mode", async () => {
    const users = {
      findFirst: vi.fn().mockResolvedValue({
        id: "user-1",
        username: "alice",
        layoutMode: "GRID",
        projects: [],
      }),
    };
    const projects = { findMany: vi.fn().mockResolvedValue([]) };
    const canvasElements = { findMany: vi.fn() };

    const profile = await getPublicProfile(
      "alice",
      null,
      users,
      projects,
      canvasElements,
    );

    expect(canvasElements.findMany).not.toHaveBeenCalled();
    expect(
      profile && !("isPrivate" in profile) && profile.canvasElements,
    ).toEqual([]);
  });
});

describe("sanitizeCanvasText", () => {
  it("strips script tags but keeps allowed formatting", () => {
    const dirty = "<p>Hello <script>alert(1)</script><b>world</b></p>";
    expect(sanitizeCanvasText(dirty)).toBe("<p>Hello <b>world</b></p>");
  });

  it("strips iframes", () => {
    expect(sanitizeCanvasText('<iframe src="evil.com"></iframe>text')).toBe(
      "text",
    );
  });

  it("drops unsafe javascript: hrefs but keeps the link text", () => {
    expect(sanitizeCanvasText('<a href="javascript:alert(1)">click</a>')).toBe(
      "<a>click</a>",
    );
  });

  it("keeps safe http(s) hrefs", () => {
    expect(sanitizeCanvasText('<a href="https://example.com">link</a>')).toBe(
      '<a href="https://example.com">link</a>',
    );
  });
});

describe("canvasElementInputSchema — LINK elements", () => {
  const base = { x: 0, y: 0, width: 200, height: 80, zIndex: 1 };

  it("rejects a javascript: url", () => {
    const result = canvasElementInputSchema.safeParse({
      ...base,
      type: "LINK",
      linkLabel: "My site",
      linkUrl: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty url", () => {
    const result = canvasElementInputSchema.safeParse({
      ...base,
      type: "LINK",
      linkLabel: "My site",
      linkUrl: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid https url", () => {
    const result = canvasElementInputSchema.safeParse({
      ...base,
      type: "LINK",
      linkLabel: "My site",
      linkUrl: "https://example.com",
    });
    expect(result.success).toBe(true);
  });
});

describe("no cap on TEXT/IMAGE/LINK elements", () => {
  it("allows multiple TEXT elements in one draft save", async () => {
    const fixture = createMockDatabase();

    const textElement = (zIndex: number): CanvasElementInput => ({
      type: "TEXT",
      textContent: `<p>Note ${zIndex}</p>`,
      x: 0,
      y: zIndex * 100,
      width: 200,
      height: 80,
      zIndex,
    });

    await saveCanvasDraft(
      "user-1",
      [textElement(1), textElement(2), textElement(3)],
      fixture.database,
    );

    expect(fixture.rows()).toHaveLength(3);
    expect(fixture.rows().every((row) => row.type === "TEXT")).toBe(true);
  });

  it("allows several TEXT, IMAGE, and LINK elements to coexist in one draft save", async () => {
    const fixture = createMockDatabase();

    const elements: CanvasElementInput[] = [
      {
        type: "TEXT",
        textContent: "<p>First note</p>",
        x: 0,
        y: 0,
        width: 200,
        height: 80,
        zIndex: 1,
      },
      {
        type: "TEXT",
        textContent: "<p>Second note</p>",
        x: 0,
        y: 100,
        width: 200,
        height: 80,
        zIndex: 2,
      },
      {
        type: "IMAGE",
        imageUrl: "https://example.com/one.png",
        x: 0,
        y: 200,
        width: 200,
        height: 80,
        zIndex: 3,
      },
      {
        type: "IMAGE",
        imageUrl: "https://example.com/two.png",
        x: 0,
        y: 300,
        width: 200,
        height: 80,
        zIndex: 4,
      },
      {
        type: "LINK",
        linkLabel: "Site one",
        linkUrl: "https://example.com/one",
        x: 0,
        y: 400,
        width: 200,
        height: 80,
        zIndex: 5,
      },
      {
        type: "LINK",
        linkLabel: "Site two",
        linkUrl: "https://example.com/two",
        x: 0,
        y: 500,
        width: 200,
        height: 80,
        zIndex: 6,
      },
    ];

    await saveCanvasDraft("user-1", elements, fixture.database);

    const rows = fixture.rows();
    expect(rows).toHaveLength(6);
    expect(rows.filter((row) => row.type === "TEXT")).toHaveLength(2);
    expect(rows.filter((row) => row.type === "IMAGE")).toHaveLength(2);
    expect(rows.filter((row) => row.type === "LINK")).toHaveLength(2);
  });
});

describe("canvas project card overrides", () => {
  type OverrideRow = {
    type: string;
    projectId: string | null;
    projectTitleOverride: string | null;
    projectDescriptionOverride: string | null;
    projectHashtagsOverride: unknown;
    cardLayout: string | null;
  };

  it("persists PROJECT card overrides without modifying the Project row", async () => {
    const fixture = createMockDatabase({
      projects: [{ id: "project-1", title: "Real title", media: [] }],
    });

    await saveCanvasDraft(
      "user-1",
      [
        {
          type: "PROJECT",
          projectId: "project-1",
          projectTitleOverride: "Canvas title",
          projectDescriptionOverride: "Canvas blurb",
          // Explicit empty-list override — must persist as [] (not unset).
          projectHashtagsOverride: [],
          cardLayout: "text-only",
          x: 0,
          y: 0,
          width: 320,
          height: 240,
          zIndex: 1,
        },
      ],
      fixture.database,
    );

    const row = fixture.rows()[0] as unknown as OverrideRow;
    expect(row.projectTitleOverride).toBe("Canvas title");
    expect(row.projectDescriptionOverride).toBe("Canvas blurb");
    expect(row.projectHashtagsOverride).toEqual([]);
    expect(row.cardLayout).toBe("text-only");

    // The Project row itself is untouched: reading it back shows the original
    // title, and the project delegate exposes no write path (only ownership
    // reads via findMany), so nothing could have modified it.
    const projectsAfter = (await fixture.mocks.project.findMany({
      where: { userId: "user-1" },
      select: { id: true, title: true },
    })) as Array<{ id: string; title: string }>;
    expect(projectsAfter).toHaveLength(1);
    expect(projectsAfter[0]?.id).toBe("project-1");
    expect(projectsAfter[0]?.title).toBe("Real title");
    expect(fixture.mocks.project.findMany).toHaveBeenCalled();
    expect(
      (fixture.mocks.project as Record<string, unknown>).update,
    ).toBeUndefined();
  });

  it("normalizes a hashtags override the same way project hashtags are normalized", async () => {
    const fixture = createMockDatabase({
      projects: [{ id: "project-1", title: "Real", media: [] }],
    });

    await saveCanvasDraft(
      "user-1",
      [
        {
          type: "PROJECT",
          projectId: "project-1",
          projectHashtagsOverride: ["#Foo", "Bar", "foo"],
          x: 0,
          y: 0,
          width: 320,
          height: 240,
          zIndex: 1,
        },
      ],
      fixture.database,
    );

    const row = fixture.rows()[0] as unknown as OverrideRow;
    expect(row.projectHashtagsOverride).toEqual(["foo", "bar"]);
  });

  it("rejects project card overrides on a non-PROJECT element", () => {
    const result = canvasElementInputSchema.safeParse({
      type: "TEXT",
      textContent: "<p>hi</p>",
      cardLayout: "text-only",
      x: 0,
      y: 0,
      width: 200,
      height: 80,
      zIndex: 1,
    });
    expect(result.success).toBe(false);
  });

  it("removes a deleted project's placement and its overrides with no orphan", async () => {
    const fixture = createMockDatabase({
      projects: [{ id: "project-1", title: "Real", media: [] }],
    });

    await saveCanvasDraft(
      "user-1",
      [
        {
          type: "PROJECT",
          projectId: "project-1",
          projectTitleOverride: "Canvas title",
          projectHashtagsOverride: ["keep"],
          cardLayout: "media-left",
          x: 0,
          y: 0,
          width: 320,
          height: 240,
          zIndex: 1,
        },
      ],
      fixture.database,
    );
    expect(fixture.rows()).toHaveLength(1);

    await deleteProject("project-1", "user-1", fixture.mocks.project as never);

    // The FK cascade removed the row (and its override columns) — no orphan.
    expect(fixture.rows()).toHaveLength(0);
  });
});
