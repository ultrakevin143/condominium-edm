import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { open } from "node:fs/promises";
import { assertLocalDatabase } from "../src/config/database-safety.js";
assertLocalDatabase(process.env.DATABASE_URL, true);
if (process.env.BERN_BROWSER_TEST !== "true")
  throw new Error("Browser verification needs its isolated runner.");
const require = createRequire(import.meta.url),
  log = await open(".local/browser-runtime.log", "w");
const env = {
  ...process.env,
  PORT: "4450",
  WEB_ORIGIN: "http://localhost:3450",
  BERN_API_ORIGIN: "http://127.0.0.1:4450",
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_ENV: "development",
};
const children: ChildProcess[] = [];
function launch(args: string[], cwd = process.cwd()) {
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: ["ignore", log.fd, log.fd],
    windowsHide: true,
  });
  children.push(child);
  return child;
}
async function ready(url: string) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // The local server can refuse connections while it starts.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    "Local browser server did not become ready. Inspect .local/browser-runtime.log.",
  );
}
try {
  launch(["--import", "tsx", "backend/src/server.ts"]);
  await ready("http://127.0.0.1:4450/health");
  launch(
    [
      require.resolve("next/dist/bin/next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3450",
    ],
    `${process.cwd()}/frontend`,
  );
  await ready("http://localhost:3450/pipeline");
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        require.resolve("@playwright/test/cli"),
        "test",
        process.env.BERN_SECURITY_TEST === "true"
          ? "frontend/tests/account-security.spec.ts"
          : process.env.BERN_ACCEPTANCE_TEST === "true"
            ? "frontend/tests/acceptance.spec.ts"
            : "frontend/tests/workspace.spec.ts",
      ],
      { env, stdio: "inherit", windowsHide: true },
    );
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = code;
} finally {
  for (const child of children.reverse()) {
    if (child.pid && process.platform === "win32")
      await new Promise<void>((resolve) => {
        const stop = spawn(
          "taskkill",
          ["/pid", String(child.pid), "/t", "/f"],
          { stdio: "ignore", windowsHide: true },
        );
        stop.on("exit", () => resolve());
      });
    else child.kill("SIGTERM");
  }
  await log.close();
}
