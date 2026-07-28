/*
  Warnings:

  - You are about to drop the column `canvasBackgroundColor` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `canvasBackgroundImageUrl` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `canvasBackgroundResourceId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `canvasDraftRevision` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `canvasDraftSavedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `canvasDraftSnapshot` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `canvasHintDismissedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `canvasPublishedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `layoutMode` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `layoutSections` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `theme` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `CanvasElement` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SectionKind" AS ENUM ('HERO', 'PROJECT_GRID', 'ABOUT', 'BUILD_LOG', 'LINKS');

-- CreateEnum
CREATE TYPE "SiteState" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "BlockKind" AS ENUM ('TEXT', 'IMAGE', 'GALLERY', 'EMBED', 'CODE', 'QUOTE', 'PROJECT', 'LINK');

-- DropForeignKey
ALTER TABLE "CanvasElement" DROP CONSTRAINT "CanvasElement_projectId_fkey";

-- DropForeignKey
ALTER TABLE "CanvasElement" DROP CONSTRAINT "CanvasElement_resourceId_fkey";

-- DropForeignKey
ALTER TABLE "CanvasElement" DROP CONSTRAINT "CanvasElement_userId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_canvasBackgroundResourceId_fkey";

-- DropIndex
DROP INDEX "User_canvasBackgroundResourceId_idx";

-- AlterTable
ALTER TABLE "User"
DROP COLUMN "canvasBackgroundColor",
DROP COLUMN "canvasBackgroundImageUrl",
DROP COLUMN "canvasBackgroundResourceId",
DROP COLUMN "canvasDraftRevision",
DROP COLUMN "canvasDraftSavedAt",
DROP COLUMN "canvasDraftSnapshot",
DROP COLUMN "canvasHintDismissedAt",
DROP COLUMN "canvasPublishedAt",
DROP COLUMN "layoutMode",
DROP COLUMN "layoutSections",
DROP COLUMN "theme",
ADD COLUMN     "siteDraftRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "siteDraftSavedAt" TIMESTAMP(3),
ADD COLUMN     "sitePublishedAt" TIMESTAMP(3),
ADD COLUMN     "siteStyleDraft" JSONB,
ADD COLUMN     "siteStylePublished" JSONB;

-- DropTable
DROP TABLE "CanvasElement";

-- DropEnum
DROP TYPE "CanvasElementState";

-- DropEnum
DROP TYPE "CanvasElementType";

-- DropEnum
DROP TYPE "LayoutMode";

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" "SiteState" NOT NULL,
    "kind" "SectionKind" NOT NULL,
    "order" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "BlockKind" NOT NULL,
    "projectId" TEXT,
    "textContent" TEXT,
    "imageUrl" TEXT,
    "imageResourceId" TEXT,
    "imageCaption" TEXT,
    "galleryImages" JSONB,
    "embedUrl" TEXT,
    "codeContent" TEXT,
    "codeLanguage" TEXT,
    "quoteText" TEXT,
    "quoteAttribution" TEXT,
    "linkLabel" TEXT,
    "linkUrl" TEXT,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Section_userId_state_idx" ON "Section"("userId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Section_userId_state_kind_key" ON "Section"("userId", "state", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Section_userId_state_order_key" ON "Section"("userId", "state", "order");

-- CreateIndex
CREATE INDEX "Block_projectId_idx" ON "Block"("projectId");

-- CreateIndex
CREATE INDEX "Block_imageResourceId_idx" ON "Block"("imageResourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Block_sectionId_key_key" ON "Block"("sectionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Block_sectionId_order_key" ON "Block"("sectionId", "order");

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_imageResourceId_fkey" FOREIGN KEY ("imageResourceId") REFERENCES "ImageResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
