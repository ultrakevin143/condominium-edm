ALTER TABLE "bern_src_tenancy" ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3);
ALTER TABLE "bern_src_billing" ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3);
ALTER TABLE "bern_src_maintenance" ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3);
ALTER TABLE "bern_src_visitor_log" ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3);

INSERT INTO "bern_quality_rule" ("id", "code", "title", "dimension", "severity", "enabled", "parameters")
VALUES ('e59047d8-02bf-4d06-a49c-29a12c9dc980', 'source_freshness', 'Provider update timestamp is recent', 'timeliness', 'warning', true, '{"days":30}'::jsonb)
ON CONFLICT ("code") DO NOTHING;
