-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "bern_classification" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "bern_pipeline_status" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "bern_issue_status" AS ENUM ('OPEN', 'RESOLVED', 'QUARANTINED', 'ACCEPTED');

-- CreateTable
CREATE TABLE "bern_src_tenancy" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "tenantId" TEXT,
    "tenantName" TEXT,
    "unitCode" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "leaseStart" TEXT,
    "leaseEnd" TEXT,
    "status" TEXT,

    CONSTRAINT "bern_src_tenancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_src_billing" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "tenantId" TEXT,
    "tenantName" TEXT,
    "unitCode" TEXT,
    "period" TEXT,
    "dueDate" TEXT,
    "amountDue" DECIMAL(12,2),
    "amountPaid" DECIMAL(12,2),

    CONSTRAINT "bern_src_billing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_src_maintenance" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "tenantId" TEXT,
    "tenantName" TEXT,
    "unitCode" TEXT,
    "description" TEXT,
    "openedAt" TEXT,
    "status" TEXT,

    CONSTRAINT "bern_src_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_src_visitor_log" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "tenantId" TEXT,
    "tenantName" TEXT,
    "unitCode" TEXT,
    "visitorName" TEXT,
    "enteredAt" TEXT,

    CONSTRAINT "bern_src_visitor_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_pipeline_run" (
    "id" TEXT NOT NULL,
    "status" "bern_pipeline_status" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "extracted" INTEGER NOT NULL DEFAULT 0,
    "loaded" INTEGER NOT NULL DEFAULT 0,
    "quarantined" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bern_pipeline_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_pipeline_stage_log" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bern_pipeline_stage_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_staging_row" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "bern_staging_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_tenant" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,

    CONSTRAINT "bern_tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_unit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "bern_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_lease" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "bern_lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_dues_ledger" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "bern_dues_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_maintenance_request" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "bern_maintenance_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_visitor_entry" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bern_visitor_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_field_lineage" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,

    CONSTRAINT "bern_field_lineage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_quality_rule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "parameters" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "bern_quality_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_quality_result" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "checked" INTEGER NOT NULL,
    "passed" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,

    CONSTRAINT "bern_quality_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_quality_issue" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "stagingId" TEXT,
    "severity" TEXT NOT NULL,
    "status" "bern_issue_status" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bern_quality_issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[],

    CONSTRAINT "bern_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "bern_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_policy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "bern_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_data_owner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "bern_data_owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_field_classification" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "classification" "bern_classification" NOT NULL,
    "source" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,

    CONSTRAINT "bern_field_classification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bern_audit_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bern_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bern_src_tenancy_externalId_key" ON "bern_src_tenancy"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "bern_src_billing_externalId_key" ON "bern_src_billing"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "bern_src_maintenance_externalId_key" ON "bern_src_maintenance"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "bern_src_visitor_log_externalId_key" ON "bern_src_visitor_log"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "bern_staging_row_runId_source_sourceId_key" ON "bern_staging_row"("runId", "source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "bern_tenant_externalId_key" ON "bern_tenant"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "bern_unit_code_key" ON "bern_unit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bern_lease_sourceKey_key" ON "bern_lease"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "bern_dues_ledger_sourceKey_key" ON "bern_dues_ledger"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "bern_maintenance_request_sourceKey_key" ON "bern_maintenance_request"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "bern_visitor_entry_sourceKey_key" ON "bern_visitor_entry"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "bern_field_lineage_entity_entityId_field_source_sourceId_key" ON "bern_field_lineage"("entity", "entityId", "field", "source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "bern_quality_rule_code_key" ON "bern_quality_rule"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bern_quality_result_runId_ruleId_key" ON "bern_quality_result"("runId", "ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "bern_role_code_key" ON "bern_role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bern_user_email_key" ON "bern_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "bern_policy_name_key" ON "bern_policy"("name");

-- CreateIndex
CREATE UNIQUE INDEX "bern_data_owner_name_key" ON "bern_data_owner"("name");

-- CreateIndex
CREATE UNIQUE INDEX "bern_field_classification_entity_field_key" ON "bern_field_classification"("entity", "field");

-- CreateIndex
CREATE INDEX "bern_audit_log_createdAt_idx" ON "bern_audit_log"("createdAt");

-- AddForeignKey
ALTER TABLE "bern_pipeline_stage_log" ADD CONSTRAINT "bern_pipeline_stage_log_runId_fkey" FOREIGN KEY ("runId") REFERENCES "bern_pipeline_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bern_staging_row" ADD CONSTRAINT "bern_staging_row_runId_fkey" FOREIGN KEY ("runId") REFERENCES "bern_pipeline_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bern_lease" ADD CONSTRAINT "bern_lease_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "bern_tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bern_lease" ADD CONSTRAINT "bern_lease_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "bern_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bern_dues_ledger" ADD CONSTRAINT "bern_dues_ledger_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "bern_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bern_maintenance_request" ADD CONSTRAINT "bern_maintenance_request_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "bern_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bern_visitor_entry" ADD CONSTRAINT "bern_visitor_entry_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "bern_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bern_field_lineage" ADD CONSTRAINT "bern_field_lineage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "bern_pipeline_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bern_quality_result" ADD CONSTRAINT "bern_quality_result_runId_fkey" FOREIGN KEY ("runId") REFERENCES "bern_pipeline_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bern_quality_result" ADD CONSTRAINT "bern_quality_result_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "bern_quality_rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bern_quality_issue" ADD CONSTRAINT "bern_quality_issue_runId_fkey" FOREIGN KEY ("runId") REFERENCES "bern_pipeline_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bern_quality_issue" ADD CONSTRAINT "bern_quality_issue_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "bern_quality_rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bern_quality_issue" ADD CONSTRAINT "bern_quality_issue_stagingId_fkey" FOREIGN KEY ("stagingId") REFERENCES "bern_staging_row"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bern_user" ADD CONSTRAINT "bern_user_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "bern_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bern_field_classification" ADD CONSTRAINT "bern_field_classification_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "bern_data_owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bern_field_classification" ADD CONSTRAINT "bern_field_classification_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "bern_policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
