import { loadEnvironment } from "../src/config/environment.js";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { assertLocalDatabase } from "../src/config/database-safety.js";

loadEnvironment(true);
const require = createRequire(import.meta.url);
// Ordinary database commands remain local even when the app runs on Neon.
assertLocalDatabase(process.env.DATABASE_URL);
assertLocalDatabase(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const command = process.argv[2];
if (!["migrate", "seed", "dev"].includes(command ?? ""))
  throw new Error("Use db:migrate or db:seed.");
const args =
  command === "dev"
    ? ["migrate", "dev", ...process.argv.slice(3)]
    : command === "migrate"
      ? ["migrate", "deploy"]
      : ["db", "seed"];
const child = spawn(
  process.execPath,
  [require.resolve("prisma/build/index.js"), ...args],
  { stdio: "inherit", env: process.env, windowsHide: true },
);
child.on("error", () => {
  console.error("Database command could not start.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
