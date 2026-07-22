import { randomUUID } from "node:crypto";

import { env } from "~/env";
import { db } from "~/server/db";
import {
  createStorageClient,
  type StorageClientFactory,
} from "~/server/storage";
import {
  ALLOWED_UPLOAD_TYPES,
  EXTENSION_BY_MIME_TYPE,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  UploadValidationError,
  validateUpload,
} from "~/server/upload-validation";

export const UPLOAD_INTENT_TTL_MS = 10 * 60 * 1000;

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

  // Requirements 3.2 and 4 will add atomic per-user quota/throttling here.
  const stagingPath = `${input.userId}/${uuid()}`;
  const intent = await prisma.uploadIntent.create({
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
    if (error) console.error(`${label} cleanup failed`, error);
  } catch (error) {
    console.error(`${label} cleanup failed`, error);
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
    await removeObjectBestEffort(
      getStorageClient,
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
      await removeObjectBestEffort(
        getStorageClient,
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
    await removeObjectBestEffort(
      getStorageClient,
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

      const resource =
        lockedIntent.purpose === "canvas-resource"
          ? await transaction.imageResource.create({
              data: { userId: input.userId, url, mimeType },
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
          finalizedAt,
        },
      });
      return { kind: "finalized" as const, result: finalizedResult(finalized) };
    });

    committed = transactionResult.kind === "finalized";

    if (transactionResult.kind !== "finalized") {
      await removeObjectBestEffort(
        getStorageClient,
        env.SUPABASE_STORAGE_BUCKET,
        publicPath,
        "Duplicate public upload",
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

    await removeObjectBestEffort(
      getStorageClient,
      intent.stagingBucket,
      intent.stagingPath,
      "Finalized staging upload",
    );
    return transactionResult.result;
  } catch (error) {
    if (!committed) {
      await removeObjectBestEffort(
        getStorageClient,
        env.SUPABASE_STORAGE_BUCKET,
        publicPath,
        "Uncommitted public upload",
      );
      if (!(error instanceof UploadIntentError)) {
        await prisma.uploadIntent.updateMany({
          where: { id: intent.id, status: "PENDING" },
          data: { status: "FAILED" },
        });
      }
    }
    await removeObjectBestEffort(
      getStorageClient,
      intent.stagingBucket,
      intent.stagingPath,
      "Uncommitted staging upload",
    );
    throw error;
  }
}
