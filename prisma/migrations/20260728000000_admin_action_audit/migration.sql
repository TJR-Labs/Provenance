-- Audit trail for admin recovery actions (verifyEmail, forcePasswordReset).
CREATE TABLE "AdminActionAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminActionAudit_targetUserId_createdAt_idx"
ON "AdminActionAudit"("targetUserId", "createdAt");
CREATE INDEX "AdminActionAudit_actorId_createdAt_idx"
ON "AdminActionAudit"("actorId", "createdAt");
