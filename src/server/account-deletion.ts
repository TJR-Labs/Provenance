import { createHash } from "node:crypto";

import type { PrismaClient } from "../../generated/prisma";

import { verifyPassword } from "~/server/auth/password";
import { accountEmailRateLimitKey } from "~/server/account-email";
import { db } from "~/server/db";
import {
  queueStorageDeletions,
  type StorageObjectKey,
} from "~/server/storage-deletions";

export const RECENT_OAUTH_REAUTH_MS = 10 * 60 * 1000;

const USER_ID_RATE_LIMIT_SCOPES = [
  "change-password",
  "report",
  "email-verification",
] as const;
const EMAIL_RATE_LIMIT_SCOPES = [
  "password-reset-request-email",
  "password-reset-consume-email",
] as const;

export class InvalidAccountDeletionReauthenticationError extends Error {
  constructor(
    message = "Reauthentication is required to delete this account.",
  ) {
    super(message);
    this.name = "InvalidAccountDeletionReauthenticationError";
  }
}

function deletionSubjectHash(userId: string) {
  return createHash("sha256")
    .update(`account-deletion:${userId}`)
    .digest("hex");
}

function uniqueStorageObjects(objects: StorageObjectKey[]) {
  return [
    ...new Map(
      objects.map((object) => [`${object.bucket}\0${object.path}`, object]),
    ).values(),
  ];
}

function storageObject(
  bucket: string | null | undefined,
  path: string | null | undefined,
) {
  return bucket && path ? { bucket, path } : null;
}

export async function requestAccountDeletion(
  input: {
    userId: string;
    currentPassword?: string;
    authenticatedAt?: number;
  },
  database: PrismaClient = db,
  now = new Date(),
) {
  const subjectHash = deletionSubjectHash(input.userId);
  try {
    return await database.$transaction(async (transaction) => {
      const priorAudit = await transaction.accountDeletionAudit.findUnique({
        where: { subjectHash },
        select: { storageObjectsQueued: true },
      });
      if (priorAudit) {
        return {
          deleted: true as const,
          alreadyDeleted: true as const,
          storageObjectsQueued: priorAudit.storageObjectsQueued,
        };
      }

      const user = await transaction.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          username: true,
          email: true,
          passwordHash: true,
          accounts: { select: { id: true } },
        },
      });
      if (!user) {
        throw new InvalidAccountDeletionReauthenticationError();
      }

      if (user.passwordHash) {
        if (
          !input.currentPassword ||
          !(await verifyPassword(input.currentPassword, user.passwordHash))
        ) {
          throw new InvalidAccountDeletionReauthenticationError(
            "Current password is incorrect.",
          );
        }
      } else {
        const authenticationAge =
          typeof input.authenticatedAt === "number"
            ? now.getTime() - input.authenticatedAt
            : Number.POSITIVE_INFINITY;
        if (
          user.accounts.length === 0 ||
          authenticationAge < 0 ||
          authenticationAge > RECENT_OAUTH_REAUTH_MS
        ) {
          throw new InvalidAccountDeletionReauthenticationError(
            "Sign in with a connected provider again before deleting this account.",
          );
        }
      }

      const [imageResources, projectMedia, uploadIntents] = await Promise.all([
        transaction.imageResource.findMany({
          where: { userId: user.id },
          select: { storageBucket: true, storagePath: true },
        }),
        transaction.projectMedia.findMany({
          where: { project: { userId: user.id } },
          select: { storageBucket: true, storagePath: true },
        }),
        transaction.uploadIntent.findMany({
          where: { userId: user.id },
          select: {
            stagingBucket: true,
            stagingPath: true,
            resultStorageBucket: true,
            resultStoragePath: true,
          },
        }),
      ]);

      const objects = uniqueStorageObjects(
        [
          ...imageResources.map((resource) =>
            storageObject(resource.storageBucket, resource.storagePath),
          ),
          ...projectMedia.map((media) =>
            storageObject(media.storageBucket, media.storagePath),
          ),
          ...uploadIntents.flatMap((intent) => [
            storageObject(intent.stagingBucket, intent.stagingPath),
            storageObject(intent.resultStorageBucket, intent.resultStoragePath),
          ]),
        ].filter((object): object is StorageObjectKey => object !== null),
      );

      await queueStorageDeletions(transaction, objects, "account deletion");

      // Reports against the deleted account are about content that is being
      // removed. Reports made by the account are retained for moderation, but
      // their reporter identity is severed before the User row is deleted.
      await transaction.report.deleteMany({
        where: { reportedUserId: user.id },
      });
      await transaction.report.updateMany({
        where: { reporterId: user.id },
        data: { reporterId: null },
      });

      await transaction.pendingOAuthSignup.deleteMany({
        where: {
          OR: [
            { completedUserId: user.id },
            ...(user.email ? [{ email: user.email }] : []),
          ],
        },
      });
      await transaction.loginAttempt.deleteMany({
        where: { username: user.username },
      });

      const rateLimitKeys = [
        ...USER_ID_RATE_LIMIT_SCOPES.map((scope) => ({
          scope,
          key: user.id,
        })),
        ...(user.email
          ? EMAIL_RATE_LIMIT_SCOPES.map((scope) => ({
              scope,
              key: accountEmailRateLimitKey(user.email!),
            }))
          : []),
      ];
      await transaction.rateLimitAttempt.deleteMany({
        where: { OR: rateLimitKeys },
      });

      await transaction.accountDeletionAudit.create({
        data: {
          subjectHash,
          storageObjectsQueued: objects.length,
          requestedAt: now,
        },
      });
      await transaction.user.delete({ where: { id: user.id } });

      return {
        deleted: true as const,
        alreadyDeleted: false as const,
        storageObjectsQueued: objects.length,
      };
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const audit = await database.accountDeletionAudit.findUnique({
        where: { subjectHash },
        select: { storageObjectsQueued: true },
      });
      if (audit) {
        return {
          deleted: true as const,
          alreadyDeleted: true as const,
          storageObjectsQueued: audit.storageObjectsQueued,
        };
      }
    }
    throw error;
  }
}
