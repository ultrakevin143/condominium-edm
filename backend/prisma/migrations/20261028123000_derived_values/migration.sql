ALTER TABLE "bern_dues_ledger" ADD COLUMN "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "monthsOverdue" INTEGER NOT NULL DEFAULT 0;
UPDATE "bern_dues_ledger" SET "balance" = "amountDue" - "amountPaid";
ALTER TABLE "bern_maintenance_request" ADD COLUMN "daysOpen" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bern_dues_ledger" ADD CONSTRAINT "bern_overdue_months_nonnegative" CHECK ("monthsOverdue" >= 0);
ALTER TABLE "bern_maintenance_request" ADD CONSTRAINT "bern_days_open_nonnegative" CHECK ("daysOpen" >= 0);
