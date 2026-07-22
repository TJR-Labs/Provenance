-- CreateEnum
CREATE TYPE "UploadIntentStatus" AS ENUM ('PENDING', 'FINALIZED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "UploadIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "declaredMimeType" TEXT NOT NULL,
    "declaredByteSize" INTEGER NOT NULL,
    "stagingBucket" TEXT NOT NULL,
    "stagingPath" TEXT NOT NULL,
    "status" "UploadIntentStatus" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resultUrl" TEXT,
    "resultMimeType" TEXT,
    "resultResourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "UploadIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadIntent_stagingPath_key" ON "UploadIntent"("stagingPath");

-- CreateIndex
CREATE INDEX "UploadIntent_userId_idx" ON "UploadIntent"("userId");

-- CreateIndex
CREATE INDEX "UploadIntent_status_expiresAt_idx" ON "UploadIntent"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "UploadIntent" ADD CONSTRAINT "UploadIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
