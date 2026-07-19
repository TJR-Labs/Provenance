-- AlterEnum
ALTER TYPE "CanvasElementType" ADD VALUE 'AVATAR';
ALTER TYPE "CanvasElementType" ADD VALUE 'NAME';
ALTER TYPE "CanvasElementType" ADD VALUE 'USERNAME';
ALTER TYPE "CanvasElementType" ADD VALUE 'CATEGORIES';

-- AlterTable
ALTER TABLE "CanvasElement"
ADD COLUMN "textColor" TEXT,
ADD COLUMN "backgroundColor" TEXT,
ADD COLUMN "fontFamily" TEXT,
ADD COLUMN "avatarShape" TEXT,
ADD COLUMN "avatarZoom" INTEGER,
ADD COLUMN "avatarOffsetX" INTEGER,
ADD COLUMN "avatarOffsetY" INTEGER;
