-- CreateEnum
CREATE TYPE "GridLayoutScope" AS ENUM ('PROFILE', 'PROJECT');

-- CreateEnum
CREATE TYPE "GridLayoutState" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "GridBlockType" AS ENUM ('PROJECT', 'IMAGE', 'TEXT', 'LINK');

-- CreateTable
CREATE TABLE "GridLayout" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "projectId" TEXT,
    "scope" "GridLayoutScope" NOT NULL,
    "state" "GridLayoutState" NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GridLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GridBlock" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "GridBlockType" NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "projectId" TEXT,
    "textContent" TEXT,
    "imageUrl" TEXT,
    "imageMimeType" TEXT,
    "imageAlt" TEXT,
    "linkLabel" TEXT,
    "linkUrl" TEXT,

    CONSTRAINT "GridBlock_pkey" PRIMARY KEY ("id")
);

-- AddCheckConstraint
ALTER TABLE "GridLayout"
  ADD CONSTRAINT "GridLayout_revision_check" CHECK ("revision" >= 0),
  ADD CONSTRAINT "GridLayout_scope_project_check" CHECK (
    ("scope" = 'PROFILE' AND "projectId" IS NULL)
    OR ("scope" = 'PROJECT' AND "projectId" IS NOT NULL AND "state" = 'PUBLISHED')
  );

-- AddCheckConstraint
ALTER TABLE "GridBlock"
  ADD CONSTRAINT "GridBlock_geometry_check" CHECK (
    "order" >= 0 AND "x" >= 0 AND "y" >= 0
    AND "width" > 0 AND "height" > 0 AND "x" + "width" <= 12
  );

-- CreateIndex
CREATE UNIQUE INDEX "Project_id_userId_key" ON "Project"("id", "userId");

-- CreateIndex
CREATE INDEX "GridLayout_ownerId_scope_state_idx" ON "GridLayout"("ownerId", "scope", "state");

-- CreateIndex
CREATE INDEX "GridLayout_projectId_state_idx" ON "GridLayout"("projectId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "GridBlock_layoutId_key_key" ON "GridBlock"("layoutId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "GridBlock_layoutId_order_key" ON "GridBlock"("layoutId", "order");

-- CreateIndex
CREATE INDEX "GridBlock_projectId_idx" ON "GridBlock"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "GridLayout_profile_owner_state_key"
  ON "GridLayout" ("ownerId", "state") WHERE "scope" = 'PROFILE';

-- CreateIndex
CREATE UNIQUE INDEX "GridLayout_project_key"
  ON "GridLayout" ("projectId") WHERE "scope" = 'PROJECT';

-- AddForeignKey
ALTER TABLE "GridLayout" ADD CONSTRAINT "GridLayout_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GridLayout" ADD CONSTRAINT "GridLayout_projectId_ownerId_fkey" FOREIGN KEY ("projectId", "ownerId") REFERENCES "Project"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GridBlock" ADD CONSTRAINT "GridBlock_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "GridLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GridBlock" ADD CONSTRAINT "GridBlock_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
