import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { assertLocalDatabase } from "../src/config/database-safety.js";
import { embeddedPostgres } from "./postgres-runtime.js";

// Never read .env or inherit runtime database URLs. This runner provisions its
// own loopback cluster and the bern_test database.
const require = createRequire(import.meta.url);
const acceptance = process.argv.includes("--acceptance");
const security = process.argv.includes("--security");
await mkdir(".local", { recursive: true });
const directory = await mkdtemp(path.resolve(".local/pg-test-"));
const testPassword = randomBytes(24).toString("base64url");
const testUrl = `postgresql://bern_test:${testPassword}@127.0.0.1:54350/bern_test?connection_limit=4&schema=bern_hub`;
assertLocalDatabase(testUrl, true);
const env = {
  ...process.env,
  NODE_ENV: "test",
  BERN_DATABASE_TARGET: "local",
  DATABASE_URL: testUrl,
  DIRECT_URL: testUrl,
  TEST_DATABASE_URL: testUrl,
  SEED_PASSWORD: randomBytes(18).toString("base64url"),
  BERN_ACCEPTANCE_TEST: acceptance ? "true" : "false",
  BERN_SECURITY_TEST: security ? "true" : "false",
  BERN_BROWSER_TEST:
    acceptance || security ? "true" : process.env.BERN_BROWSER_TEST,
};
const pg = embeddedPostgres({
  databaseDir: directory,
  user: "bern_test",
  password: testPassword,
  port: 54350,
  persistent: true,
  authMethod: "scram-sha-256",
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => console.error("Isolated test PostgreSQL startup error."),
});
function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Local verification failed.")),
    );
  });
}
// Validate the fixed cleanup target before starting the cluster.
const resolved = path.resolve(directory);
if (!resolved.startsWith(path.resolve(".local") + path.sep))
  throw new Error("Refusing cleanup outside .local.");
let started = false;
try {
  await pg.initialise();
  await pg.start();
  started = true;
  await pg.createDatabase("bern_test");
  await run([require.resolve("prisma/build/index.js"), "migrate", "deploy"]);
  await run([require.resolve("prisma/build/index.js"), "migrate", "deploy"]);
  const suites = security
    ? ["access", "account-security"]
    : acceptance
      ? ["access", "acceptance"]
      : ["access", "foundation", "pipeline", "governance", "account-security"];
  for (const suite of suites)
    await run([
      "--import",
      "tsx",
      "--test",
      `backend/tests/${suite}.integration.test.ts`,
    ]);
  if (env.BERN_BROWSER_TEST === "true")
    await run(["--import", "tsx", "backend/scripts/browser-test.ts"]);
} finally {
  if (started) await pg.stop();
  await rm(resolved, { recursive: true, force: true });
}
