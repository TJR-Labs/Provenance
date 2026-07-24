import {
  Category,
  MediaKind,
  Prisma,
  type PrismaClient,
} from "../../generated/prisma";
import { z } from "zod";

import { classifyProjectMedia } from "~/lib/project-media";
import { db } from "~/server/db";
import {
  publicGridBlockSelect,
  serializePublicGridLayout,
} from "~/server/grid-layouts";
import {
  clampPageSize,
  createdAtIdCursorWhere,
  pageFromRows,
  PUBLIC_PROJECT_PAGE_SIZE,
} from "~/server/pagination";
import {
  queueStorageDeletions,
  reconcilePendingStorageDeletions,
  type StorageObjectKey,
} from "~/server/storage-deletions";

type ProjectDelegate = Pick<
  PrismaClient["project"],
  "create" | "delete" | "findFirst" | "findMany" | "findUnique" | "update"
>;
type UserReader = Pick<PrismaClient["user"], "findUniqueOrThrow">;
type CanvasElementReader = Pick<PrismaClient["canvasElement"], "findMany">;
type GridLayoutReader = Pick<PrismaClient["gridLayout"], "findFirst">;
type PopularHashtagReader = Pick<PrismaClient, "$queryRaw">;

type ProjectPagination = {
  cursor?: string;
  limit?: number;
};

export function canViewProject(
  project: { userId: string; private: boolean },
  viewerId: string | null,
): boolean;
export function canViewProject(
  project: { private: boolean },
  isOwner: boolean,
): boolean;
export function canViewProject(
  project: { userId: string; private: boolean } | { private: boolean },
  viewerId: string | null | boolean,
): boolean {
  if (typeof viewerId === "boolean") return viewerId || !project.private;
  return (
    ("userId" in project && project.userId === viewerId) || !project.private
  );
}

const projectListSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  hashtags: true,
  createdAt: true,
  media: {
    select: { url: true, mimeType: true },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    take: 1,
  },
  user: { select: { username: true, displayName: true } },
} satisfies Prisma.ProjectSelect;

type ProjectListRow = Prisma.ProjectGetPayload<{
  select: typeof projectListSelect;
}>;

function projectListPage(rows: ProjectListRow[], pageSize: number) {
  return pageFromRows(rows, pageSize, (row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    hashtags: row.hashtags,
    media: row.media,
    user: row.user,
  }));
}

export const projectLayouts = ["default", "gallery", "writeup"] as const;

export const projectMediaInputSchema = z.object({
  kind: z.nativeEnum(MediaKind),
  url: z.string().trim().min(1, "Media URL is required.").max(2000),
  mimeType: z.string().trim().max(120).optional().nullable(),
});

export const projectInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(160),
  description: z.string().trim().min(1, "Description is required.").max(20_000),
  category: z.nativeEnum(Category),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(30),
  links: z.array(z.string().trim().url()).max(20),
  layout: z.enum(projectLayouts),
  private: z.boolean().optional().default(false),
  excludeFromFeed: z.boolean().optional().default(false),
  media: z.array(projectMediaInputSchema).max(30),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

type ProjectWriter = PrismaClient | ProjectDelegate;

function isProjectDatabase(writer: ProjectWriter): writer is PrismaClient {
  return "$transaction" in writer && "project" in writer;
}

export function normalizeProjectInput(rawInput: ProjectInput) {
  const input = projectInputSchema.parse(rawInput);
  return {
    ...input,
    hashtags: [
      ...new Set(
        input.hashtags.map((tag) => tag.replace(/^#/, "").toLowerCase()),
      ),
    ],
    links: [...new Set(input.links)],
    media: input.media.map((item, order) => ({ ...item, order })),
  };
}

export async function createProject(
  userId: string,
  rawInput: ProjectInput,
  writer: ProjectWriter = db,
) {
  const input = normalizeProjectInput(rawInput);
  if (!isProjectDatabase(writer)) {
    return writer.create({
      data: {
        userId,
        title: input.title,
        description: input.description,
        category: input.category,
        hashtags: input.hashtags,
        links: input.links,
        layout: input.layout,
        private: input.private,
        excludeFromFeed: input.excludeFromFeed,
        media: { create: input.media },
      },
      include: {
        media: { orderBy: { order: "asc" } },
        user: { select: { id: true, username: true, displayName: true } },
      },
    });
  }

  return writer.$transaction(async (transaction) => {
    const media = await attachOwnedStorageMetadata(
      transaction,
      userId,
      input.media,
    );
    return transaction.project.create({
      data: {
        userId,
        title: input.title,
        description: input.description,
        category: input.category,
        hashtags: input.hashtags,
        links: input.links,
        layout: input.layout,
        private: input.private,
        excludeFromFeed: input.excludeFromFeed,
        media: { create: media },
      },
      include: {
        media: { orderBy: { order: "asc" } },
        user: { select: { id: true, username: true, displayName: true } },
      },
    });
  });
}

async function attachOwnedStorageMetadata(
  transaction: Prisma.TransactionClient,
  userId: string,
  media: ReturnType<typeof normalizeProjectInput>["media"],
) {
  const urls = media.flatMap((item) =>
    item.kind === MediaKind.UPLOAD ? [item.url] : [],
  );
  if (urls.length === 0) return media;

  const candidates = await transaction.uploadIntent.findMany({
    where: {
      userId,
      purpose: "project-media",
      status: "FINALIZED",
      resultUrl: { in: urls },
      resultStorageBucket: { not: null },
      resultStoragePath: { not: null },
      resultByteSize: { not: null },
    },
    select: { id: true },
  });
  for (const candidate of candidates) {
    // Reconciliation locks the same ledger row before deleting Storage. This
    // prevents a project from attaching an object while it is being removed.
    await transaction.$queryRaw`SELECT "id" FROM "UploadIntent" WHERE "id" = ${candidate.id} FOR UPDATE`;
  }

  const owned = await transaction.uploadIntent.findMany({
    where: {
      id: { in: candidates.map((candidate) => candidate.id) },
      storageDeletedAt: null,
    },
    select: {
      resultUrl: true,
      resultStorageBucket: true,
      resultStoragePath: true,
      resultByteSize: true,
    },
  });
  if (owned.length !== candidates.length) {
    throw new ProjectMediaUnavailableError();
  }
  const byUrl = new Map(
    owned.flatMap((intent) =>
      intent.resultUrl &&
      intent.resultStorageBucket &&
      intent.resultStoragePath &&
      intent.resultByteSize !== null
        ? [[intent.resultUrl, intent] as const]
        : [],
    ),
  );
  const objects = [...byUrl.values()].map((intent) => ({
    bucket: intent.resultStorageBucket!,
    path: intent.resultStoragePath!,
  }));
  if (objects.length > 0) {
    await transaction.pendingStorageDeletion.deleteMany({
      where: {
        OR: objects.map((object) => ({
          bucket: object.bucket,
          path: object.path,
        })),
      },
    });
  }

  return media.map((item) => {
    const intent =
      item.kind === MediaKind.UPLOAD ? byUrl.get(item.url) : undefined;
    return intent
      ? {
          ...item,
          storageBucket: intent.resultStorageBucket,
          storagePath: intent.resultStoragePath,
          storageByteSize: intent.resultByteSize,
        }
      : item;
  });
}

function ownedStorageObjects(
  media: {
    storageBucket: string | null;
    storagePath: string | null;
  }[],
) {
  return media.flatMap((item) =>
    item.storageBucket && item.storagePath
      ? [{ bucket: item.storageBucket, path: item.storagePath }]
      : [],
  );
}

async function attemptStorageDeletionBestEffort(
  database: PrismaClient,
  objects: StorageObjectKey[],
) {
  if (objects.length === 0) return;
  try {
    await reconcilePendingStorageDeletions({ prisma: database, only: objects });
  } catch (error) {
    console.error("Project Storage cleanup attempt failed", error);
  }
}

function projectWriteData(
  input: ReturnType<typeof normalizeProjectInput>,
  media: Awaited<ReturnType<typeof attachOwnedStorageMetadata>>,
) {
  return {
    data: {
      title: input.title,
      description: input.description,
      category: input.category,
      hashtags: input.hashtags,
      links: input.links,
      layout: input.layout,
      private: input.private,
      excludeFromFeed: input.excludeFromFeed,
      media: { deleteMany: {}, create: media },
    },
  };
}

export async function updateProject(
  projectId: string,
  userId: string,
  rawInput: ProjectInput,
  writer: ProjectWriter = db,
) {
  if (!isProjectDatabase(writer)) {
    const existing = await writer.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });
    if (!existing) throw new ProjectNotFoundError();
    if (existing.userId !== userId) throw new ProjectOwnershipError();
    const input = normalizeProjectInput(rawInput);
    return writer.update({
      where: { id: projectId },
      ...projectWriteData(input, input.media),
      include: {
        media: { orderBy: { order: "asc" } },
        user: { select: { id: true, username: true, displayName: true } },
      },
    });
  }

  const input = normalizeProjectInput(rawInput);
  const result = await writer.$transaction(async (transaction) => {
    const existing = await transaction.project.findUnique({
      where: { id: projectId },
      select: {
        userId: true,
        media: { select: { storageBucket: true, storagePath: true } },
      },
    });
    if (!existing) throw new ProjectNotFoundError();
    if (existing.userId !== userId) throw new ProjectOwnershipError();

    const queued = await queueStorageDeletions(
      transaction,
      ownedStorageObjects(existing.media),
      "project media replaced",
    );
    const media = await attachOwnedStorageMetadata(
      transaction,
      userId,
      input.media,
    );
    const project = await transaction.project.update({
      where: { id: projectId },
      ...projectWriteData(input, media),
      include: {
        media: { orderBy: { order: "asc" } },
        user: { select: { id: true, username: true, displayName: true } },
      },
    });
    return { project, queued };
  });

  await attemptStorageDeletionBestEffort(writer, result.queued);
  return result.project;
}

export async function deleteProject(
  projectId: string,
  userId: string,
  writer: ProjectWriter = db,
) {
  if (!isProjectDatabase(writer)) {
    const existing = await writer.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });
    if (!existing) throw new ProjectNotFoundError();
    if (existing.userId !== userId) throw new ProjectOwnershipError();
    return writer.delete({ where: { id: projectId } });
  }

  const result = await writer.$transaction(async (transaction) => {
    const existing = await transaction.project.findUnique({
      where: { id: projectId },
      select: {
        userId: true,
        media: { select: { storageBucket: true, storagePath: true } },
      },
    });
    if (!existing) throw new ProjectNotFoundError();
    if (existing.userId !== userId) throw new ProjectOwnershipError();

    const queued = await queueStorageDeletions(
      transaction,
      ownedStorageObjects(existing.media),
      "project deleted",
    );
    const project = await transaction.project.delete({
      where: { id: projectId },
    });
    return { project, queued };
  });

  await attemptStorageDeletionBestEffort(writer, result.queued);
  return result.project;
}

export async function getPublicProject(
  projectId: string,
  viewerId: string | null,
  projects: ProjectDelegate = db.project,
  gridLayouts: GridLayoutReader | undefined = db.gridLayout,
) {
  const project = await projects.findFirst({
    where: { id: projectId, user: { banned: false } },
    include: {
      media: { orderBy: { order: "asc" } },
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          private: true,
        },
      },
    },
  });
  if (!project) return null;
  if (
    !canViewProject(project, viewerId) ||
    !canViewProject(
      { userId: project.userId, private: project.user.private },
      viewerId,
    )
  ) {
    return null;
  }
  if (
    !gridLayouts ||
    project.media.some((media) => classifyProjectMedia(media) === "video")
  ) {
    return project;
  }

  const publishedGridLayout = await gridLayouts.findFirst({
    where: {
      ownerId: project.userId,
      projectId: project.id,
      scope: "PROJECT",
      state: "PUBLISHED",
    },
    select: {
      blocks: {
        orderBy: [{ order: "asc" }, { key: "asc" }],
        select: publicGridBlockSelect,
      },
    },
  });

  return publishedGridLayout
    ? {
        ...project,
        gridLayout: serializePublicGridLayout(
          publishedGridLayout,
          project.userId === viewerId,
        ),
      }
    : project;
}

export async function listProjectsByUsername(
  username: string,
  viewerId: string | null,
  projects: ProjectDelegate = db.project,
  pagination: ProjectPagination = {},
) {
  const pageSize = clampPageSize(pagination.limit, PUBLIC_PROJECT_PAGE_SIZE);
  const visibilityWhere: Prisma.ProjectWhereInput = viewerId
    ? {
        user: { username: username.toLowerCase(), banned: false },
        OR: [
          { userId: viewerId },
          { private: false, user: { private: false } },
        ],
      }
    : {
        private: false,
        user: {
          username: username.toLowerCase(),
          banned: false,
          private: false,
        },
      };
  const cursorWhere = createdAtIdCursorWhere(pagination.cursor);
  const rows = await projects.findMany({
    where: cursorWhere
      ? { AND: [visibilityWhere, cursorWhere] }
      : visibilityWhere,
    select: projectListSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  return projectListPage(rows, pageSize);
}

export async function discoverProjects(
  filters: {
    category?: Category;
    hashtag?: string;
    cursor?: string;
    limit?: number;
  },
  viewerId: string | null,
  projects: ProjectDelegate = db.project,
) {
  void viewerId;
  const pageSize = clampPageSize(filters.limit, PUBLIC_PROJECT_PAGE_SIZE);
  const unfiltered = !filters.category && !filters.hashtag;
  const visibilityWhere: Prisma.ProjectWhereInput = {
    user: { banned: false, private: false },
    private: false,
    ...(unfiltered && { excludeFromFeed: false }),
    ...(filters.category && { category: filters.category }),
    ...(filters.hashtag && {
      hashtags: {
        has: filters.hashtag.replace(/^#/, "").trim().toLowerCase(),
      },
    }),
  };
  const cursorWhere = createdAtIdCursorWhere(filters.cursor);
  const rows = await projects.findMany({
    where: cursorWhere
      ? { AND: [visibilityWhere, cursorWhere] }
      : visibilityWhere,
    select: projectListSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  return projectListPage(rows, pageSize);
}

// Surfaces the hashtags actually in use across public (non-banned) profiles,
// ordered by usage frequency (most-used first) so the Discover page can offer
// them as filter chips. Reuses Project.hashtags as-is — no separate tag table.
// PostgreSQL unnests and aggregates the native array, so application memory is
// bounded by the requested result limit; ties fall back to alphabetical.
export async function listPopularHashtags(
  limit = 20,
  database: PopularHashtagReader = db,
) {
  const boundedLimit = clampPageSize(limit, 20);
  const rows = await database.$queryRaw<{ tag: string }[]>(Prisma.sql`
    SELECT hashtag."tag"
    FROM "Project" AS project
    INNER JOIN "User" AS owner ON owner."id" = project."userId"
    CROSS JOIN LATERAL UNNEST(project."hashtags") AS hashtag("tag")
    WHERE project."private" = false
      AND owner."private" = false
      AND owner."banned" = false
    GROUP BY hashtag."tag"
    ORDER BY COUNT(*) DESC, hashtag."tag" ASC
    LIMIT ${boundedLimit}
  `);
  return rows.map((row) => row.tag);
}

// Lists the signed-in user's own projects for the "My Work" hub, with
// placed/unplaced-on-canvas status mirroring the canvas editor's Library
// sidebar (src/server/canvas.ts's getCanvasEditorState resolves the same
// draft-vs-published state before checking PROJECT placements).
export async function listMyProjects(
  userId: string,
  projects: ProjectDelegate = db.project,
  users: UserReader = db.user,
  canvasElements: CanvasElementReader = db.canvasElement,
  pagination: ProjectPagination = {},
) {
  const pageSize = clampPageSize(pagination.limit, PUBLIC_PROJECT_PAGE_SIZE);
  const cursorWhere = createdAtIdCursorWhere(pagination.cursor);
  const [myProjects, user] = await Promise.all([
    projects.findMany({
      where: cursorWhere ? { AND: [{ userId }, cursorWhere] } : { userId },
      select: {
        id: true,
        title: true,
        createdAt: true,
        media: {
          select: { url: true },
          orderBy: [{ order: "asc" }, { id: "asc" }],
          take: 1,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
    }),
    users.findUniqueOrThrow({
      where: { id: userId },
      select: { canvasDraftSavedAt: true, canvasPublishedAt: true },
    }),
  ]);

  const hasNewerDraft =
    user.canvasDraftSavedAt !== null &&
    (user.canvasPublishedAt === null ||
      user.canvasDraftSavedAt > user.canvasPublishedAt);
  const state = hasNewerDraft ? "DRAFT" : "PUBLISHED";
  const page = pageFromRows(myProjects, pageSize, (project) => ({
    id: project.id,
    title: project.title,
    thumbnailUrl: project.media[0]?.url ?? null,
  }));
  const projectIds = page.items.map((project) => project.id);

  const placedElements =
    projectIds.length === 0 ||
    (user.canvasDraftSavedAt === null && user.canvasPublishedAt === null)
      ? []
      : await canvasElements.findMany({
          where: {
            userId,
            state,
            type: "PROJECT",
            projectId: { in: projectIds },
          },
          select: { projectId: true },
        });
  const placedProjectIds = new Set(
    placedElements.flatMap((element) =>
      element.projectId ? [element.projectId] : [],
    ),
  );

  return {
    items: page.items.map((project) => ({
      ...project,
      placed: placedProjectIds.has(project.id),
    })),
    nextCursor: page.nextCursor,
  };
}

export class ProjectNotFoundError extends Error {}
export class ProjectOwnershipError extends Error {}
export class ProjectMediaUnavailableError extends Error {
  constructor() {
    super("One or more uploaded media items are no longer available.");
    this.name = "ProjectMediaUnavailableError";
  }
}
