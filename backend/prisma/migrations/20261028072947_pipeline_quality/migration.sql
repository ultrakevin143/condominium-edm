-- AlterTable
ALTER TABLE "bern_field_lineage" ADD COLUMN     "method" TEXT NOT NULL DEFAULT 'source';

-- AlterTable
ALTER TABLE "bern_pipeline_run" ADD COLUMN     "deduplicated" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "error" TEXT;

-- AlterTable
ALTER TABLE "bern_quality_result" ADD COLUMN     "definition" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "bern_session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bern_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_source_disposition" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bern_source_disposition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bern_session_tokenHash_key" ON "bern_session"("tokenHash");

-- CreateIndex
CREATE INDEX "bern_session_expiresAt_idx" ON "bern_session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "bern_source_disposition_source_sourceId_key" ON "bern_source_disposition"("source", "sourceId");

-- AddForeignKey
ALTER TABLE "bern_session" ADD CONSTRAINT "bern_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "bern_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
