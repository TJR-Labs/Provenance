-- AlterTable
ALTER TABLE "User"
ADD COLUMN "canvasBackgroundColor" TEXT,
ADD COLUMN "canvasBackgroundImageUrl" TEXT,
ADD COLUMN "canvasBackgroundResourceId" TEXT,
ADD COLUMN "canvasDraftRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "canvasDraftSnapshot" JSONB;

-- CreateTable
CREATE TABLE "ImageResource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "ImageResource_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CanvasElement"
ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "resourceId" TEXT;

-- CreateIndex
CREATE INDEX "ImageResource_userId_removedAt_idx" ON "ImageResource"("userId", "removedAt");

-- CreateIndex
CREATE INDEX "CanvasElement_resourceId_idx" ON "CanvasElement"("resourceId");

-- CreateIndex
CREATE INDEX "User_canvasBackgroundResourceId_idx" ON "User"("canvasBackgroundResourceId");

-- AddForeignKey
ALTER TABLE "ImageResource" ADD CONSTRAINT "ImageResource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasElement" ADD CONSTRAINT "CanvasElement_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ImageResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_canvasBackgroundResourceId_fkey" FOREIGN KEY ("canvasBackgroundResourceId") REFERENCES "ImageResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
