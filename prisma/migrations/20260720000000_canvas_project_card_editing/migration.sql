-- AlterTable
ALTER TABLE "CanvasElement"
ADD COLUMN "projectTitleOverride" TEXT,
ADD COLUMN "projectDescriptionOverride" TEXT,
ADD COLUMN "projectHashtagsOverride" JSONB,
ADD COLUMN "cardLayout" TEXT;
