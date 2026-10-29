-- Sources retain messy inputs. Warehouse and evidence tables are stricter.
ALTER TABLE "bern_unit" ADD CONSTRAINT "bern_unit_code_format" CHECK ("code" ~ '^[0-9]+-[A-Z]+$');
ALTER TABLE "bern_dues_ledger" ADD CONSTRAINT "bern_nonnegative_amounts" CHECK ("amountDue" >= 0 AND "amountPaid" >= 0);
ALTER TABLE "bern_lease" ADD CONSTRAINT "bern_lease_dates" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
CREATE UNIQUE INDEX "bern_one_active_lease_per_unit" ON "bern_lease" ("unitId") WHERE upper("status") = 'ACTIVE';
ALTER TABLE "bern_quality_result" ADD CONSTRAINT "bern_quality_counts" CHECK ("checked" >= 0 AND "passed" >= 0 AND "failed" >= 0 AND "checked" = "passed" + "failed");
ALTER TABLE "bern_pipeline_run" ADD CONSTRAINT "bern_pipeline_counts" CHECK ("extracted" >= 0 AND "loaded" >= 0 AND "quarantined" >= 0);
ALTER TABLE "bern_staging_row" ADD CONSTRAINT "bern_staging_status" CHECK ("status" IN ('EXTRACTED', 'LOADED', 'QUARANTINED', 'DEDUPLICATED'));

CREATE FUNCTION "bern_reject_audit_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit history is append-only' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER "bern_audit_immutable" BEFORE UPDATE OR DELETE OR TRUNCATE ON "bern_audit_log"
FOR EACH STATEMENT EXECUTE FUNCTION "bern_reject_audit_mutation"();

-- Table owners can alter or disable triggers. Deployment needs a separate
-- restricted runtime identity; this trigger is not a claim of tamper-proof storage.
