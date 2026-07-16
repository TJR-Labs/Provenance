-- Existing users retain their password hash and begin with no email.
ALTER TABLE "User"
  ALTER COLUMN "passwordHash" DROP NOT NULL,
  ADD COLUMN "email" TEXT;

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PendingOAuthSignup" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "email" TEXT,
  "emailVerified" BOOLEAN NOT NULL,
  "name" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PendingOAuthSignup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OAuthLinkIntent" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthLinkIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key"
  ON "Account"("provider", "providerAccountId");
CREATE UNIQUE INDEX "Account_userId_provider_key"
  ON "Account"("userId", "provider");
CREATE UNIQUE INDEX "PendingOAuthSignup_tokenHash_key"
  ON "PendingOAuthSignup"("tokenHash");
CREATE INDEX "PendingOAuthSignup_expiresAt_idx"
  ON "PendingOAuthSignup"("expiresAt");
CREATE UNIQUE INDEX "OAuthLinkIntent_tokenHash_key"
  ON "OAuthLinkIntent"("tokenHash");
CREATE INDEX "OAuthLinkIntent_expiresAt_idx"
  ON "OAuthLinkIntent"("expiresAt");

ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthLinkIntent" ADD CONSTRAINT "OAuthLinkIntent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
