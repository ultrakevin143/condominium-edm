import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import { loadEnvironment } from "../src/config/environment.js";
import { assertNeonConfiguration } from "../src/config/database-safety.js";
import { insertDemoSources } from "../prisma/seed-data.js";
import {
  lockPipeline,
  runPipeline,
} from "../src/modules/pipeline/pipeline.service.js";
import { qualityHistory } from "../src/modules/quality/quality.service.js";

loadEnvironment();
assertNeonConfiguration();
const db = new PrismaClient();
let imported = false;
try {
  const admin = await db.user.findFirst({
    where: { active: true, role: { code: "admin" } },
    select: { id: true },
  });
  if (!admin) throw new Error("An active administrator is required.");
  const counts = await db.$transaction(
    async (tx) => {
      await lockPipeline(tx);
      const [state] = await tx.$queryRaw<
        { existing: number; imported: number }[]
      >`SELECT
      ((SELECT count(*) FROM bern_hub.bern_src_tenancy)+(SELECT count(*) FROM bern_hub.bern_src_billing)+(SELECT count(*) FROM bern_hub.bern_src_maintenance)+(SELECT count(*) FROM bern_hub.bern_src_visitor_log)+(SELECT count(*) FROM bern_hub.bern_tenant)+(SELECT count(*) FROM bern_hub.bern_unit)+(SELECT count(*) FROM bern_hub.bern_lease)+(SELECT count(*) FROM bern_hub.bern_dues_ledger)+(SELECT count(*) FROM bern_hub.bern_maintenance_request)+(SELECT count(*) FROM bern_hub.bern_visitor_entry))::int AS existing,
      (SELECT count(*)::int FROM bern_hub.bern_audit_log WHERE action='DEMO_SOURCES_IMPORTED') AS imported`;
      if (!state || state.existing || state.imported)
        throw new Error("Import requires untouched empty operational tables.");
      const inserted = await insertDemoSources(tx);
      if (
        Object.values(inserted).reduce((sum, count) => sum + count, 0) !== 237
      )
        throw new Error("Unexpected fixture count.");
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "DEMO_SOURCES_IMPORTED",
          entity: "SourceSystem",
          after: { ...inserted, fictional: true },
        },
      });
      return inserted;
    },
    { timeout: 60000 },
  );
  imported = true;
  const run = await runPipeline(db, { userId: admin.id, ip: "127.0.0.1" });
  const history = await qualityHistory(db);
  const snapshot = history.find((row) => row.id === run.id);
  const report = `Shared fictional Neon demonstration initialized once.\nSource counts: ${JSON.stringify(counts)}\nPipeline: ${run.status}; extracted ${run.extracted}, loaded ${run.loaded}, quarantined ${run.quarantined}, deduplicated ${run.deduplicated}.\nActual quality score: ${snapshot?.score}%; failing rule types: ${snapshot?.rules.filter((rule) => rule.failed > 0).length}.\nExisting accounts, passwords, roles and catalog were preserved.\nNo automated test suite targeted Neon.\n`;
  await writeFile(".local/neon-demo-import.txt", report);
  console.log(report.trim());
} catch {
  console.error(
    imported
      ? "Sources were imported, but pipeline initialization did not finish. No automatic retry; inspect the saved run."
      : "Demo import refused or rolled back. No accounts or existing operational records were changed.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
