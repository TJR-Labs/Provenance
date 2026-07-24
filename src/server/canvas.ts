import sanitizeHtml from "sanitize-html";
import { Prisma } from "../../generated/prisma";
import type {
  CanvasElementState,
  PrismaClient,
} from "../../generated/prisma";
import { z } from "zod";

import { safeExternalUrl } from "~/app/safe-external-url";
import { PROFILE_THEMES } from "~/lib/profile-theme";
import { CARD_LAYOUTS, normalizeHashtags } from "~/lib/canvas-project-card";
import {
  CANVAS_MAX_HEIGHT,
  CANVAS_MIN_HEIGHT,
  CANVAS_MIN_WIDTH,
  CANVAS_WIDTH,
} from "~/lib/canvas-constants";
import {
  AVATAR_OFFSET_MAX,
  AVATAR_OFFSET_MIN,
  AVATAR_SHAPES,
  AVATAR_ZOOM_MAX,
  AVATAR_ZOOM_MIN,
  CANVAS_FONT_IDS,
  clampInt,
  isSafeCanvasColor,
  STYLEABLE_TYPES,
} from "~/lib/canvas-style";
import { db } from "~/server/db";
import { normalizeProjectInput, projectInputSchema } from "~/server/projects";
import { profileContentInputSchema } from "~/server/users";

const STYLEABLE_TYPE_SET = new Set<string>(STYLEABLE_TYPES);

// Allowlist for user-authored rich text (Text elements): formatting and
// links only — no scripts, iframes, images, or arbitrary attributes.
// `allowedSchemes` strips an `href` outright (keeping the link's text) when
// its scheme isn't http/https, so javascript:/data: links can't survive.
export function sanitizeCanvasText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "b",
      "strong",
      "i",
      "em",
      "ul",
      "ol",
      "li",
      "a",
    ],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https"],
  });
}

export const canvasElementInputSchema = z
  .object({
    type: z.enum([
      "ABOUT",
      "LINKS",
      "PROJECT",
      "TEXT",
      "IMAGE",
      "LINK",
      "AVATAR",
      "NAME",
      "USERNAME",
      "CATEGORIES",
    ]),
    projectId: z.string().min(1).optional(),
    textContent: z.string().min(1).optional(),
    imageUrl: z.string().min(1).optional(),
    imageCaption: z.string().optional(),
    linkLabel: z.string().min(1).optional(),
    linkUrl: z.string().min(1).optional(),
    // Per-element style (nullable columns, following textContent/imageUrl).
    textColor: z.string().optional(),
    backgroundColor: z.string().optional(),
    fontFamily: z.enum(CANVAS_FONT_IDS).optional(),
    avatarShape: z.enum(AVATAR_SHAPES).optional(),
    avatarZoom: z.number().int().optional(),
    avatarOffsetX: z.number().int().optional(),
    avatarOffsetY: z.number().int().optional(),
    // Canvas-only PROJECT card overrides (nullable columns, only valid on
    // PROJECT elements). An omitted field means "unset"; a present
    // projectHashtagsOverride — even an empty array — is an explicit override.
    projectTitleOverride: z.string().trim().max(160).optional(),
    projectDescriptionOverride: z.string().trim().max(20_000).optional(),
    projectHashtagsOverride: z
      .array(z.string().trim().max(60))
      .max(30)
      .optional(),
    cardLayout: z.enum(CARD_LAYOUTS).optional(),
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int(),
    height: z.number().int(),
    zIndex: z.number().int(),
    locked: z.boolean().optional(),
    resourceId: z.string().min(1).optional(),
  })
  .superRefine((element, context) => {
    // Style panel fields (color/background/font) are only valid on the six
    // styleable types; avatar framing/zoom fields only on AVATAR.
    const hasTextStyle =
      element.textColor !== undefined ||
      element.backgroundColor !== undefined ||
      element.fontFamily !== undefined;
    if (hasTextStyle && !STYLEABLE_TYPE_SET.has(element.type)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Style is only valid for styleable elements.",
        path: ["textColor"],
      });
    }
    if (element.textColor && !isSafeCanvasColor(element.textColor)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "textColor must be a hex color or transparent.",
        path: ["textColor"],
      });
    }
    if (
      element.backgroundColor &&
      !isSafeCanvasColor(element.backgroundColor)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "backgroundColor must be a hex color or transparent.",
        path: ["backgroundColor"],
      });
    }
    const hasAvatarStyle =
      element.avatarShape !== undefined ||
      element.avatarZoom !== undefined ||
      element.avatarOffsetX !== undefined ||
      element.avatarOffsetY !== undefined;
    if (hasAvatarStyle && element.type !== "AVATAR") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Avatar framing is only valid for avatar elements.",
        path: ["avatarShape"],
      });
    }

    if (element.type === "PROJECT" && !element.projectId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId is required for project elements.",
        path: ["projectId"],
      });
    }
    if (element.type !== "PROJECT" && element.projectId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId is only valid for project elements.",
        path: ["projectId"],
      });
    }

    const hasProjectOverride =
      element.projectTitleOverride !== undefined ||
      element.projectDescriptionOverride !== undefined ||
      element.projectHashtagsOverride !== undefined ||
      element.cardLayout !== undefined;
    if (hasProjectOverride && element.type !== "PROJECT") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Project card overrides are only valid for project elements.",
        path: ["cardLayout"],
      });
    }

    if (element.type === "TEXT" && !element.textContent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "textContent is required for text elements.",
        path: ["textContent"],
      });
    }
    if (element.type !== "TEXT" && element.textContent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "textContent is only valid for text elements.",
        path: ["textContent"],
      });
    }

    if (element.type === "IMAGE" && !element.imageUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "imageUrl is required for image elements.",
        path: ["imageUrl"],
      });
    }
    if (element.resourceId && element.type !== "IMAGE") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "resourceId is only valid for image elements.",
        path: ["resourceId"],
      });
    }
    if (element.type !== "IMAGE" && (element.imageUrl ?? element.imageCaption)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "imageUrl/imageCaption are only valid for image elements.",
        path: ["imageUrl"],
      });
    }

    if (element.type === "LINK") {
      if (!element.linkLabel) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "linkLabel is required for link elements.",
          path: ["linkLabel"],
        });
      }
      if (!element.linkUrl || !safeExternalUrl(element.linkUrl)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "linkUrl must be a valid http(s) URL.",
          path: ["linkUrl"],
        });
      }
    }
    if (element.type !== "LINK" && (element.linkLabel ?? element.linkUrl)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "linkLabel/linkUrl are only valid for link elements.",
        path: ["linkLabel"],
      });
    }
  });

export const saveCanvasElementsInputSchema = z
  .array(canvasElementInputSchema)
  .max(500);

export type CanvasElementInput = z.infer<typeof canvasElementInputSchema>;

const canvasProjectSnapshotSchema = projectInputSchema.extend({
  id: z.string().min(1),
});

const backgroundColorSchema = z
  .string()
  .refine(isSafeCanvasColor, "Choose a valid background color.")
  .nullable();

const canvasSnapshotObjectSchema = z.object({
    revision: z.number().int().nonnegative(),
    elements: saveCanvasElementsInputSchema,
    theme: z.enum(PROFILE_THEMES),
    backgroundColor: backgroundColorSchema,
    backgroundImageUrl: z.string().trim().url().max(2_000).nullable(),
    backgroundImageResourceId: z.string().min(1).nullable(),
    profile: profileContentInputSchema,
    projects: z.array(canvasProjectSnapshotSchema).max(200),
  });

export const canvasSnapshotInputSchema = canvasSnapshotObjectSchema.superRefine((snapshot, context) => {
    if (Boolean(snapshot.backgroundImageUrl) !== Boolean(snapshot.backgroundImageResourceId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A background image must reference an owned resource.",
        path: ["backgroundImageResourceId"],
      });
    }
  });

const canvasDraftMetadataSchema = canvasSnapshotObjectSchema
  .omit({ elements: true })
  .extend({ version: z.literal(1) });

export type CanvasSnapshotInput = z.infer<typeof canvasSnapshotInputSchema>;

export const canvasClipboardPayloadSchema = z.object({
  kind: z.literal("provenance.canvas.cards"),
  version: z.literal(1),
  ownerUserId: z.string().min(1),
  profileUsername: z.string().min(1),
  cards: saveCanvasElementsInputSchema.min(1),
});

export class CanvasClipboardError extends Error {
  constructor(message = "That clipboard data cannot be pasted here.") {
    super(message);
    this.name = "CanvasClipboardError";
  }
}

export class CanvasDraftConflictError extends Error {
  constructor() {
    super("A newer draft is already saved. Reload before publishing.");
    this.name = "CanvasDraftConflictError";
  }
}

const validatedCanvasElementsSchema = saveCanvasElementsInputSchema.superRefine(
  (elements, context) => {
    for (const type of [
      "ABOUT",
      "LINKS",
      "AVATAR",
      "NAME",
      "USERNAME",
      "CATEGORIES",
    ] as const) {
      if (elements.filter((element) => element.type === type).length > 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Only one ${type} element may be placed.`,
        });
      }
    }

    const projectIds = elements.flatMap((element) =>
      element.type === "PROJECT" && element.projectId
        ? [element.projectId]
        : [],
    );
    if (new Set(projectIds).size !== projectIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A project may only be placed once.",
      });
    }
  },
);

export class CanvasOwnershipError extends Error {
  constructor() {
    super("One or more canvas projects do not belong to this user.");
    this.name = "CanvasOwnershipError";
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(value, maximum));
}

function clampElements(elements: CanvasElementInput[]) {
  return elements.map((element) => {
    const width = clamp(element.width, CANVAS_MIN_WIDTH, CANVAS_WIDTH);
    const height = clamp(element.height, CANVAS_MIN_HEIGHT, CANVAS_MAX_HEIGHT);

    return {
      ...element,
      width,
      height,
      x: clamp(element.x, 0, CANVAS_WIDTH - width),
      y: clamp(element.y, 0, CANVAS_MAX_HEIGHT - height),
      ...(element.type === "TEXT" && element.textContent
        ? { textContent: sanitizeCanvasText(element.textContent) }
        : {}),
      ...(element.avatarZoom !== undefined
        ? {
            avatarZoom: clampInt(
              element.avatarZoom,
              AVATAR_ZOOM_MIN,
              AVATAR_ZOOM_MAX,
            ),
          }
        : {}),
      ...(element.avatarOffsetX !== undefined
        ? {
            avatarOffsetX: clampInt(
              element.avatarOffsetX,
              AVATAR_OFFSET_MIN,
              AVATAR_OFFSET_MAX,
            ),
          }
        : {}),
      ...(element.avatarOffsetY !== undefined
        ? {
            avatarOffsetY: clampInt(
              element.avatarOffsetY,
              AVATAR_OFFSET_MIN,
              AVATAR_OFFSET_MAX,
            ),
          }
        : {}),
      // Normalize a hashtags override the same way real project hashtags are
      // normalized. Only when explicitly present (empty array stays empty —
      // that is the "override to no hashtags" case, distinct from unset).
      ...(element.type === "PROJECT" &&
      element.projectHashtagsOverride !== undefined
        ? {
            projectHashtagsOverride: normalizeHashtags(
              element.projectHashtagsOverride,
            ),
          }
        : {}),
    };
  });
}

function createRows(
  userId: string,
  state: CanvasElementState,
  elements: CanvasElementInput[],
): Prisma.CanvasElementCreateManyInput[] {
  return elements.map((element) => ({
    userId,
    state,
    type: element.type,
    projectId: element.type === "PROJECT" ? element.projectId : null,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    zIndex: element.zIndex,
    locked: element.locked ?? false,
    resourceId: element.type === "IMAGE" ? (element.resourceId ?? null) : null,
    textContent: element.type === "TEXT" ? (element.textContent ?? null) : null,
    imageUrl: element.type === "IMAGE" ? (element.imageUrl ?? null) : null,
    imageCaption:
      element.type === "IMAGE" ? (element.imageCaption ?? null) : null,
    linkLabel: element.type === "LINK" ? (element.linkLabel ?? null) : null,
    linkUrl: element.type === "LINK" ? (element.linkUrl ?? null) : null,
    textColor: element.textColor ?? null,
    backgroundColor: element.backgroundColor ?? null,
    fontFamily: element.fontFamily ?? null,
    avatarShape: element.type === "AVATAR" ? (element.avatarShape ?? null) : null,
    avatarZoom: element.type === "AVATAR" ? (element.avatarZoom ?? null) : null,
    avatarOffsetX:
      element.type === "AVATAR" ? (element.avatarOffsetX ?? null) : null,
    avatarOffsetY:
      element.type === "AVATAR" ? (element.avatarOffsetY ?? null) : null,
    projectTitleOverride:
      element.type === "PROJECT" ? (element.projectTitleOverride ?? null) : null,
    projectDescriptionOverride:
      element.type === "PROJECT"
        ? (element.projectDescriptionOverride ?? null)
        : null,
    // Json column: SQL NULL (Prisma.DbNull) when unset; the array (possibly
    // empty) when an override is present.
    projectHashtagsOverride:
      element.type === "PROJECT" && element.projectHashtagsOverride != null
        ? element.projectHashtagsOverride
        : Prisma.DbNull,
    cardLayout: element.type === "PROJECT" ? (element.cardLayout ?? null) : null,
  }));
}

async function validateAndClampElements(
  userId: string,
  rawElements: unknown,
  database: PrismaClient,
) {
  const elements = validatedCanvasElementsSchema.parse(rawElements);
  const projectIds = elements.flatMap((element) =>
    element.type === "PROJECT" && element.projectId ? [element.projectId] : [],
  );
  const resourceIds = elements.flatMap((element) =>
    element.type === "IMAGE" && element.resourceId ? [element.resourceId] : [],
  );

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
    ownedProjects.length !== new Set(projectIds).size ||
    ownedResources.length !== new Set(resourceIds).size
  ) {
    throw new CanvasOwnershipError();
  }

  return clampElements(elements);
}

async function validateSnapshot(
  userId: string,
  rawSnapshot: unknown,
  database: PrismaClient,
) {
  const input = canvasSnapshotInputSchema.parse(rawSnapshot);
  const elements = await validateAndClampElements(
    userId,
    input.elements,
    database,
  );
  const projectIds = input.projects.map((project) => project.id);
  if (new Set(projectIds).size !== projectIds.length) {
    throw new CanvasOwnershipError();
  }
  if (projectIds.length) {
    const owned = await database.project.findMany({
      where: { userId, id: { in: projectIds } },
      select: { id: true },
    });
    if (owned.length !== projectIds.length) throw new CanvasOwnershipError();
  }
  if (input.backgroundImageResourceId && input.backgroundImageUrl) {
    const resource = await database.imageResource.findFirst({
      where: {
        id: input.backgroundImageResourceId,
        userId,
        url: input.backgroundImageUrl,
      },
      select: { id: true },
    });
    if (!resource) throw new CanvasOwnershipError();
  }
  return {
    ...input,
    elements,
    projects: input.projects.map((project) => ({
      id: project.id,
      ...normalizeProjectInput(project),
    })),
  };
}

function snapshotMetadata(snapshot: Awaited<ReturnType<typeof validateSnapshot>>) {
  return {
    version: 1,
    revision: snapshot.revision,
    theme: snapshot.theme,
    backgroundColor: snapshot.backgroundColor,
    backgroundImageUrl: snapshot.backgroundImageUrl,
    profile: snapshot.profile,
    projects: snapshot.projects,
  };
}

function startingLayout(projects: { id: string }[]): CanvasElementInput[] {
  const projectWidth = Math.floor((CANVAS_WIDTH - 24) / 2);
  // Identity header band occupies the top 160px (avatar column on the left,
  // name/username/categories stacked to its right); About/Links/Projects are
  // shifted down below it. Categories are only auto-placed when the user has
  // at least one project, since categories are derived per-project.
  const hasCategories = projects.length > 0;
  const headerOffset = 184;
  const nameX = 184;
  const nameWidth = CANVAS_WIDTH - nameX;
  const aboutY = headerOffset;
  const linksY = aboutY + 280;
  const projectStartY = linksY + 160 + 24;

  const identity: CanvasElementInput[] = [
    { type: "AVATAR", x: 0, y: 0, width: 160, height: 160, zIndex: 1 },
    { type: "NAME", x: nameX, y: 0, width: nameWidth, height: 64, zIndex: 2 },
    {
      type: "USERNAME",
      x: nameX,
      y: 72,
      width: nameWidth,
      height: 40,
      zIndex: 3,
    },
    ...(hasCategories
      ? [
          {
            type: "CATEGORIES" as const,
            x: nameX,
            y: 120,
            width: nameWidth,
            height: 40,
            zIndex: 4,
          },
        ]
      : []),
  ];

  return [
    ...identity,
    {
      type: "ABOUT",
      x: 0,
      y: aboutY,
      width: CANVAS_WIDTH,
      height: 280,
      zIndex: 5,
    },
    {
      type: "LINKS",
      x: 0,
      y: linksY,
      width: CANVAS_WIDTH,
      height: 160,
      zIndex: 6,
    },
    ...projects.map((project, index) => ({
      type: "PROJECT" as const,
      projectId: project.id,
      x: (index % 2) * (projectWidth + 24),
      y: projectStartY + Math.floor(index / 2) * (320 + 24),
      width: projectWidth,
      height: 320,
      zIndex: index + 7,
    })),
  ];
}

export async function setLayoutMode(
  userId: string,
  mode: "GRID" | "CANVAS",
  database: PrismaClient = db,
) {
  if (mode === "GRID") {
    return database.user.update({
      where: { id: userId },
      data: { layoutMode: mode },
    });
  }

  return database.$transaction(async (transaction) => {
    const elementCount = await transaction.canvasElement.count({
      where: { userId },
    });
    if (elementCount > 0) {
      return transaction.user.update({
        where: { id: userId },
        data: { layoutMode: mode },
      });
    }

    const projects = await transaction.project.findMany({
      where: { userId },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    const elements = startingLayout(projects);
    const savedAt = new Date();
    await transaction.canvasElement.createMany({
      data: createRows(userId, "DRAFT", elements),
    });
    return transaction.user.update({
      where: { id: userId },
      data: { layoutMode: mode, canvasDraftSavedAt: savedAt },
    });
  });
}

export async function getCanvasEditorState(
  userId: string,
  database: PrismaClient = db,
) {
  const user = await database.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      layoutMode: true,
      canvasDraftSavedAt: true,
      canvasPublishedAt: true,
      canvasHintDismissedAt: true,
      canvasDraftRevision: true,
      canvasDraftSnapshot: true,
      username: true,
      displayName: true,
      bio: true,
      school: true,
      avatarUrl: true,
      links: true,
      theme: true,
      canvasBackgroundColor: true,
      canvasBackgroundImageUrl: true,
      canvasBackgroundResourceId: true,
    },
  });
  const hasNewerDraft =
    user.canvasDraftSavedAt !== null &&
    (user.canvasPublishedAt === null ||
      user.canvasDraftSavedAt > user.canvasPublishedAt);
  const state = hasNewerDraft ? "DRAFT" : "PUBLISHED";

  const [elements, projects, resources] = await Promise.all([
    user.canvasDraftSavedAt === null && user.canvasPublishedAt === null
      ? Promise.resolve([])
      : database.canvasElement.findMany({
          where: { userId, state },
          orderBy: { zIndex: "asc" },
        }),
    database.project.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        hashtags: true,
        links: true,
        layout: true,
        private: true,
        excludeFromFeed: true,
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

  const storedDraft = hasNewerDraft
    ? canvasDraftMetadataSchema.safeParse(user.canvasDraftSnapshot)
    : null;
  const baselineProfile = profileContentInputSchema.parse({
    displayName: user.displayName,
    bio: user.bio ?? "",
    school: user.school ?? "",
    avatarUrl: user.avatarUrl ?? "",
    links: Array.isArray(user.links) ? user.links : [],
  });
  const snapshot = storedDraft?.success
    ? storedDraft.data
    : {
        version: 1 as const,
        revision: user.canvasDraftRevision,
        theme: PROFILE_THEMES.includes(user.theme as (typeof PROFILE_THEMES)[number])
          ? (user.theme as (typeof PROFILE_THEMES)[number])
          : "default" as const,
        backgroundColor: user.canvasBackgroundColor,
        backgroundImageUrl: user.canvasBackgroundImageUrl,
        backgroundImageResourceId: user.canvasBackgroundResourceId,
        profile: baselineProfile,
        projects: projects.map((project) => ({
          ...project,
          media: project.media.map((media) => ({
            kind: media.kind,
            url: media.url,
            mimeType: media.mimeType,
          })),
        })),
      };

  const placedTypes = new Set(elements.map((element) => element.type));
  const placedProjectIds = new Set(
    elements.flatMap((element) =>
      element.type === "PROJECT" && element.projectId
        ? [element.projectId]
        : [],
    ),
  );

  return {
    mode: user.layoutMode,
    shouldShowHint:
      user.canvasHintDismissedAt === null && elements.length === 0,
    bounds: {
      width: CANVAS_WIDTH,
      maxHeight: CANVAS_MAX_HEIGHT,
      minWidth: CANVAS_MIN_WIDTH,
      minHeight: CANVAS_MIN_HEIGHT,
    },
    elements,
    ownerUserId: userId,
    username: user.username,
    snapshot,
    resources,
    library: [
      { type: "AVATAR" as const, placed: placedTypes.has("AVATAR") },
      { type: "NAME" as const, placed: placedTypes.has("NAME") },
      { type: "USERNAME" as const, placed: placedTypes.has("USERNAME") },
      { type: "CATEGORIES" as const, placed: placedTypes.has("CATEGORIES") },
      { type: "ABOUT" as const, placed: placedTypes.has("ABOUT") },
      { type: "LINKS" as const, placed: placedTypes.has("LINKS") },
      ...projects.map((project) => ({
        type: "PROJECT" as const,
        projectId: project.id,
        title: project.title,
        thumbnailUrl: project.media[0]?.url ?? null,
        placed: placedProjectIds.has(project.id),
      })),
    ],
  };
}

export async function dismissCanvasHint(
  userId: string,
  database: PrismaClient = db,
) {
  return database.user.update({
    where: { id: userId },
    data: { canvasHintDismissedAt: new Date() },
    select: { canvasHintDismissedAt: true },
  });
}

export async function saveCanvasDraft(
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
        canvasDraftRevision: { lt: snapshot.revision },
      },
      data: {
        canvasDraftRevision: snapshot.revision,
        canvasDraftSavedAt: savedAt,
        canvasDraftSnapshot: snapshotMetadata(snapshot),
      },
    });
    // A save for the same revision has already landed, or a newer publish/save
    // won the race. In either case this stale request must not replace rows.
    if (claimed.count === 0) return;
    await transaction.canvasElement.deleteMany({
      where: { userId, state: "DRAFT" },
    });
    if (snapshot.elements.length > 0) {
      await transaction.canvasElement.createMany({
        data: createRows(userId, "DRAFT", snapshot.elements),
      });
    }
  });

  return { elements: snapshot.elements, revision: snapshot.revision };
}

export async function publishCanvasLayout(
  userId: string,
  rawSnapshot: unknown,
  database: PrismaClient = db,
) {
  const snapshot = await validateSnapshot(userId, rawSnapshot, database);
  const publishedAt = new Date();
  const nullable = (value: string | undefined) =>
    value && value.length > 0 ? value : null;

  await database.$transaction(async (transaction) => {
    const claimed = await transaction.user.updateMany({
      where: {
        id: userId,
        canvasDraftRevision: { lte: snapshot.revision },
      },
      data: { canvasDraftRevision: snapshot.revision },
    });
    if (claimed.count === 0) throw new CanvasDraftConflictError();

    await transaction.canvasElement.deleteMany({
      where: { userId, state: { in: ["DRAFT", "PUBLISHED"] } },
    });
    if (snapshot.elements.length > 0) {
      await transaction.canvasElement.createMany({
        data: createRows(userId, "DRAFT", snapshot.elements),
      });
      await transaction.canvasElement.createMany({
        data: createRows(userId, "PUBLISHED", snapshot.elements),
      });
    }

    for (const project of snapshot.projects) {
      await transaction.project.update({
        where: { id: project.id, userId },
        data: {
          title: project.title,
          description: project.description,
          category: project.category,
          hashtags: project.hashtags,
          links: project.links,
          layout: project.layout,
          private: project.private,
          excludeFromFeed: project.excludeFromFeed,
          media: { deleteMany: {}, create: project.media },
        },
      });
    }

    await transaction.user.update({
      where: { id: userId },
      data: {
        displayName: snapshot.profile.displayName,
        bio: nullable(snapshot.profile.bio),
        school: nullable(snapshot.profile.school),
        avatarUrl: nullable(snapshot.profile.avatarUrl),
        links: snapshot.profile.links,
        theme: snapshot.theme,
        canvasBackgroundColor: snapshot.backgroundColor,
        canvasBackgroundImageUrl: snapshot.backgroundImageUrl,
        canvasBackgroundResourceId: snapshot.backgroundImageResourceId,
        canvasDraftRevision: snapshot.revision,
        canvasDraftSnapshot: snapshotMetadata(snapshot),
        canvasDraftSavedAt: publishedAt,
        canvasPublishedAt: publishedAt,
      },
    });
  });

  return { elements: snapshot.elements, revision: snapshot.revision };
}

export async function validateCanvasClipboard(
  userId: string,
  username: string,
  rawPayload: unknown,
  database: PrismaClient = db,
) {
  const parsed = canvasClipboardPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) throw new CanvasClipboardError();
  if (
    parsed.data.ownerUserId !== userId ||
    parsed.data.profileUsername.toLowerCase() !== username.toLowerCase()
  ) {
    throw new CanvasClipboardError(
      "Cards copied from another profile cannot be pasted here.",
    );
  }
  try {
    return await validateAndClampElements(userId, parsed.data.cards, database);
  } catch (error) {
    if (error instanceof CanvasOwnershipError) {
      throw new CanvasClipboardError();
    }
    throw error;
  }
}

export async function setImageResourceRemoved(
  userId: string,
  resourceId: string,
  removed: boolean,
  database: PrismaClient = db,
) {
  const result = await database.imageResource.updateMany({
    where: { id: resourceId, userId },
    data: { removedAt: removed ? new Date() : null },
  });
  if (result.count !== 1) throw new CanvasOwnershipError();
  return { id: resourceId, removed };
}
