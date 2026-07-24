import { z } from "zod";

import type {
  GridBlock as PrismaGridBlock,
  PrismaClient,
} from "../../generated/prisma";
import {
  isEmptyGridBlock,
  type GridBlock,
  validateGridBlocks,
} from "~/lib/grid-layout";
import { db } from "~/server/db";
import {
  ensureProfileGridLayouts,
  ensureProjectGridLayout,
} from "~/server/grid-layout-migration";
import { canViewProject } from "~/server/projects";

export type GridProjectOption = {
  id: string;
  title: string;
  description: string;
  private: boolean;
  media: { url: string; mimeType: string | null }[];
};

export type GridSaveInput = { expectedRevision: number; blocks: GridBlock[] };

export type GridEditorPayload = {
  scope: "profile" | "project";
  revision: number;
  blocks: GridBlock[];
  projects: GridProjectOption[];
};

export type GridSaveResult = { revision: number; blocks: GridBlock[] };

type PublicGridProject = {
  id: string;
  title: string;
  description: string;
  private: boolean;
  media: { url: string; mimeType: string | null }[];
};

type PublicGridBlockRow = GridBlock & {
  project: PublicGridProject | null;
};

export const publicGridBlockSelect = {
  key: true,
  order: true,
  type: true,
  x: true,
  y: true,
  width: true,
  height: true,
  projectId: true,
  textContent: true,
  imageUrl: true,
  imageMimeType: true,
  imageAlt: true,
  linkLabel: true,
  linkUrl: true,
  project: {
    select: {
      id: true,
      title: true,
      description: true,
      private: true,
      media: {
        orderBy: { order: "asc" },
        select: { url: true, mimeType: true },
      },
    },
  },
} as const;

export function serializePublicGridLayout(
  layout: { blocks: PublicGridBlockRow[] },
  isOwner: boolean,
) {
  const visibleRows = layout.blocks.filter(
    (block) =>
      block.type !== "PROJECT" ||
      (block.project === null
        ? isOwner
        : canViewProject(block.project, isOwner)),
  );
  const referencedProjectIds = new Set(
    visibleRows.flatMap((block) =>
      block.type === "PROJECT" && block.projectId ? [block.projectId] : [],
    ),
  );
  const seenProjectIds = new Set<string>();
  const publicProjects: PublicGridProject[] = [];

  for (const block of visibleRows) {
    if (block.type !== "PROJECT") continue;
    const project = block.project;
    if (
      !project ||
      !referencedProjectIds.has(project.id) ||
      seenProjectIds.has(project.id)
    ) {
      continue;
    }
    if (!canViewProject(project, isOwner)) continue;
    seenProjectIds.add(project.id);
    publicProjects.push({
      id: project.id,
      title: project.title,
      description: project.description,
      private: project.private,
      media: project.media.map(({ url, mimeType }) => ({ url, mimeType })),
    });
  }

  return {
    blocks: visibleRows.map(
      ({ project: _project, ...block }): GridBlock => block,
    ),
    projects: publicProjects,
  };
}

export class GridLayoutOwnershipError extends Error {
  constructor(message = "You do not own this Grid layout.") {
    super(message);
    this.name = "GridLayoutOwnershipError";
  }
}

export class GridLayoutConflictError extends Error {
  constructor() {
    super(
      "This Grid layout changed in another tab. Reload before saving again.",
    );
    this.name = "GridLayoutConflictError";
  }
}

export class GridLayoutUnavailableError extends Error {
  constructor() {
    super("This Grid layout is not available.");
    this.name = "GridLayoutUnavailableError";
  }
}

export class GridLayoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GridLayoutValidationError";
  }
}

const gridBlockSchema: z.ZodType<GridBlock> = z
  .object({
    key: z.string().trim().min(1),
    order: z.number().int().nonnegative(),
    type: z.enum(["PROJECT", "IMAGE", "TEXT", "LINK"]),
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int(),
    height: z.number().int(),
    projectId: z.string().min(1).nullable(),
    textContent: z.string().nullable(),
    imageUrl: z.string().nullable(),
    imageMimeType: z.string().nullable(),
    imageAlt: z.string().nullable(),
    linkLabel: z.string().nullable(),
    linkUrl: z.string().nullable(),
  })
  .strict()
  .superRefine((block, context) => {
    if (block.type !== "PROJECT" && block.projectId !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId is only valid for PROJECT blocks.",
        path: ["projectId"],
      });
    }
  });

const gridSaveInputShape = {
  expectedRevision: z.number().int().nonnegative(),
  blocks: z.array(gridBlockSchema),
};

function refineGridSaveInput(
  { blocks }: GridSaveInput,
  context: z.RefinementCtx,
) {
  for (const message of validateGridBlocks(blocks)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message,
      path: ["blocks"],
    });
  }

  const keys = new Set<string>();
  const orders = new Set<number>();
  for (const [index, block] of blocks.entries()) {
    if (keys.has(block.key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Block key ${block.key} must be unique.`,
        path: ["blocks", index, "key"],
      });
    }
    if (orders.has(block.order)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Block order ${block.order} must be unique.`,
        path: ["blocks", index, "order"],
      });
    }
    keys.add(block.key);
    orders.add(block.order);
  }
}

export const gridSaveInputSchema: z.ZodType<GridSaveInput> = z
  .object(gridSaveInputShape)
  .strict()
  .superRefine(refineGridSaveInput);

export const gridProjectSaveInputSchema = z
  .object({
    projectId: z.string().min(1),
    ...gridSaveInputShape,
  })
  .strict()
  .superRefine(refineGridSaveInput);

function serializeBlock(block: PrismaGridBlock): GridBlock {
  return {
    key: block.key,
    order: block.order,
    type: block.type,
    x: block.x,
    y: block.y,
    width: block.width,
    height: block.height,
    projectId: block.projectId,
    textContent: block.textContent,
    imageUrl: block.imageUrl,
    imageMimeType: block.imageMimeType,
    imageAlt: block.imageAlt,
    linkLabel: block.linkLabel,
    linkUrl: block.linkUrl,
  };
}

function createBlockRows(layoutId: string, blocks: GridBlock[]) {
  return blocks.map((block) => ({ layoutId, ...block }));
}

async function loadOwnedProjects(
  userId: string,
  database: PrismaClient,
): Promise<GridProjectOption[]> {
  return database.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      private: true,
      media: {
        orderBy: { order: "asc" },
        select: { url: true, mimeType: true },
      },
    },
  });
}

async function findProfileLayout(
  userId: string,
  state: "DRAFT" | "PUBLISHED",
  database: PrismaClient,
) {
  return database.gridLayout.findFirst({
    where: { ownerId: userId, scope: "PROFILE", state },
    include: { blocks: { orderBy: [{ order: "asc" }, { key: "asc" }] } },
  });
}

async function assertProjectOwner(
  projectId: string,
  userId: string,
  database: PrismaClient,
) {
  const project = await database.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!project) throw new GridLayoutUnavailableError();
  if (project.userId !== userId) throw new GridLayoutOwnershipError();
}

async function findProjectLayout(
  projectId: string,
  userId: string,
  database: PrismaClient,
) {
  await assertProjectOwner(projectId, userId, database);
  return database.gridLayout.findFirst({
    where: {
      ownerId: userId,
      projectId,
      scope: "PROJECT",
      state: "PUBLISHED",
    },
    include: { blocks: { orderBy: [{ order: "asc" }, { key: "asc" }] } },
  });
}

async function assertOwnedProjectReferences(
  ownerId: string,
  blocks: GridBlock[],
  database: PrismaClient,
) {
  const ids = [
    ...new Set(
      blocks.flatMap((block) => (block.projectId ? [block.projectId] : [])),
    ),
  ];
  if (ids.length === 0) return;

  const owned = await database.project.findMany({
    where: { id: { in: ids }, userId: ownerId },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    throw new GridLayoutOwnershipError(
      "Grid layouts can reference only projects you own.",
    );
  }
}

function assertNullFields(block: GridBlock, fields: Array<keyof GridBlock>) {
  if (fields.some((field) => block[field] !== null)) {
    throw new GridLayoutValidationError(
      `New ${block.type} block content is read-only in this release.`,
    );
  }
}

function assertEqualFields(
  previous: GridBlock,
  next: GridBlock,
  fields: Array<keyof GridBlock>,
) {
  if (fields.some((field) => previous[field] !== next[field])) {
    throw new GridLayoutValidationError(
      `${previous.type} block content is read-only in this release.`,
    );
  }
}

function assertReadOnlyContent(previous: GridBlock[], next: GridBlock[]) {
  const previousByKey = new Map(previous.map((block) => [block.key, block]));
  const nextByKey = new Map(next.map((block) => [block.key, block]));
  const imageFields: Array<keyof GridBlock> = [
    "imageUrl",
    "imageMimeType",
    "imageAlt",
  ];
  const linkFields: Array<keyof GridBlock> = ["linkLabel", "linkUrl"];

  for (const oldBlock of previous) {
    if (oldBlock.type !== "IMAGE" && oldBlock.type !== "LINK") continue;
    const nextBlock = nextByKey.get(oldBlock.key);
    if (!nextBlock) continue;
    if (nextBlock.type !== oldBlock.type) {
      throw new GridLayoutValidationError(
        `${oldBlock.type} block content is read-only in this release.`,
      );
    }
    assertEqualFields(
      oldBlock,
      nextBlock,
      oldBlock.type === "IMAGE" ? imageFields : linkFields,
    );
  }

  for (const nextBlock of next) {
    if (nextBlock.type !== "IMAGE" && nextBlock.type !== "LINK") continue;
    const oldBlock = previousByKey.get(nextBlock.key);
    if (oldBlock?.type === nextBlock.type) continue;
    assertNullFields(
      nextBlock,
      nextBlock.type === "IMAGE" ? imageFields : linkFields,
    );
  }
}

async function validateSave(
  ownerId: string,
  input: GridSaveInput,
  previous: GridBlock[],
  database: PrismaClient,
) {
  const parsed = gridSaveInputSchema.parse(input);
  await assertOwnedProjectReferences(ownerId, parsed.blocks, database);
  assertReadOnlyContent(previous, parsed.blocks);
  return parsed;
}

async function replaceBlocks(
  transaction: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  layoutId: string,
  blocks: GridBlock[],
) {
  await transaction.gridBlock.deleteMany({ where: { layoutId } });
  if (blocks.length > 0) {
    await transaction.gridBlock.createMany({
      data: createBlockRows(layoutId, blocks),
    });
  }
}

async function claimRevision(
  transaction: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  layoutId: string,
  expectedRevision: number,
) {
  const claimed = await transaction.gridLayout.updateMany({
    where: { id: layoutId, revision: expectedRevision },
    data: { revision: { increment: 1 } },
  });
  if (claimed.count !== 1) throw new GridLayoutConflictError();
}

export async function getProfileGridEditorState(
  userId: string,
  database: PrismaClient = db,
): Promise<GridEditorPayload> {
  let layout =
    (await findProfileLayout(userId, "DRAFT", database)) ??
    (await findProfileLayout(userId, "PUBLISHED", database));
  if (!layout) {
    const status = await ensureProfileGridLayouts(userId, database);
    if (status === "oversized") throw new GridLayoutUnavailableError();
    layout =
      (await findProfileLayout(userId, "DRAFT", database)) ??
      (await findProfileLayout(userId, "PUBLISHED", database));
  }
  if (!layout) throw new GridLayoutUnavailableError();

  return {
    scope: "profile",
    revision: layout.revision,
    blocks: layout.blocks.map(serializeBlock),
    projects: await loadOwnedProjects(userId, database),
  };
}

export async function getProjectGridEditorState(
  projectId: string,
  userId: string,
  database: PrismaClient = db,
): Promise<GridEditorPayload> {
  let layout = await findProjectLayout(projectId, userId, database);
  if (!layout) {
    const status = await ensureProjectGridLayout(projectId, database);
    if (status !== "ready") throw new GridLayoutUnavailableError();
    layout = await findProjectLayout(projectId, userId, database);
  }
  if (!layout) throw new GridLayoutUnavailableError();

  return {
    scope: "project",
    revision: layout.revision,
    blocks: layout.blocks.map(serializeBlock),
    projects: await loadOwnedProjects(userId, database),
  };
}

export async function saveProfileGridDraft(
  userId: string,
  input: GridSaveInput,
  database: PrismaClient = db,
): Promise<GridSaveResult> {
  const layout = await findProfileLayout(userId, "DRAFT", database);
  if (!layout) throw new GridLayoutUnavailableError();
  const parsed = await validateSave(
    userId,
    input,
    layout.blocks.map(serializeBlock),
    database,
  );

  await database.$transaction(async (transaction) => {
    await claimRevision(transaction, layout.id, parsed.expectedRevision);
    await replaceBlocks(transaction, layout.id, parsed.blocks);
  });

  return { revision: parsed.expectedRevision + 1, blocks: parsed.blocks };
}

export async function publishProfileGrid(
  userId: string,
  input: GridSaveInput,
  database: PrismaClient = db,
): Promise<GridSaveResult> {
  const draft = await findProfileLayout(userId, "DRAFT", database);
  const published = await findProfileLayout(userId, "PUBLISHED", database);
  if (!draft || !published) throw new GridLayoutUnavailableError();
  const parsed = await validateSave(
    userId,
    input,
    draft.blocks.map(serializeBlock),
    database,
  );
  const revision = parsed.expectedRevision + 1;
  const publicBlocks = parsed.blocks.filter(
    (block) => !isEmptyGridBlock(block),
  );

  await database.$transaction(async (transaction) => {
    await claimRevision(transaction, draft.id, parsed.expectedRevision);
    await replaceBlocks(transaction, draft.id, parsed.blocks);
    await transaction.gridLayout.update({
      where: { id: published.id },
      data: { revision },
    });
    await replaceBlocks(transaction, published.id, publicBlocks);
  });

  return { revision, blocks: parsed.blocks };
}

export async function publishProjectGrid(
  projectId: string,
  userId: string,
  input: GridSaveInput,
  database: PrismaClient = db,
): Promise<GridSaveResult> {
  const layout = await findProjectLayout(projectId, userId, database);
  if (!layout) throw new GridLayoutUnavailableError();
  const parsed = await validateSave(
    userId,
    input,
    layout.blocks.map(serializeBlock),
    database,
  );
  const publicBlocks = parsed.blocks.filter(
    (block) => !isEmptyGridBlock(block),
  );

  await database.$transaction(async (transaction) => {
    await claimRevision(transaction, layout.id, parsed.expectedRevision);
    await replaceBlocks(transaction, layout.id, publicBlocks);
  });

  return { revision: parsed.expectedRevision + 1, blocks: parsed.blocks };
}
