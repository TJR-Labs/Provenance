import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import {
  CanvasOwnershipError,
  getCanvasEditorState,
  publishCanvasLayout,
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
}: {
  initialElements?: StoredElement[];
  projects?: ProjectFixture[];
  draftSavedAt?: Date | null;
  publishedAt?: Date | null;
} = {}) {
  let elements = initialElements.map((element) => ({ ...element }));
  let projectItems = projects.map((project) => ({ ...project }));
  const user = {
    id: "user-1",
    layoutMode: "GRID" as "GRID" | "CANVAS",
    canvasDraftSavedAt: draftSavedAt,
    canvasPublishedAt: publishedAt,
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
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.state === "DRAFT")).toBe(true);
    expect(rows.some((row) => row.state === "PUBLISHED")).toBe(false);
    expect(rows.map((row) => row.type)).toEqual([
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
    expect(editor.library.slice(0, 2)).toEqual([
      { type: "ABOUT", placed: true },
      { type: "LINKS", placed: false },
    ]);
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
    expect(editor.library.some((item) => item.type === "PROJECT")).toBe(
      false,
    );
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
      users,
      projects,
      canvasElements,
    );

    expect(canvasElements.findMany).not.toHaveBeenCalled();
    expect(profile?.canvasElements).toEqual([]);
  });
});
