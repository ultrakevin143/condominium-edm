import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { loadEnvironment } from "../src/config/environment.js";
import { assertNeonConfiguration } from "../src/config/database-safety.js";
import { provisionAccess, roleDefinitions } from "../prisma/seed-data.js";
import { verifyPassword } from "../src/shared/security.js";

loadEnvironment();
assertNeonConfiguration();
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 12)
  throw new Error("A private bootstrap account password is required.");
const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const require = createRequire(import.meta.url);
function sanitize(value: string) {
  for (const secret of [
    process.env.DATABASE_URL!,
    process.env.DIRECT_URL!,
    new URL(process.env.DIRECT_URL!).password,
    decodeURIComponent(new URL(process.env.DIRECT_URL!).password),
    password!,
  ])
    value = value.replaceAll(secret, "[redacted]");
  return value;
}
try {
  const verifyOnly = process.argv.includes("--verify-only");
  if (!verifyOnly) {
    const [existing] = await db.$queryRaw<
      { objects: number; legacy: number }[]
    >`
    SELECT
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bern_hub') AS objects,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND left(c.relname,5)='bern_') AS legacy
  `;
    if (!existing || existing.objects || existing.legacy) {
      console.error(
        "Provisioning refused: existing Bern objects require review. No migration or seed was run.",
      );
      process.exitCode = 1;
    } else {
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
      await writeFile(".local/neon-migration.log", sanitize(output));
      if (exit !== 0) throw new Error("Migration did not complete.");
      await db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(6281049)`;
          await provisionAccess(tx, password);
          await tx.auditLog.create({
            data: {
              action: "ACCESS_PROVISIONED",
              entity: "User",
              after: { accounts: 5, operationalSourcesLoaded: false },
            },
          });
        },
        { timeout: 60000 },
      );
    }
  }
  if (process.exitCode !== 1) {
    const users = await db.user.findMany({ include: { role: true } });
    if (users.length !== 5) throw new Error("Account verification failed.");
    for (const [code, definition] of Object.entries(roleDefinitions)) {
      const user = users.find((row) => row.email === `${code}@bern.demo`);
      if (
        !user?.active ||
        user.role.code !== code ||
        !verifyPassword(password, user.passwordHash) ||
        [...user.role.permissions].sort().join("|") !==
          [...definition.permissions].sort().join("|")
      )
        throw new Error("Account verification failed.");
    }
    const [counts] = await db.$queryRaw<
      {
        sources: number;
        tenants: number;
        rules: number;
        catalog: number;
        migrations: number;
      }[]
    >`
      SELECT
        ((SELECT count(*) FROM bern_hub.bern_src_tenancy)+(SELECT count(*) FROM bern_hub.bern_src_billing)+(SELECT count(*) FROM bern_hub.bern_src_maintenance)+(SELECT count(*) FROM bern_hub.bern_src_visitor_log))::int AS sources,
        (SELECT count(*)::int FROM bern_hub.bern_tenant) AS tenants,
        (SELECT count(*)::int FROM bern_hub.bern_quality_rule) AS rules,
        (SELECT count(*)::int FROM bern_hub.bern_field_classification) AS catalog,
        (SELECT count(*)::int FROM bern_hub._prisma_migrations WHERE finished_at IS NOT NULL) AS migrations
    `;
    if (counts?.sources !== 0 || counts.tenants !== 0)
      throw new Error("Unexpected operational records.");
    const report = `Bern Neon provisioning completed.\nDedicated schema: bern_hub\nMigrations applied: ${counts.migrations}\nAccounts verified: 5, with assigned roles and salted password hashes\nQuality rules: ${counts.rules}\nCatalog fields: ${counts.catalog}\nSource records: 0\nWarehouse tenants: 0\nFictional operational data was not seeded remotely.\nNo automated test suite targeted Neon.\n`;
    await writeFile(".local/neon-provisioning.txt", report);
    console.log(report.trim());
  }
} catch {
  console.error(
    "Neon setup did not complete. Inspect the sanitized .local/neon-migration.log; no automatic retry was made.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
