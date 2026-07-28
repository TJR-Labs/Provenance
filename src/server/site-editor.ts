import sanitizeHtml from "sanitize-html";
import { Prisma } from "../../generated/prisma";
import type { PrismaClient } from "../../generated/prisma";
import { z } from "zod";

import { safeExternalUrl } from "~/app/safe-external-url";
import {
  DEFAULT_SITE_STYLE,
  LEGACY_THEME_STYLE_PRESETS,
  MOTION_LEVELS,
  TYPEFACE_PAIRINGS,
  clampInt,
  isAllowedEmbedUrl,
  isSafeCanvasColor,
  type SiteStyle,
} from "~/lib/site-style";
import { db } from "~/server/db";
import { ensureSiteContent } from "~/server/site-content-migration";

const BLOCK_KINDS = [
  "TEXT",
  "IMAGE",
  "GALLERY",
  "EMBED",
  "CODE",
  "QUOTE",
  "PROJECT",
  "LINK",
] as const;

const SECTION_KINDS = [
  "HERO",
  "PROJECT_GRID",
  "ABOUT",
  "BUILD_LOG",
  "LINKS",
] as const;

const galleryImageInputSchema = z.object({
  url: z.string().min(1),
  resourceId: z.string().min(1).nullable(),
  caption: z.string().nullable(),
});

const BLOCK_FIELD_OWNERS = {
  projectId: "PROJECT",
  textContent: "TEXT",
  imageUrl: "IMAGE",
  imageResourceId: "IMAGE",
  imageCaption: "IMAGE",
  galleryImages: "GALLERY",
  embedUrl: "EMBED",
  codeContent: "CODE",
  codeLanguage: "CODE",
  quoteText: "QUOTE",
  quoteAttribution: "QUOTE",
  linkLabel: "LINK",
  linkUrl: "LINK",
} as const;

export const blockInputSchema = z
  .object({
    type: z.enum(BLOCK_KINDS),
    key: z.string().min(1),
    order: z.number().int().nonnegative(),
    projectId: z.string().min(1).optional(),
    textContent: z.string().min(1).optional(),
    imageUrl: z.string().min(1).optional(),
    imageResourceId: z.string().min(1).optional(),
    imageCaption: z.string().optional(),
    galleryImages: z.array(galleryImageInputSchema).max(20).optional(),
    embedUrl: z.string().min(1).optional(),
    codeContent: z.string().min(1).optional(),
    codeLanguage: z.string().optional(),
    quoteText: z.string().min(1).optional(),
    quoteAttribution: z.string().optional(),
    linkLabel: z.string().min(1).optional(),
    linkUrl: z.string().min(1).optional(),
  })
  .superRefine((block, context) => {
    for (const [field, owner] of Object.entries(BLOCK_FIELD_OWNERS)) {
      const typedField = field as keyof typeof BLOCK_FIELD_OWNERS;
      if (block[typedField] !== undefined && block.type !== owner) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} is only valid for ${owner} blocks.`,
          path: [field],
        });
      }
    }

    const required = (
      field: keyof typeof BLOCK_FIELD_OWNERS,
      message: string,
    ) => {
      if (block[field] === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message,
          path: [field],
        });
      }
    };

    if (block.type === "PROJECT") {
      required("projectId", "projectId is required for PROJECT blocks.");
    }
    if (block.type === "TEXT") {
      required("textContent", "textContent is required for TEXT blocks.");
    }
    if (block.type === "IMAGE") {
      required("imageUrl", "imageUrl is required for IMAGE blocks.");
      required(
        "imageResourceId",
        "imageResourceId is required for IMAGE blocks.",
      );
    }
    if (block.type === "GALLERY") {
      required(
        "galleryImages",
        "galleryImages is required for GALLERY blocks.",
      );
    }
    if (block.type === "EMBED") {
      required("embedUrl", "embedUrl is required for EMBED blocks.");
      if (block.embedUrl && !isAllowedEmbedUrl(block.embedUrl)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "embedUrl must be an allowed HTTPS embed URL.",
          path: ["embedUrl"],
        });
      }
    }
    if (block.type === "CODE") {
      required("codeContent", "codeContent is required for CODE blocks.");
    }
    if (block.type === "QUOTE") {
      required("quoteText", "quoteText is required for QUOTE blocks.");
    }
    if (block.type === "LINK") {
      required("linkLabel", "linkLabel is required for LINK blocks.");
      required("linkUrl", "linkUrl is required for LINK blocks.");
      if (block.linkUrl && !safeExternalUrl(block.linkUrl)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "linkUrl must be a valid http(s) URL.",
          path: ["linkUrl"],
        });
      }
    }
  });

export type BlockInput = z.infer<typeof blockInputSchema>;

export const sectionInputSchema = z
  .object({
    kind: z.enum(SECTION_KINDS),
    order: z.number().int().nonnegative(),
    visible: z.boolean(),
    blocks: z.array(blockInputSchema).max(50),
  })
  .superRefine((section, context) => {
    if (
      (section.kind === "HERO" ||
        section.kind === "BUILD_LOG" ||
        section.kind === "LINKS") &&
      section.blocks.length > 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${section.kind} is system content and must have no manual blocks.`,
        path: ["blocks"],
      });
    }
    if (
      section.kind === "PROJECT_GRID" &&
      section.blocks.some((block) => block.type !== "PROJECT")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PROJECT_GRID may only contain PROJECT blocks.",
        path: ["blocks"],
      });
    }
    if (
      section.kind === "ABOUT" &&
      section.blocks.some((block) => block.type === "PROJECT")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ABOUT may not contain PROJECT blocks.",
        path: ["blocks"],
      });
    }

    const blockKeys = section.blocks.map((block) => block.key);
    if (new Set(blockKeys).size !== blockKeys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Block keys must be unique within a section.",
        path: ["blocks"],
      });
    }
    const blockOrders = section.blocks.map((block) => block.order);
    if (new Set(blockOrders).size !== blockOrders.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Block order values must be unique within a section.",
        path: ["blocks"],
      });
    }
  });

export type SectionInput = z.infer<typeof sectionInputSchema>;

const safeColorSchema = z
  .string()
  .refine(isSafeCanvasColor, "Choose a valid site color.");

export const siteStyleInputSchema = z.object({
  typefacePairing: z.enum(TYPEFACE_PAIRINGS),
  colorBg: safeColorSchema,
  colorText: safeColorSchema,
  colorAccent: safeColorSchema,
  colorLine: safeColorSchema,
  cornerRadius: z
    .number()
    .int()
    .transform((value) => clampInt(value, 0, 24)),
  motionLevel: z.enum(MOTION_LEVELS),
});

export const siteSnapshotInputSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    sections: z.array(sectionInputSchema).length(5),
    style: siteStyleInputSchema,
  })
  .superRefine((snapshot, context) => {
    const sectionKinds = snapshot.sections.map((section) => section.kind);
    if (new Set(sectionKinds).size !== SECTION_KINDS.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one section of each kind is required.",
        path: ["sections"],
      });
    }

    const sectionOrders = snapshot.sections.map((section) => section.order);
    if (new Set(sectionOrders).size !== sectionOrders.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Section order values must be unique.",
        path: ["sections"],
      });
    }
  });

export type SiteSnapshotInput = z.infer<typeof siteSnapshotInputSchema>;

export type LegacyStylePreset = keyof typeof LEGACY_THEME_STYLE_PRESETS;

export class SiteDraftConflictError extends Error {
  constructor() {
    super("A newer draft is already saved. Reload before publishing.");
    this.name = "SiteDraftConflictError";
  }
}

export class SiteOwnershipError extends Error {
  constructor() {
    super("One or more site projects or resources do not belong to this user.");
    this.name = "SiteOwnershipError";
  }
}

function sanitizeSiteText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "b", "strong", "i", "em", "ul", "ol", "li", "a"],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https"],
  });
}

function jsonStyle(style: SiteStyle): Prisma.InputJsonObject {
  return { ...style };
}

// Reads a stored site-style JSON blob back into a validated SiteStyle,
// falling back to the defaults when the column is null or malformed.
export function resolveSiteStyle(value: Prisma.JsonValue | null): SiteStyle {
  const parsed = siteStyleInputSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_SITE_STYLE;
}

async function validateSnapshot(
  userId: string,
  rawSnapshot: unknown,
  database: PrismaClient,
) {
  const snapshot = siteSnapshotInputSchema.parse(rawSnapshot);
  const blocks = snapshot.sections.flatMap((section) => section.blocks);
  const projectIds = [
    ...new Set(
      blocks.flatMap((block) =>
        block.type === "PROJECT" ? [block.projectId!] : [],
      ),
    ),
  ];
  const resourceIds = [
    ...new Set(
      blocks.flatMap((block) => {
        if (block.type === "IMAGE") return [block.imageResourceId!];
        if (block.type === "GALLERY") {
          return block.galleryImages!.flatMap((image) =>
            image.resourceId ? [image.resourceId] : [],
          );
        }
        return [];
      }),
    ),
  ];

  const [ownedProjects, ownedResources] = await Promise.all([
    projectIds.length
      ? database.project.findMany({
          where: { userId, id: { in: projectIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    resourceIds.length
      ? database.imageResource.findMany({
          where: { userId, id: { in: resourceIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);
  if (
    ownedProjects.length !== projectIds.length ||
    ownedResources.length !== resourceIds.length
  ) {
    throw new SiteOwnershipError();
  }

  return {
    ...snapshot,
    sections: snapshot.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) =>
        block.type === "TEXT"
          ? { ...block, textContent: sanitizeSiteText(block.textContent!) }
          : block,
      ),
    })),
  };
}

function blockRows(
  sectionId: string,
  blocks: BlockInput[],
): Prisma.BlockCreateManyInput[] {
  return blocks.map((block) => ({
    sectionId,
    type: block.type,
    key: block.key,
    order: block.order,
    projectId: block.type === "PROJECT" ? block.projectId : null,
    textContent: block.type === "TEXT" ? block.textContent : null,
    imageUrl: block.type === "IMAGE" ? block.imageUrl : null,
    imageResourceId: block.type === "IMAGE" ? block.imageResourceId : null,
    imageCaption: block.type === "IMAGE" ? (block.imageCaption ?? null) : null,
    galleryImages:
      block.type === "GALLERY"
        ? (block.galleryImages as Prisma.InputJsonArray)
        : Prisma.DbNull,
    embedUrl: block.type === "EMBED" ? block.embedUrl : null,
    codeContent: block.type === "CODE" ? block.codeContent : null,
    codeLanguage: block.type === "CODE" ? (block.codeLanguage ?? null) : null,
    quoteText: block.type === "QUOTE" ? block.quoteText : null,
    quoteAttribution:
      block.type === "QUOTE" ? (block.quoteAttribution ?? null) : null,
    linkLabel: block.type === "LINK" ? block.linkLabel : null,
    linkUrl: block.type === "LINK" ? block.linkUrl : null,
  }));
}

async function createSectionTree(
  transaction: Prisma.TransactionClient,
  userId: string,
  state: "DRAFT" | "PUBLISHED",
  sections: SectionInput[],
) {
  for (const section of sections) {
    const created = await transaction.section.create({
      data: {
        userId,
        state,
        kind: section.kind,
        order: section.order,
        visible: section.visible,
      },
      select: { id: true },
    });
    if (section.blocks.length > 0) {
      await transaction.block.createMany({
        data: blockRows(created.id, section.blocks),
      });
    }
  }
}

export async function getSiteEditorState(
  userId: string,
  database: PrismaClient = db,
) {
  await ensureSiteContent(userId, database);

  const user = await database.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      links: true,
      siteStyleDraft: true,
      siteStylePublished: true,
      siteDraftRevision: true,
      siteDraftSavedAt: true,
      sitePublishedAt: true,
    },
  });
  const hasNewerDraft =
    user.siteDraftSavedAt !== null &&
    (user.sitePublishedAt === null ||
      user.siteDraftSavedAt > user.sitePublishedAt);
  const state = hasNewerDraft ? "DRAFT" : "PUBLISHED";

  const [sections, devlogEntries, projects, resources] = await Promise.all([
    database.section.findMany({
      where: { userId, state },
      orderBy: { order: "asc" },
      include: { blocks: { orderBy: { order: "asc" } } },
    }),
    database.devlogEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    database.project.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        hashtags: true,
        media: {
          select: { kind: true, url: true, mimeType: true },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    database.imageResource.findMany({
      where: { userId, removedAt: null },
      select: {
        id: true,
        url: true,
        mimeType: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    state,
    ownerUserId: userId,
    username: user.username,
    revision: user.siteDraftRevision,
    sections,
    style: resolveSiteStyle(
      state === "DRAFT" ? user.siteStyleDraft : user.siteStylePublished,
    ),
    profile: {
      displayName: user.displayName,
      bio: user.bio ?? "",
      avatarUrl: user.avatarUrl ?? "",
      links: Array.isArray(user.links) ? user.links : [],
    },
    devlogEntries,
    projects,
    resources,
  };
}

export async function saveSiteDraft(
  userId: string,
  rawSnapshot: unknown,
  database: PrismaClient = db,
) {
  const snapshot = await validateSnapshot(userId, rawSnapshot, database);
  const savedAt = new Date();

  await database.$transaction(async (transaction) => {
    const claimed = await transaction.user.updateMany({
      where: {
        id: userId,
        siteDraftRevision: { lt: snapshot.revision },
      },
      data: {
        siteDraftRevision: snapshot.revision,
        siteDraftSavedAt: savedAt,
        siteStyleDraft: jsonStyle(snapshot.style),
      },
    });
    if (claimed.count === 0) return;

    await transaction.section.deleteMany({
      where: { userId, state: "DRAFT" },
    });
    await createSectionTree(transaction, userId, "DRAFT", snapshot.sections);
  });

  return snapshot;
}

export async function publishSite(
  userId: string,
  rawSnapshot: unknown,
  database: PrismaClient = db,
) {
  const snapshot = await validateSnapshot(userId, rawSnapshot, database);
  const publishedAt = new Date();

  await database.$transaction(async (transaction) => {
    const claimed = await transaction.user.updateMany({
      where: {
        id: userId,
        siteDraftRevision: { lte: snapshot.revision },
      },
      data: { siteDraftRevision: snapshot.revision },
    });
    if (claimed.count === 0) throw new SiteDraftConflictError();

    await transaction.section.deleteMany({
      where: { userId, state: { in: ["DRAFT", "PUBLISHED"] } },
    });
    await createSectionTree(transaction, userId, "DRAFT", snapshot.sections);
    await createSectionTree(
      transaction,
      userId,
      "PUBLISHED",
      snapshot.sections,
    );

    await transaction.user.update({
      where: { id: userId },
      data: {
        siteDraftRevision: snapshot.revision,
        siteDraftSavedAt: publishedAt,
        sitePublishedAt: publishedAt,
        siteStyleDraft: jsonStyle(snapshot.style),
        siteStylePublished: jsonStyle(snapshot.style),
      },
    });
  });

  return snapshot;
}

export async function setResourceRemoved(
  userId: string,
  resourceId: string,
  removed: boolean,
  database: PrismaClient = db,
) {
  const result = await database.imageResource.updateMany({
    where: { id: resourceId, userId },
    data: { removedAt: removed ? new Date() : null },
  });
  if (result.count !== 1) throw new SiteOwnershipError();
  return { id: resourceId, removed };
}

export async function setStylePreset(
  userId: string,
  preset: LegacyStylePreset,
  database: PrismaClient = db,
) {
  await ensureSiteContent(userId, database);
  const user = await database.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      siteStyleDraft: true,
      siteStylePublished: true,
    },
  });
  const colors = LEGACY_THEME_STYLE_PRESETS[preset];
  const siteStyleDraft = {
    ...resolveSiteStyle(user.siteStyleDraft),
    ...colors,
  };
  const siteStylePublished = {
    ...resolveSiteStyle(user.siteStylePublished),
    ...colors,
  };

  return database.user.update({
    where: { id: userId },
    data: {
      siteStyleDraft: jsonStyle(siteStyleDraft),
      siteStylePublished: jsonStyle(siteStylePublished),
    },
    select: {
      siteStyleDraft: true,
      siteStylePublished: true,
    },
  });
}
