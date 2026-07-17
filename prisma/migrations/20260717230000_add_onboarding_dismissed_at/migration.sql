-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingDismissedAt" TIMESTAMP(3);

-- Existing accounts predate first-run onboarding and must NOT retroactively see
-- the checklist. Backfill them as already-dismissed; only accounts created after
-- this migration (onboardingDismissedAt IS NULL by default) are first-run eligible.
UPDATE "User" SET "onboardingDismissedAt" = NOW();
