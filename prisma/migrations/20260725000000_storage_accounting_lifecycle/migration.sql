-- Add durable provider metadata without disturbing existing URL-only rows.
ALTER TABLE "ProjectMedia"
ADD COLUMN "storageBucket" TEXT,
ADD COLUMN "storagePath" TEXT,
ADD COLUMN "storageByteSize" INTEGER;

ALTER TABLE "ImageResource"
ADD COLUMN "storageBucket" TEXT,
ADD COLUMN "storagePath" TEXT,
ADD COLUMN "storageByteSize" INTEGER;

-- UploadIntent remains the ownership/accounting ledger even before a
-- project-media upload is attached to a Project row.
ALTER TABLE "UploadIntent"
ADD COLUMN "resultStorageBucket" TEXT,
ADD COLUMN "resultStoragePath" TEXT,
ADD COLUMN "resultByteSize" INTEGER,
ADD COLUMN "storageDeletedAt" TIMESTAMP(3),
ADD COLUMN "stagingDeletedAt" TIMESTAMP(3);

CREATE TABLE "PendingStorageDeletion" (
    "bucket" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "PendingStorageDeletion_pkey" PRIMARY KEY ("bucket", "path")
);

CREATE INDEX "ProjectMedia_storageBucket_storagePath_idx"
ON "ProjectMedia"("storageBucket", "storagePath");

CREATE INDEX "ImageResource_storageBucket_storagePath_idx"
ON "ImageResource"("storageBucket", "storagePath");

CREATE INDEX "UploadIntent_userId_status_storageDeletedAt_idx"
ON "UploadIntent"("userId", "status", "storageDeletedAt");

CREATE INDEX "UploadIntent_resultStorageBucket_resultStoragePath_idx"
ON "UploadIntent"("resultStorageBucket", "resultStoragePath");

CREATE INDEX "PendingStorageDeletion_attempts_createdAt_idx"
ON "PendingStorageDeletion"("attempts", "createdAt");

-- Keep the outbox invariant even for cascade deletes (including a future
-- account-deletion flow) and for media-replacement paths outside projects.ts.
-- The application still queues project deletions explicitly so it can attempt
-- Storage cleanup immediately after commit; ON CONFLICT makes both paths safe.
CREATE FUNCTION "queueOwnedStorageDeletion"() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."storageBucket" IS NOT NULL AND OLD."storagePath" IS NOT NULL THEN
    INSERT INTO "PendingStorageDeletion" ("bucket", "path", "reason")
    VALUES (
      OLD."storageBucket",
      OLD."storagePath",
      TG_TABLE_NAME || ' row deleted'
    )
    ON CONFLICT ("bucket", "path") DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProjectMedia_queue_storage_deletion"
AFTER DELETE ON "ProjectMedia"
FOR EACH ROW EXECUTE FUNCTION "queueOwnedStorageDeletion"();

CREATE TRIGGER "ImageResource_queue_storage_deletion"
AFTER DELETE ON "ImageResource"
FOR EACH ROW EXECUTE FUNCTION "queueOwnedStorageDeletion"();

-- Avatar uploads may be owned only by the UploadIntent ledger. A finalized
-- ledger row is normally retained; this trigger primarily covers its cascade
-- during account teardown so those objects also survive as outbox work.
CREATE FUNCTION "queueUploadIntentStorageDeletion"() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" = 'FINALIZED'
     AND OLD."storageDeletedAt" IS NULL
     AND OLD."resultStorageBucket" IS NOT NULL
     AND OLD."resultStoragePath" IS NOT NULL THEN
    INSERT INTO "PendingStorageDeletion" ("bucket", "path", "reason")
    VALUES (
      OLD."resultStorageBucket",
      OLD."resultStoragePath",
      'upload ownership ledger deleted'
    )
    ON CONFLICT ("bucket", "path") DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UploadIntent_queue_storage_deletion"
AFTER DELETE ON "UploadIntent"
FOR EACH ROW EXECUTE FUNCTION "queueUploadIntentStorageDeletion"();
