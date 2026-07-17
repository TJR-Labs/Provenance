import sanitizeHtml from "sanitize-html";
import type {
  CanvasElementState,
  Prisma,
  PrismaClient,
} from "../../generated/prisma";
import { z } from "zod";

import { safeExternalUrl } from "~/app/safe-external-url";
import {
  CANVAS_MAX_HEIGHT,
  CANVAS_MIN_HEIGHT,
  CANVAS_MIN_WIDTH,
  CANVAS_WIDTH,
} from "~/lib/canvas-constants";
import { db } from "~/server/db";

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
    type: z.enum(["ABOUT", "LINKS", "PROJECT", "TEXT", "IMAGE", "LINK"]),
    projectId: z.string().min(1).optional(),
    textContent: z.string().min(1).optional(),
    imageUrl: z.string().min(1).optional(),
    imageCaption: z.string().optional(),
    linkLabel: z.string().min(1).optional(),
    linkUrl: z.string().min(1).optional(),
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int(),
    height: z.number().int(),
    zIndex: z.number().int(),
  })
  .superRefine((element, context) => {
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

const validatedCanvasElementsSchema = saveCanvasElementsInputSchema.superRefine(
  (elements, context) => {
    for (const type of ["ABOUT", "LINKS"] as const) {
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
    textContent: element.type === "TEXT" ? (element.textContent ?? null) : null,
    imageUrl: element.type === "IMAGE" ? (element.imageUrl ?? null) : null,
    imageCaption:
      element.type === "IMAGE" ? (element.imageCaption ?? null) : null,
    linkLabel: element.type === "LINK" ? (element.linkLabel ?? null) : null,
    linkUrl: element.type === "LINK" ? (element.linkUrl ?? null) : null,
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

  if (projectIds.length > 0) {
    const ownedProjects = await database.project.findMany({
      where: { userId, id: { in: projectIds } },
      select: { id: true },
    });
    if (ownedProjects.length !== projectIds.length) {
      throw new CanvasOwnershipError();
    }
  }

  return clampElements(elements);
}

function startingLayout(projects: { id: string }[]): CanvasElementInput[] {
  const projectWidth = Math.floor((CANVAS_WIDTH - 24) / 2);
  const projectStartY = 280 + 160 + 24;

  return [
    {
      type: "ABOUT",
      x: 0,
      y: 0,
      width: CANVAS_WIDTH,
      height: 280,
      zIndex: 1,
    },
    {
      type: "LINKS",
      x: 0,
      y: 280,
      width: CANVAS_WIDTH,
      height: 160,
      zIndex: 2,
    },
    ...projects.map((project, index) => ({
      type: "PROJECT" as const,
      projectId: project.id,
      x: (index % 2) * (projectWidth + 24),
      y: projectStartY + Math.floor(index / 2) * (320 + 24),
      width: projectWidth,
      height: 320,
      zIndex: index + 3,
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
    },
  });
  const hasNewerDraft =
    user.canvasDraftSavedAt !== null &&
    (user.canvasPublishedAt === null ||
      user.canvasDraftSavedAt > user.canvasPublishedAt);
  const state = hasNewerDraft ? "DRAFT" : "PUBLISHED";

  const [elements, projects] = await Promise.all([
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
        media: {
          select: { url: true },
          orderBy: { order: "asc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

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
    library: [
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
  rawElements: unknown,
  database: PrismaClient = db,
) {
  const elements = await validateAndClampElements(
    userId,
    rawElements,
    database,
  );
  const savedAt = new Date();

  await database.$transaction(async (transaction) => {
    await transaction.canvasElement.deleteMany({
      where: { userId, state: "DRAFT" },
    });
    if (elements.length > 0) {
      await transaction.canvasElement.createMany({
        data: createRows(userId, "DRAFT", elements),
      });
    }
    await transaction.user.update({
      where: { id: userId },
      data: { canvasDraftSavedAt: savedAt },
    });
  });

  return elements;
}

export async function publishCanvasLayout(
  userId: string,
  rawElements: unknown,
  database: PrismaClient = db,
) {
  const elements = await validateAndClampElements(
    userId,
    rawElements,
    database,
  );
  const publishedAt = new Date();

  await database.$transaction(async (transaction) => {
    await transaction.canvasElement.deleteMany({
      where: { userId, state: { in: ["DRAFT", "PUBLISHED"] } },
    });
    if (elements.length > 0) {
      await transaction.canvasElement.createMany({
        data: createRows(userId, "DRAFT", elements),
      });
      await transaction.canvasElement.createMany({
        data: createRows(userId, "PUBLISHED", elements),
      });
    }
    await transaction.user.update({
      where: { id: userId },
      data: {
        canvasDraftSavedAt: publishedAt,
        canvasPublishedAt: publishedAt,
      },
    });
  });

  return elements;
}
