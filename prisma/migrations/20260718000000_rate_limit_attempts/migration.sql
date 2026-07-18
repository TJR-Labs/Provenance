-- CreateTable
CREATE TABLE "RateLimitAttempt" (
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "RateLimitAttempt_pkey" PRIMARY KEY ("scope","key")
);
