-- Remove the recruiting domain. Its records are intentionally not migrated.
DROP TABLE "Message";
DROP TABLE "Score";
DROP TABLE "RubricCriterion";
DROP TABLE "Submission";
DROP TABLE "Brief";

DROP TYPE "BriefDomain";
DROP TYPE "BriefStatus";

-- Preserve administrators and convert every former non-admin account to USER.
CREATE TYPE "Role_new" AS ENUM ('USER', 'ADMIN');
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role_new"
  USING (CASE WHEN "role"::text = 'ADMIN' THEN 'ADMIN' ELSE 'USER' END)::"Role_new";
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

CREATE TYPE "Category" AS ENUM (
  'SOFTWARE_ENGINEER',
  'MECHANICAL_ENGINEER',
  'ELECTRICAL_ENGINEER',
  'ROBOTICS_ENGINEER',
  'ARCHITECT',
  'ARTIST',
  'DESIGNER',
  'DATA_SCIENTIST',
  'WRITER',
  'OTHER'
);

CREATE TYPE "MediaKind" AS ENUM ('UPLOAD', 'EXTERNAL');

ALTER TABLE "User"
  DROP COLUMN "companyName",
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "school" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "links" JSONB,
  ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN "layoutSections" JSONB,
  ADD COLUMN "customCss" TEXT,
  ADD COLUMN "banned" BOOLEAN NOT NULL DEFAULT false,
  ALTER COLUMN "role" SET DEFAULT 'USER';

CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" "Category" NOT NULL,
  "hashtags" TEXT[] NOT NULL,
  "links" TEXT[] NOT NULL,
  "layout" TEXT NOT NULL DEFAULT 'default',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectMedia" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "kind" "MediaKind" NOT NULL,
  "url" TEXT NOT NULL,
  "mimeType" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProjectMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Report" (
  "id" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "projectId" TEXT,
  "reportedUserId" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Project_userId_idx" ON "Project"("userId");
CREATE INDEX "Project_category_idx" ON "Project"("category");
CREATE INDEX "ProjectMedia_projectId_idx" ON "ProjectMedia"("projectId");
CREATE INDEX "Report_projectId_idx" ON "Report"("projectId");
CREATE INDEX "Report_reportedUserId_idx" ON "Report"("reportedUserId");
CREATE INDEX "Report_createdAt_idx" ON "Report"("createdAt");

ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectMedia" ADD CONSTRAINT "ProjectMedia_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey"
  FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedUserId_fkey"
  FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
