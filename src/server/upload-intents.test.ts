import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({
  env: {
    SUPABASE_URL: "https://example.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    SUPABASE_STORAGE_BUCKET: "public-media",
    SUPABASE_STORAGE_STAGING_BUCKET: "upload-staging",
    NODE_ENV: "test",
  },
}));

import {
  createUploadIntent,
  finalizeUploadIntent,
  MAX_FINALIZED_OWNED_MEDIA_BYTES,
  MAX_UPLOAD_INTENTS_PER_USER_PER_HOUR,
} from "~/server/upload-intents";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  UploadValidationError,
} from "~/server/upload-validation";

const NOW = new Date("2026-07-22T12:00:00.000Z");
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

type IntentStatus = "PENDING" | "FINALIZED" | "FAILED" | "EXPIRED";

function intent(overrides: Record<string, unknown> = {}) {
  return {
    id: "intent-1",
    userId: "user-1",
    purpose: "canvas-resource",
    declaredMimeType: "image/png",
    declaredByteSize: PNG_BYTES.byteLength,
    stagingBucket: "upload-staging",
    stagingPath: "user-1/staging-id",
    status: "PENDING" as IntentStatus,
    expiresAt: new Date(NOW.getTime() + 60_000),
    resultUrl: null as string | null,
    resultMimeType: null as string | null,
    resultResourceId: null as string | null,
    resultStorageBucket: null as string | null,
    resultStoragePath: null as string | null,
    resultByteSize: null as number | null,
    storageDeletedAt: null as Date | null,
    stagingDeletedAt: null as Date | null,
    createdAt: NOW,
    finalizedAt: null as Date | null,
    ...overrides,
  };
}

function fakePrisma(initial = intent(), ownedBytes = 0) {
  let row = initial;
  let pendingDeletion: { bucket: string; path: string; reason: string } | null =
    null;
  const imageResourceCreate = vi.fn(
    async (_args: { data: Record<string, unknown> }) => ({
      id: "resource-1",
      url: "https://cdn.example.test/user-1/public-id.png",
      mimeType: "image/png",
      createdAt: NOW,
    }),
  );
  const uploadIntent = {
    findUnique: vi.fn(async () => row),
    updateMany: vi.fn(async ({ data }: { data: Partial<typeof row> }) => {
      row = { ...row, ...data };
      return { count: 1 };
    }),
    update: vi.fn(async ({ data }: { data: Partial<typeof row> }) => {
      row = { ...row, ...data };
      return row;
    }),
    count: vi.fn(async () => 0),
    aggregate: vi.fn(async () => ({
      _sum: { resultByteSize: ownedBytes },
    })),
    findFirst: vi.fn(async () => null),
  };
  const pendingStorageDeletion = {
    upsert: vi.fn(async ({ create }: { create: typeof pendingDeletion }) => {
      pendingDeletion = create;
      return create;
    }),
    findMany: vi.fn(async () =>
      pendingDeletion
        ? [{ bucket: pendingDeletion.bucket, path: pendingDeletion.path }]
        : [],
    ),
    findUnique: vi.fn(async () => pendingDeletion),
    delete: vi.fn(async () => {
      pendingDeletion = null;
      return {};
    }),
    updateMany: vi.fn(async () => ({ count: pendingDeletion ? 1 : 0 })),
  };
  const transaction = {
    $queryRaw: vi.fn(async () => [{ id: row.id }]),
    uploadIntent,
    imageResource: {
      create: imageResourceCreate,
      count: vi.fn(async () => 0),
    },
    projectMedia: { count: vi.fn(async () => 0) },
    user: { count: vi.fn(async () => 0) },
    pendingStorageDeletion,
  };
  const prisma = {
    uploadIntent,
    imageResource: { create: imageResourceCreate },
    pendingStorageDeletion,
    $transaction: vi.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };

  return {
    prisma,
    get row() {
      return row;
    },
    imageResourceCreate,
  };
}

function fakeStorage(blob = new Blob([PNG_BYTES], { type: "image/png" })) {
  const download = vi.fn(async () => ({ data: blob, error: null }));
  const upload = vi.fn(async () => ({ data: {}, error: null }));
  const remove = vi.fn(async () => ({ data: {}, error: null }));
  const from = vi.fn((bucket: string) => ({
    createSignedUploadUrl: vi.fn(async (path: string) => ({
      data: {
        signedUrl: `https://storage.example.test/${bucket}/${path}?token=signed`,
        token: "signed",
        path,
      },
      error: null,
    })),
    download,
    upload,
    remove,
    getPublicUrl: (path: string) => ({
      data: { publicUrl: `https://cdn.example.test/${path}` },
    }),
  }));
  const client = { storage: { from } };

  return {
    getStorageClient: () => client as never,
    download,
    upload,
    remove,
    from,
  };
}

describe("createUploadIntent declared metadata validation", () => {
  const prisma = { uploadIntent: { create: vi.fn() } };
  const dependencies = { prisma: prisma as never };

  beforeEach(() => {
    prisma.uploadIntent.create.mockReset();
  });

  it("rejects an unsupported MIME type before creating an intent", async () => {
    await expect(
      createUploadIntent(
        {
          userId: "user-1",
          purpose: "project-media",
          mimeType: "text/html",
          byteSize: 100,
        },
        dependencies,
      ),
    ).rejects.toMatchObject({ status: 415 });
    expect(prisma.uploadIntent.create).not.toHaveBeenCalled();
  });

  it.each([
    ["image/png", MAX_IMAGE_BYTES + 1],
    ["video/mp4", MAX_VIDEO_BYTES + 1],
  ])("rejects oversized declared %s bytes", async (mimeType, byteSize) => {
    await expect(
      createUploadIntent(
        {
          userId: "user-1",
          purpose: "project-media",
          mimeType,
          byteSize,
        },
        dependencies,
      ),
    ).rejects.toMatchObject({ status: 413 });
    expect(prisma.uploadIntent.create).not.toHaveBeenCalled();
  });

  it.each([
    ["image/png", MAX_IMAGE_BYTES],
    ["video/mp4", MAX_VIDEO_BYTES],
  ])("accepts the supported %s size boundary", async (mimeType, byteSize) => {
    const create = vi.fn(
      async (_args: {
        data: {
          stagingBucket: string;
          stagingPath: string;
          status: IntentStatus;
          expiresAt: Date;
        };
        select: { id: boolean };
      }) => ({ id: "intent-boundary" }),
    );
    const updateMany = vi.fn();
    const createSignedUploadUrl = vi.fn(async (path: string) => ({
      data: {
        signedUrl: `https://storage.example.test/${path}?token=signed`,
        token: "signed",
        path,
      },
      error: null,
    }));
    const getStorageClient = () =>
      ({
        storage: {
          from: () => ({ createSignedUploadUrl }),
        },
      }) as never;
    const transaction = {
      $queryRaw: vi.fn(async () => [{ id: "user-1" }]),
      uploadIntent: { count: vi.fn(async () => 0), create },
    };

    await expect(
      createUploadIntent(
        {
          userId: "user-1",
          purpose: "project-media",
          mimeType,
          byteSize,
        },
        {
          prisma: {
            uploadIntent: { create, updateMany },
            $transaction: vi.fn(
              async (
                operation: (client: typeof transaction) => Promise<unknown>,
              ) => operation(transaction),
            ),
          } as never,
          getStorageClient,
          now: () => NOW,
          uuid: () => "staging-id",
        },
      ),
    ).resolves.toEqual({
      intentId: "intent-boundary",
      uploadUrl: "https://storage.example.test/user-1/staging-id?token=signed",
      purpose: "project-media",
    });
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        stagingBucket: "upload-staging",
        stagingPath: "user-1/staging-id",
        status: "PENDING",
        expiresAt: new Date(NOW.getTime() + 10 * 60 * 1000),
      },
      select: { id: true },
    });
    expect(createSignedUploadUrl).toHaveBeenCalledWith("user-1/staging-id");
  });

  it("rejects the 31st intent in the hour while holding the per-user lock", async () => {
    const create = vi.fn();
    const transaction = {
      $queryRaw: vi.fn(async () => [{ id: "user-1" }]),
      uploadIntent: {
        count: vi.fn(async () => MAX_UPLOAD_INTENTS_PER_USER_PER_HOUR),
        create,
      },
    };
    const prisma = {
      $transaction: vi.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    };

    await expect(
      createUploadIntent(
        {
          userId: "user-1",
          purpose: "project-media",
          mimeType: "image/png",
          byteSize: PNG_BYTES.byteLength,
        },
        { prisma: prisma as never, now: () => NOW },
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("finalizeUploadIntent", () => {
  it("returns the cached result on a second finalization without a duplicate resource", async () => {
    const database = fakePrisma();
    const storage = fakeStorage();
    const dependencies = {
      prisma: database.prisma as never,
      getStorageClient: storage.getStorageClient,
      now: () => NOW,
      uuid: () => "public-id",
    };

    const first = await finalizeUploadIntent(
      { userId: "user-1", intentId: "intent-1" },
      dependencies,
    );
    const second = await finalizeUploadIntent(
      { userId: "user-1", intentId: "intent-1" },
      dependencies,
    );

    expect(first).toEqual({
      url: "https://cdn.example.test/user-1/public-id.png",
      mimeType: "image/png",
      resource: { id: "resource-1" },
    });
    expect(second).toEqual(first);
    expect(database.imageResourceCreate).toHaveBeenCalledTimes(1);
    const resourceInput = database.imageResourceCreate.mock.calls[0]?.[0];
    if (!resourceInput) throw new Error("Expected an ImageResource create call.");
    expect(resourceInput.data).toMatchObject({
      storageBucket: "public-media",
      storagePath: "user-1/public-id.png",
      storageByteSize: PNG_BYTES.byteLength,
    });
    expect(storage.download).toHaveBeenCalledTimes(1);
  });

  it("rejects an intent owned by another user", async () => {
    const database = fakePrisma();
    const storage = fakeStorage();

    await expect(
      finalizeUploadIntent(
        { userId: "user-2", intentId: "intent-1" },
        {
          prisma: database.prisma as never,
          getStorageClient: storage.getStorageClient,
          now: () => NOW,
        },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(storage.download).not.toHaveBeenCalled();
  });

  it("expires an overdue intent, removes staging, and returns 410", async () => {
    const database = fakePrisma(
      intent({ expiresAt: new Date(NOW.getTime() - 1) }),
    );
    const storage = fakeStorage();

    await expect(
      finalizeUploadIntent(
        { userId: "user-1", intentId: "intent-1" },
        {
          prisma: database.prisma as never,
          getStorageClient: storage.getStorageClient,
          now: () => NOW,
        },
      ),
    ).rejects.toMatchObject({ status: 410 });
    expect(database.row.status).toBe("EXPIRED");
    expect(storage.remove).toHaveBeenCalledWith(["user-1/staging-id"]);
  });

  it("rejects a magic-byte mismatch and marks the intent failed", async () => {
    const database = fakePrisma();
    const storage = fakeStorage(
      new Blob(["<html>not an image</html>"], { type: "image/png" }),
    );

    await expect(
      finalizeUploadIntent(
        { userId: "user-1", intentId: "intent-1" },
        {
          prisma: database.prisma as never,
          getStorageClient: storage.getStorageClient,
          now: () => NOW,
        },
      ),
    ).rejects.toBeInstanceOf(UploadValidationError);
    expect(database.row.status).toBe("FAILED");
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith(["user-1/staging-id"]);
  });

  it("returns the legacy url/mimeType shape for non-resource uploads", async () => {
    const database = fakePrisma(intent({ purpose: "project-media" }));
    const storage = fakeStorage();

    await expect(
      finalizeUploadIntent(
        { userId: "user-1", intentId: "intent-1" },
        {
          prisma: database.prisma as never,
          getStorageClient: storage.getStorageClient,
          now: () => NOW,
          uuid: () => "public-id",
        },
      ),
    ).resolves.toEqual({
      url: "https://cdn.example.test/user-1/public-id.png",
      mimeType: "image/png",
    });
    expect(database.imageResourceCreate).not.toHaveBeenCalled();
    expect(database.row).toMatchObject({
      resultStorageBucket: "public-media",
      resultStoragePath: "user-1/public-id.png",
      resultByteSize: PNG_BYTES.byteLength,
    });
  });

  it("rejects a server-observed upload that would exceed the owned-byte quota", async () => {
    const database = fakePrisma(
      intent({ purpose: "project-media" }),
      MAX_FINALIZED_OWNED_MEDIA_BYTES - PNG_BYTES.byteLength + 1,
    );
    const storage = fakeStorage();

    await expect(
      finalizeUploadIntent(
        { userId: "user-1", intentId: "intent-1" },
        {
          prisma: database.prisma as never,
          getStorageClient: storage.getStorageClient,
          now: () => NOW,
          uuid: () => "public-id",
        },
      ),
    ).rejects.toMatchObject({ status: 413 });
    expect(database.row.status).toBe("FAILED");
    expect(storage.remove).toHaveBeenCalledWith(["user-1/public-id.png"]);
  });
});
