import { describe, expect, it, vi } from "vitest";

const ensureSiteContent = vi.hoisted(() => vi.fn(async () => "ready" as const));

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/site-content-migration", () => ({ ensureSiteContent }));

import {
  SiteDraftConflictError,
  blockInputSchema,
  publishSite,
  saveSiteDraft,
  sectionInputSchema,
  setStylePreset,
  type BlockInput,
  type SiteSnapshotInput,
} from "~/server/site-editor";
import type { SiteStyle } from "~/lib/site-style";

const defaultStyle: SiteStyle = {
  typefacePairing: "archivo-plexmono" as const,
  colorBg: "#10100f",
  colorText: "#f1eee6",
  colorAccent: "#ed4b2a",
  colorLine: "#3a3935",
  cornerRadius: 10,
  motionLevel: "subtle" as const,
};

const validBlocks: BlockInput[] = [
  { type: "TEXT", key: "text", order: 0, textContent: "<p>Hello</p>" },
  {
    type: "IMAGE",
    key: "image",
    order: 0,
    imageUrl: "https://cdn.example.com/image.jpg",
    imageResourceId: "resource-1",
    imageCaption: "A caption",
  },
  {
    type: "GALLERY",
    key: "gallery",
    order: 0,
    galleryImages: [
      {
        url: "https://cdn.example.com/gallery.jpg",
        resourceId: null,
        caption: null,
      },
    ],
  },
  {
    type: "EMBED",
    key: "embed",
    order: 0,
    embedUrl: "https://www.youtube.com/embed/video-id",
  },
  {
    type: "CODE",
    key: "code",
    order: 0,
    codeContent: "const ready = true;",
    codeLanguage: "typescript",
  },
  {
    type: "QUOTE",
    key: "quote",
    order: 0,
    quoteText: "Make it useful.",
    quoteAttribution: "A builder",
  },
  {
    type: "PROJECT",
    key: "project",
    order: 0,
    projectId: "project-1",
  },
  {
    type: "LINK",
    key: "link",
    order: 0,
    linkLabel: "Example",
    linkUrl: "https://example.com/path",
  },
];

function emptySections() {
  return [
    { kind: "HERO" as const, order: 0, visible: true, blocks: [] },
    { kind: "PROJECT_GRID" as const, order: 1, visible: true, blocks: [] },
    { kind: "ABOUT" as const, order: 2, visible: true, blocks: [] },
    { kind: "BUILD_LOG" as const, order: 3, visible: true, blocks: [] },
    { kind: "LINKS" as const, order: 4, visible: true, blocks: [] },
  ];
}

function snapshot(revision: number): SiteSnapshotInput {
  return {
    revision,
    sections: emptySections(),
    style: defaultStyle,
  };
}

function createMockDatabase({
  revision = 0,
  siteStyleDraft = defaultStyle,
  siteStylePublished = defaultStyle,
}: {
  revision?: number;
  siteStyleDraft?: typeof defaultStyle;
  siteStylePublished?: typeof defaultStyle;
} = {}) {
  let user = {
    id: "user-1",
    siteDraftRevision: revision,
    siteStyleDraft: { ...siteStyleDraft },
    siteStylePublished: { ...siteStylePublished },
  };
  let sectionSequence = 0;

  const userDelegate = {
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: {
          id: string;
          siteDraftRevision: { lt?: number; lte?: number };
        };
        data: Record<string, unknown>;
      }) => {
        const matches =
          where.id === user.id &&
          (where.siteDraftRevision.lt !== undefined
            ? user.siteDraftRevision < where.siteDraftRevision.lt
            : user.siteDraftRevision <= where.siteDraftRevision.lte!);
        if (!matches) return { count: 0 };
        user = {
          ...user,
          ...data,
          siteStyleDraft:
            (data.siteStyleDraft as typeof defaultStyle | undefined) ??
            user.siteStyleDraft,
          siteStylePublished:
            (data.siteStylePublished as typeof defaultStyle | undefined) ??
            user.siteStylePublished,
        };
        return { count: 1 };
      },
    ),
    findUniqueOrThrow: vi.fn(async () => ({
      siteStyleDraft: user.siteStyleDraft,
      siteStylePublished: user.siteStylePublished,
    })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      user = {
        ...user,
        ...data,
        siteStyleDraft:
          (data.siteStyleDraft as typeof defaultStyle | undefined) ??
          user.siteStyleDraft,
        siteStylePublished:
          (data.siteStylePublished as typeof defaultStyle | undefined) ??
          user.siteStylePublished,
      };
      return {
        siteStyleDraft: user.siteStyleDraft,
        siteStylePublished: user.siteStylePublished,
      };
    }),
  };
  const section = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(async ({ data: _data }: { data: { state: string } }) => ({
      id: `section-${++sectionSequence}`,
    })),
  };
  const block = {
    createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({
      count: data.length,
    })),
  };
  const database = {
    user: userDelegate,
    section,
    block,
    project: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id })),
      ),
    },
    imageResource: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id })),
      ),
    },
    $transaction: vi.fn(
      async (operation: (transaction: typeof database) => Promise<unknown>) =>
        operation(database),
    ),
  };

  return {
    database: database as never,
    mocks: { block, section, user: userDelegate },
    user: () => ({ ...user }),
  };
}

describe("site block validation", () => {
  it.each(validBlocks)("accepts a valid $type block", (block) => {
    expect(blockInputSchema.safeParse(block).success).toBe(true);
  });

  it.each(validBlocks)(
    "rejects wrong-type fields on a $type block",
    (block) => {
      const invalid =
        block.type === "TEXT"
          ? { ...block, projectId: "project-1" }
          : { ...block, textContent: "not valid for this type" };
      expect(blockInputSchema.safeParse(invalid).success).toBe(false);
    },
  );

  it("accepts only allowlisted HTTPS embed hosts", () => {
    expect(
      blockInputSchema.safeParse({
        type: "EMBED",
        key: "allowed",
        order: 0,
        embedUrl: "https://player.vimeo.com/video/123",
      }).success,
    ).toBe(true);
    expect(
      blockInputSchema.safeParse({
        type: "EMBED",
        key: "disallowed",
        order: 0,
        embedUrl: "https://example.com/embed/123",
      }).success,
    ).toBe(false);
    expect(
      blockInputSchema.safeParse({
        type: "EMBED",
        key: "insecure",
        order: 0,
        embedUrl: "http://www.youtube.com/embed/123",
      }).success,
    ).toBe(false);
  });
});

describe("site section validation", () => {
  it.each(["HERO", "BUILD_LOG", "LINKS"] as const)(
    "requires %s to have no manual blocks",
    (kind) => {
      expect(
        sectionInputSchema.safeParse({
          kind,
          order: 0,
          visible: true,
          blocks: [validBlocks[0]],
        }).success,
      ).toBe(false);
    },
  );

  it("allows only PROJECT blocks in PROJECT_GRID", () => {
    expect(
      sectionInputSchema.safeParse({
        kind: "PROJECT_GRID",
        order: 1,
        visible: true,
        blocks: [validBlocks[6]],
      }).success,
    ).toBe(true);
    expect(
      sectionInputSchema.safeParse({
        kind: "PROJECT_GRID",
        order: 1,
        visible: true,
        blocks: [validBlocks[0]],
      }).success,
    ).toBe(false);
  });

  it("rejects PROJECT blocks in ABOUT", () => {
    expect(
      sectionInputSchema.safeParse({
        kind: "ABOUT",
        order: 2,
        visible: true,
        blocks: [validBlocks[6]],
      }).success,
    ).toBe(false);
  });
});

describe("site draft concurrency", () => {
  it("silently ignores a save at an already-claimed revision", async () => {
    const fixture = createMockDatabase({ revision: 2 });

    await expect(
      saveSiteDraft("user-1", snapshot(2), fixture.database),
    ).resolves.toMatchObject({ revision: 2 });
    expect(fixture.mocks.section.deleteMany).not.toHaveBeenCalled();
    expect(fixture.mocks.section.create).not.toHaveBeenCalled();
    expect(fixture.user().siteDraftRevision).toBe(2);
  });

  it("throws when publishing behind the saved revision", async () => {
    const fixture = createMockDatabase({ revision: 2 });

    await expect(
      publishSite("user-1", snapshot(1), fixture.database),
    ).rejects.toBeInstanceOf(SiteDraftConflictError);
    expect(fixture.mocks.section.deleteMany).not.toHaveBeenCalled();
  });

  it("publishes the snapshot to matching DRAFT and PUBLISHED trees", async () => {
    const fixture = createMockDatabase({ revision: 0 });

    await publishSite("user-1", snapshot(1), fixture.database);

    expect(fixture.mocks.section.create).toHaveBeenCalledTimes(10);
    expect(
      fixture.mocks.section.create.mock.calls
        .slice(0, 5)
        .map(([input]) => input.data.state),
    ).toEqual(Array.from({ length: 5 }, () => "DRAFT"));
    expect(
      fixture.mocks.section.create.mock.calls
        .slice(5)
        .map(([input]) => input.data.state),
    ).toEqual(Array.from({ length: 5 }, () => "PUBLISHED"));
  });
});

describe("setStylePreset", () => {
  it("updates both color sets without changing typography, radius, or motion", async () => {
    const fixture = createMockDatabase({
      siteStyleDraft: {
        ...defaultStyle,
        typefacePairing: "newsreader-archivo",
        cornerRadius: 3,
        motionLevel: "none",
      },
      siteStylePublished: {
        ...defaultStyle,
        typefacePairing: "schibsted-plexmono",
        cornerRadius: 22,
        motionLevel: "full",
      },
    });

    await setStylePreset("user-1", "cream", fixture.database);

    expect(ensureSiteContent).toHaveBeenCalledWith("user-1", fixture.database);
    expect(fixture.user()).toMatchObject({
      siteStyleDraft: {
        typefacePairing: "newsreader-archivo",
        colorBg: "#f1eee6",
        colorText: "#17150f",
        colorAccent: "#ed4b2a",
        colorLine: "#c9c2b0",
        cornerRadius: 3,
        motionLevel: "none",
      },
      siteStylePublished: {
        typefacePairing: "schibsted-plexmono",
        colorBg: "#f1eee6",
        colorText: "#17150f",
        colorAccent: "#ed4b2a",
        colorLine: "#c9c2b0",
        cornerRadius: 22,
        motionLevel: "full",
      },
    });
  });
});
