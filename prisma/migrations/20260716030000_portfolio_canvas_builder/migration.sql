-- CreateEnum
CREATE TYPE "LayoutMode" AS ENUM ('GRID', 'CANVAS');

-- CreateEnum
CREATE TYPE "CanvasElementType" AS ENUM ('ABOUT', 'LINKS', 'PROJECT');

-- CreateEnum
CREATE TYPE "CanvasElementState" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "layoutMode" "LayoutMode" NOT NULL DEFAULT 'GRID',
ADD COLUMN "canvasDraftSavedAt" TIMESTAMP(3),
ADD COLUMN "canvasPublishedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CanvasElement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" "CanvasElementState" NOT NULL,
    "type" "CanvasElementType" NOT NULL,
    "projectId" TEXT,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "zIndex" INTEGER NOT NULL,

    CONSTRAINT "CanvasElement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanvasElement_userId_state_idx" ON "CanvasElement"("userId", "state");

-- AddForeignKey
ALTER TABLE "CanvasElement" ADD CONSTRAINT "CanvasElement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasElement" ADD CONSTRAINT "CanvasElement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
