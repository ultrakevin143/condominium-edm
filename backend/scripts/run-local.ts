import { spawn } from "node:child_process";
import { loadEnvironment } from "../src/config/environment.js";
import { assertLocalDatabase } from "../src/config/database-safety.js";
const file = loadEnvironment(true);
assertLocalDatabase(process.env.DATABASE_URL);
assertLocalDatabase(process.env.DIRECT_URL);
const command = process.argv[2];
if (!["dev", "start"].includes(command || "") || !process.env.npm_execpath)
  throw new Error("Use dev:local or start:local from npm.");
const child = spawn(
  process.execPath,
  [process.env.npm_execpath, "run", command!],
  {
    env: { ...process.env, BERN_ENV_FILE: file, BERN_DATABASE_TARGET: "local" },
    stdio: "inherit",
    windowsHide: true,
  },
);
child.on("error", () => {
  console.error("Local app could not start.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
