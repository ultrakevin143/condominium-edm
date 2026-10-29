-- AlterTable
ALTER TABLE "bern_session" ADD COLUMN     "credentialVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "bern_user" ADD COLUMN     "credentialVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "securityAnswerHash" TEXT,
ADD COLUMN     "securityFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "securityLockedUntil" TIMESTAMP(3),
ADD COLUMN     "securityQuestion" TEXT;

-- CreateTable
CREATE TABLE "bern_password_recovery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "credentialVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bern_password_recovery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bern_password_recovery_tokenHash_key" ON "bern_password_recovery"("tokenHash");

-- CreateIndex
CREATE INDEX "bern_password_recovery_userId_expiresAt_idx" ON "bern_password_recovery"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "bern_password_recovery" ADD CONSTRAINT "bern_password_recovery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "bern_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
