import { randomUUID } from "node:crypto";

import { env } from "~/env";
import { db } from "~/server/db";
import {
  createStorageClient,
  type StorageClientFactory,
} from "~/server/storage";
import { queueAndDeleteStorageObjectBestEffort } from "~/server/storage-deletions";
import {
  ALLOWED_UPLOAD_TYPES,
  EXTENSION_BY_MIME_TYPE,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  UploadValidationError,
  validateUpload,
} from "~/server/upload-validation";

export const UPLOAD_INTENT_TTL_MS = 10 * 60 * 1000;
export const UPLOAD_INTENT_RATE_WINDOW_MS = 60 * 60 * 1000;
export const MAX_UPLOAD_INTENTS_PER_USER_PER_HOUR = 30;
export const MAX_FINALIZED_OWNED_MEDIA_BYTES = 1024 * 1024 * 1024;

export const UPLOAD_PURPOSES = [
  "project-media",
  "canvas-resource",
  "avatar",
] as const;

export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

type UploadIntentRecord = Awaited<
  ReturnType<typeof db.uploadIntent.findUnique>
>;

type UploadIntentDependencies = {
  prisma?: typeof db;
  getStorageClient?: StorageClientFactory;
  now?: () => Date;
  uuid?: () => string;
};

export class UploadIntentError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "UploadIntentError";
  }
}

class StorageQuotaExceededError extends UploadIntentError {
  constructor() {
    super(413, "Storage quota exceeded. Remove existing media and try again.");
    this.name = "StorageQuotaExceededError";
  }
}

function validateDeclaredUpload(
  purpose: UploadPurpose,
  mimeType: string,
  byteSize: number,
) {
  if (!ALLOWED_UPLOAD_TYPES.has(mimeType)) {
    throw new UploadIntentError(
      415,
      "Unsupported file type. Upload a PNG, JPEG, WebP, GIF, MP4, or WebM file.",
    );
  }

  if (purpose === "canvas-resource" && !mimeType.startsWith("image/")) {
    throw new UploadIntentError(415, "Resources must be images.");
  }

  const maximum = mimeType.startsWith("video/")
    ? MAX_VIDEO_BYTES
    : MAX_IMAGE_BYTES;
  if (byteSize > maximum) {
    const limit = maximum === MAX_VIDEO_BYTES ? "50MB" : "10MB";
    throw new UploadIntentError(
      413,
      `File is too large. The limit for this file type is ${limit}.`,
    );
  }
}

export async function createUploadIntent(
  input: {
    userId: string;
    purpose: UploadPurpose;
    mimeType: string;
    byteSize: number;
  },
  dependencies: UploadIntentDependencies = {},
) {
  const prisma = dependencies.prisma ?? db;
  const getStorageClient = dependencies.getStorageClient ?? createStorageClient;
  const currentTime = dependencies.now ?? (() => new Date());
  const now = currentTime();
  const uuid = dependencies.uuid ?? randomUUID;

  validateDeclaredUpload(input.purpose, input.mimeType, input.byteSize);

  const stagingPath = `${input.userId}/${uuid()}`;
  const intent = await prisma.$transaction(async (transaction) => {
    // The User row is a per-user mutex. Every intent creation takes this lock,
    // so the count and insert cannot race at the 30/hour boundary.
    await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
    const recentIntentCount = await transaction.uploadIntent.count({
      where: {
        userId: input.userId,
        createdAt: {
          gte: new Date(now.getTime() - UPLOAD_INTENT_RATE_WINDOW_MS),
        },
      },
    });
    if (recentIntentCount >= MAX_UPLOAD_INTENTS_PER_USER_PER_HOUR) {
      throw new UploadIntentError(
        429,
        "Too many upload attempts. Try again later.",
      );
    }

    return transaction.uploadIntent.create({
      data: {
        userId: input.userId,
        purpose: input.purpose,
        declaredMimeType: input.mimeType,
        declaredByteSize: input.byteSize,
        stagingBucket: env.SUPABASE_STORAGE_STAGING_BUCKET,
        stagingPath,
        status: "PENDING",
        expiresAt: new Date(now.getTime() + UPLOAD_INTENT_TTL_MS),
      },
      select: { id: true },
    });
  });

  const { data, error } = await getStorageClient()
    .storage.from(env.SUPABASE_STORAGE_STAGING_BUCKET)
    .createSignedUploadUrl(stagingPath);
  if (error || !data?.signedUrl) {
    await prisma.uploadIntent.updateMany({
      where: { id: intent.id, status: "PENDING" },
      data: { status: "FAILED" },
    });
    throw new UploadIntentError(502, "Unable to prepare the upload.");
  }

  return {
    intentId: intent.id,
    uploadUrl: data.signedUrl,
    purpose: input.purpose,
  };
}

function finalizedResult(intent: NonNullable<UploadIntentRecord>) {
  if (!intent.resultUrl || !intent.resultMimeType) {
    throw new UploadIntentError(500, "The finalized upload is incomplete.");
  }

  return {
    url: intent.resultUrl,
    mimeType: intent.resultMimeType,
    ...(intent.resultResourceId
      ? { resource: { id: intent.resultResourceId } }
      : {}),
  };
}

async function removeObjectBestEffort(
  getStorageClient: StorageClientFactory,
  bucket: string,
  path: string,
  label: string,
) {
  try {
    const { error } = await getStorageClient()
      .storage.from(bucket)
      .remove([path]);
    if (error) {
      console.error(`${label} cleanup failed`, error);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`${label} cleanup failed`, error);
    return false;
  }
}

async function removeStagingObjectBestEffort(
  prisma: typeof db,
  getStorageClient: StorageClientFactory,
  intentId: string,
  bucket: string,
  path: string,
  label: string,
) {
  const removed = await removeObjectBestEffort(
    getStorageClient,
    bucket,
    path,
    label,
  );
  if (removed) {
    await prisma.uploadIntent.updateMany({
      where: { id: intentId, stagingDeletedAt: null },
      data: { stagingDeletedAt: new Date() },
    });
  }
}

async function removePublicObjectWithRetry(
  prisma: typeof db,
  getStorageClient: StorageClientFactory,
  bucket: string,
  path: string,
  reason: string,
) {
  try {
    await queueAndDeleteStorageObjectBestEffort({ bucket, path }, reason, {
      prisma,
      getStorageClient,
    });
  } catch (error) {
    console.error("Unable to queue public Storage cleanup", error);
  }
}

export async function finalizeUploadIntent(
  input: { userId: string; intentId: string },
  dependencies: UploadIntentDependencies = {},
) {
  const prisma = dependencies.prisma ?? db;
  const getStorageClient = dependencies.getStorageClient ?? createStorageClient;
  const currentTime = dependencies.now ?? (() => new Date());
  const now = currentTime();
  const uuid = dependencies.uuid ?? randomUUID;

  const intent = await prisma.uploadIntent.findUnique({
    where: { id: input.intentId },
  });
  if (!intent) throw new UploadIntentError(404, "Upload intent not found.");
  if (intent.userId !== input.userId) {
    throw new UploadIntentError(
      403,
      "This upload intent belongs to another user.",
    );
  }
  if (intent.status === "FINALIZED") return finalizedResult(intent);
  if (intent.status === "FAILED" || intent.status === "EXPIRED") {
    throw new UploadIntentError(
      410,
      "This upload intent is no longer available.",
    );
  }
  if (now > intent.expiresAt) {
    await prisma.uploadIntent.updateMany({
      where: { id: intent.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    await removeStagingObjectBestEffort(
      prisma,
      getStorageClient,
      intent.id,
      intent.stagingBucket,
      intent.stagingPath,
      "Expired staging upload",
    );
    throw new UploadIntentError(410, "This upload intent has expired.");
  }

  const stagingStorage = getStorageClient().storage.from(intent.stagingBucket);
  const { data: blob, error: downloadError } = await stagingStorage.download(
    intent.stagingPath,
  );
  if (downloadError || !blob) {
    throw new UploadIntentError(
      400,
      "The file upload has not completed. Upload the file before finalizing.",
    );
  }

  const uploadedFile = {
    size: blob.size,
    type: intent.declaredMimeType,
    slice: blob.slice.bind(blob),
  };

  try {
    await validateUpload(uploadedFile);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      await prisma.uploadIntent.updateMany({
        where: { id: intent.id, status: "PENDING" },
        data: { status: "FAILED" },
      });
      await removeStagingObjectBestEffort(
        prisma,
        getStorageClient,
        intent.id,
        intent.stagingBucket,
        intent.stagingPath,
        "Invalid staging upload",
      );
    }
    throw error;
  }

  // validateUpload proved that the downloaded magic bytes match this type.
  const mimeType = intent.declaredMimeType;
  const extension = EXTENSION_BY_MIME_TYPE[mimeType];
  const publicPath = `${input.userId}/${uuid()}${extension ? `.${extension}` : ""}`;
  const publicStorage = getStorageClient().storage.from(
    env.SUPABASE_STORAGE_BUCKET,
  );
  const { error: uploadError } = await publicStorage.upload(publicPath, blob, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploadError) {
    await prisma.uploadIntent.updateMany({
      where: { id: intent.id, status: "PENDING" },
      data: { status: "FAILED" },
    });
    await removeStagingObjectBestEffort(
      prisma,
      getStorageClient,
      intent.id,
      intent.stagingBucket,
      intent.stagingPath,
      "Failed staging upload",
    );
    throw new UploadIntentError(502, "Unable to store the validated file.");
  }

  const url = publicStorage.getPublicUrl(publicPath).data.publicUrl;
  let committed = false;

  try {
    const transactionResult = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "UploadIntent" WHERE "id" = ${intent.id} FOR UPDATE`;
      const lockedIntent = await transaction.uploadIntent.findUnique({
        where: { id: intent.id },
      });
      if (!lockedIntent) {
        return { kind: "missing" as const };
      }
      if (lockedIntent.status === "FINALIZED") {
        return {
          kind: "cached" as const,
          result: finalizedResult(lockedIntent),
        };
      }
      if (
        lockedIntent.status === "FAILED" ||
        lockedIntent.status === "EXPIRED"
      ) {
        return { kind: "gone" as const };
      }
      const finalizedAt = currentTime();
      if (finalizedAt > lockedIntent.expiresAt) {
        await transaction.uploadIntent.update({
          where: { id: lockedIntent.id },
          data: { status: "EXPIRED" },
        });
        return { kind: "expired" as const };
      }

      // All finalizations for one owner serialize on the User row. The sum
      // therefore observes every previously committed finalization and cannot
      // race past the per-user quota.
      await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
      const ownedBytes = await transaction.uploadIntent.aggregate({
        where: {
          userId: input.userId,
          status: "FINALIZED",
          storageDeletedAt: null,
        },
        _sum: { resultByteSize: true },
      });
      if (
        (ownedBytes._sum.resultByteSize ?? 0) + blob.size >
        MAX_FINALIZED_OWNED_MEDIA_BYTES
      ) {
        throw new StorageQuotaExceededError();
      }

      const resource =
        lockedIntent.purpose === "canvas-resource"
          ? await transaction.imageResource.create({
              data: {
                userId: input.userId,
                url,
                mimeType,
                storageBucket: env.SUPABASE_STORAGE_BUCKET,
                storagePath: publicPath,
                storageByteSize: blob.size,
              },
              select: {
                id: true,
                url: true,
                mimeType: true,
                createdAt: true,
              },
            })
          : null;

      const finalized = await transaction.uploadIntent.update({
        where: { id: lockedIntent.id },
        data: {
          status: "FINALIZED",
          resultUrl: url,
          resultMimeType: mimeType,
          resultResourceId: resource?.id ?? null,
          resultStorageBucket: env.SUPABASE_STORAGE_BUCKET,
          resultStoragePath: publicPath,
          resultByteSize: blob.size,
          finalizedAt,
        },
      });
      return { kind: "finalized" as const, result: finalizedResult(finalized) };
    });

    committed = transactionResult.kind === "finalized";

    if (transactionResult.kind !== "finalized") {
      await removePublicObjectWithRetry(
        prisma,
        getStorageClient,
        env.SUPABASE_STORAGE_BUCKET,
        publicPath,
        "duplicate finalization upload",
      );
    }

    if (transactionResult.kind === "missing") {
      throw new UploadIntentError(404, "Upload intent not found.");
    }
    if (
      transactionResult.kind === "gone" ||
      transactionResult.kind === "expired"
    ) {
      throw new UploadIntentError(
        410,
        "This upload intent is no longer available.",
      );
    }

    await removeStagingObjectBestEffort(
      prisma,
      getStorageClient,
      intent.id,
      intent.stagingBucket,
      intent.stagingPath,
      "Finalized staging upload",
    );
    return transactionResult.result;
  } catch (error) {
    if (!committed) {
      await removePublicObjectWithRetry(
        prisma,
        getStorageClient,
        env.SUPABASE_STORAGE_BUCKET,
        publicPath,
        "uncommitted finalization upload",
      );
      if (
        !(error instanceof UploadIntentError) ||
        error instanceof StorageQuotaExceededError
      ) {
        await prisma.uploadIntent.updateMany({
          where: { id: intent.id, status: "PENDING" },
          data: { status: "FAILED" },
        });
      }
    }
    await removeStagingObjectBestEffort(
      prisma,
      getStorageClient,
      intent.id,
      intent.stagingBucket,
      intent.stagingPath,
      "Uncommitted staging upload",
    );
    throw error;
  }
}
