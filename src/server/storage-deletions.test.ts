import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/storage", () => ({ createStorageClient: vi.fn() }));

import { reconcilePendingStorageDeletions } from "~/server/storage-deletions";

function fixture(
  options: {
    projectReferences?: number;
    imageReferences?: number;
    userReferences?: number;
    removeError?: unknown;
  } = {},
) {
  let pending: {
    bucket: string;
    path: string;
    reason: string;
    attempts: number;
    lastError: string | null;
  } | null = {
    bucket: "media",
    path: "user-1/object.png",
    reason: "test",
    attempts: 0,
    lastError: null,
  };
  const pendingStorageDeletion = {
    findMany: vi.fn(async () =>
      pending ? [{ bucket: pending.bucket, path: pending.path }] : [],
    ),
    findUnique: vi.fn(async () => pending),
    delete: vi.fn(async () => {
      pending = null;
      return {};
    }),
    updateMany: vi.fn(async ({ data }: { data: { lastError: string } }) => {
      if (!pending) return { count: 0 };
      pending = {
        ...pending,
        attempts: pending.attempts + 1,
        lastError: data.lastError,
      };
      return { count: 1 };
    }),
  };
  const transaction = {
    pendingStorageDeletion,
    uploadIntent: {
      findFirst: vi.fn(async () => ({
        id: "intent-1",
        resultUrl: "https://cdn.example.test/object.png",
        storageDeletedAt: null,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    projectMedia: {
      count: vi.fn(async () => options.projectReferences ?? 0),
    },
    imageResource: {
      count: vi.fn(async () => options.imageReferences ?? 0),
    },
    user: { count: vi.fn(async () => options.userReferences ?? 0) },
    $queryRaw: vi.fn(async () => []),
  };
  const prisma = {
    ...transaction,
    $transaction: vi.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };
  const remove = vi.fn(async () => ({
    data: {},
    error: options.removeError ?? null,
  }));
  const getStorageClient = () =>
    ({ storage: { from: () => ({ remove }) } }) as never;

  return {
    prisma: prisma as never,
    getStorageClient,
    remove,
    get pending() {
      return pending;
    },
  };
}

describe("reconcilePendingStorageDeletions", () => {
  it("cancels a deletion without touching Storage when a live row references it", async () => {
    const state = fixture({ imageReferences: 1 });

    await expect(
      reconcilePendingStorageDeletions(state),
    ).resolves.toMatchObject({ referenced: 1, deleted: 0, failed: 0 });
    expect(state.remove).not.toHaveBeenCalled();
    expect(state.pending).toBeNull();
  });

  it("retains the outbox row and records a retry after a transient failure", async () => {
    const state = fixture({ removeError: { message: "Storage unavailable" } });

    await expect(
      reconcilePendingStorageDeletions(state),
    ).resolves.toMatchObject({ failed: 1, deleted: 0 });
    expect(state.pending).toMatchObject({ attempts: 1 });
  });

  it("treats an already-absent object as an idempotent success", async () => {
    const state = fixture({
      removeError: { statusCode: 404, message: "Object not found" },
    });

    await expect(
      reconcilePendingStorageDeletions(state),
    ).resolves.toMatchObject({ deleted: 1, failed: 0 });
    expect(state.pending).toBeNull();
  });
});
