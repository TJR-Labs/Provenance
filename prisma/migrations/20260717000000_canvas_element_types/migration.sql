-- AlterEnum
ALTER TYPE "CanvasElementType" ADD VALUE 'TEXT';
ALTER TYPE "CanvasElementType" ADD VALUE 'IMAGE';
ALTER TYPE "CanvasElementType" ADD VALUE 'LINK';

-- AlterTable
ALTER TABLE "CanvasElement"
ADD COLUMN "textContent" TEXT,
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "imageCaption" TEXT,
ADD COLUMN "linkLabel" TEXT,
ADD COLUMN "linkUrl" TEXT;
