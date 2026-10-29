-- Each run keeps its own field provenance, including earlier source evidence.
DROP INDEX "bern_field_lineage_entity_entityId_field_source_sourceId_key";
CREATE UNIQUE INDEX "bern_field_lineage_runId_entity_entityId_field_source_sourc_key" ON "bern_field_lineage"("runId", "entity", "entityId", "field", "source", "sourceId");
