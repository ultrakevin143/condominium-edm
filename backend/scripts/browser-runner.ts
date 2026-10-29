import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  ["--import", "tsx", "backend/scripts/integration-test.ts"],
  {
    env: { ...process.env, BERN_BROWSER_TEST: "true" },
    stdio: "inherit",
    windowsHide: true,
  },
);
child.on("error", () => {
  console.error("Could not start isolated browser verification.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
