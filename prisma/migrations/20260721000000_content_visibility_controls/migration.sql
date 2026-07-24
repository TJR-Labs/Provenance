-- AlterTable
ALTER TABLE "User" ADD COLUMN "private" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "private" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "excludeFromFeed" BOOLEAN NOT NULL DEFAULT false;
