import { loadEnvironment } from "../src/config/environment.js";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { assertLocalDatabase } from "../src/config/database-safety.js";
import { embeddedPostgres } from "./postgres-runtime.js";

loadEnvironment(true);
const url = assertLocalDatabase(process.env.DATABASE_URL);
const databaseDir = path.resolve(".local/postgres");
await mkdir(databaseDir, { recursive: true });
const pg = embeddedPostgres({
  databaseDir,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
  authMethod: "scram-sha-256",
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => console.error("Local PostgreSQL reported a startup error."),
});
const name = url.pathname.slice(1);
if (!/^[a-z_][a-z0-9_]*$/.test(name))
  throw new Error("Invalid local database name.");
if (!existsSync(path.join(databaseDir, "PG_VERSION"))) await pg.initialise();
await pg.start();
try {
  const client = pg.getPgClient();
  await client.connect();
  try {
    const found = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    if (!found.rowCount) await pg.createDatabase(name);
  } finally {
    await client.end();
  }
} catch {
  await pg.stop();
  throw new Error("Local PostgreSQL initialization failed.");
}
console.info(
  `Local PostgreSQL ready on port ${url.port || 5432}. Leave this terminal open.`,
);
let stopping = false;
async function stop() {
  if (!stopping) {
    stopping = true;
    await pg.stop();
    process.exit(0);
  }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 60000);
