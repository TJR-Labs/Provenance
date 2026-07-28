-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('IDEA', 'BUILDING', 'SHIPPED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "status" "ProjectStatus" NOT NULL DEFAULT 'BUILDING';

-- CreateTable
CREATE TABLE "DevlogEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevlogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DevlogEntry_userId_createdAt_idx" ON "DevlogEntry"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "DevlogEntry" ADD CONSTRAINT "DevlogEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
