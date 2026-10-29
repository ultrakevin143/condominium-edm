import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { loadEnvironment } from "../src/config/environment.js";
import { assertNeonConfiguration } from "../src/config/database-safety.js";

// Deliberate maintenance only: review and verify pending migrations locally first.
// This command does not provision accounts, seed records or run a pipeline.
loadEnvironment();
assertNeonConfiguration();
const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const require = createRequire(import.meta.url);
function sanitize(value: string) {
  for (const secret of [
    process.env.DATABASE_URL!,
    process.env.DIRECT_URL!,
    new URL(process.env.DIRECT_URL!).password,
    decodeURIComponent(new URL(process.env.DIRECT_URL!).password),
    process.env.SEED_PASSWORD,
  ])
    if (secret) value = value.replaceAll(secret, "[redacted]");
  return value;
}
async function snapshot() {
  // Select only pre-existing fields so this also works before the auth migration.
  const users = await db.user.findMany({
    select: { id: true, passwordHash: true, roleId: true, active: true },
    orderBy: { id: "asc" },
  });
  const [counts] = await db.$queryRaw<
    { sources: number; tenants: number; runs: number }[]
  >`
    SELECT
      ((SELECT count(*) FROM bern_hub.bern_src_tenancy)+(SELECT count(*) FROM bern_hub.bern_src_billing)+(SELECT count(*) FROM bern_hub.bern_src_maintenance)+(SELECT count(*) FROM bern_hub.bern_src_visitor_log))::int AS sources,
      (SELECT count(*)::int FROM bern_hub.bern_tenant) AS tenants,
      (SELECT count(*)::int FROM bern_hub.bern_pipeline_run) AS runs
  `;
  return { users, counts };
}
try {
  const before = await snapshot();
  await db.$disconnect();
  await mkdir(".local", { recursive: true });
  let output = "";
  const exit = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
      {
        env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    child.stdout.on("data", (data) => {
      output += String(data);
    });
    child.stderr.on("data", (data) => {
      output += String(data);
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  await writeFile(".local/neon-auth-migration.log", sanitize(output));
  if (exit !== 0) throw new Error("Migration did not complete.");
  const after = await snapshot();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error(
      "Account or operational summary changed; inspect before continuing.",
    );
  await writeFile(
    ".local/neon-auth-migration.txt",
    "Pending migrations applied. Account password hashes, roles and active state are unchanged. Source, tenant and pipeline counts are unchanged. No seed, pipeline or automated remote tests were run.\n",
  );
  console.log(
    "Neon migration completed; existing accounts and operational summaries were preserved.",
  );
} catch {
  console.error(
    "Neon migration/check did not complete. Inspect the sanitized .local/neon-auth-migration.log; no automatic retry was made.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
