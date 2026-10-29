import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { config } from "dotenv";
import { randomBytes } from "node:crypto";

if (existsSync(".env")) {
  config({ path: ".env", quiet: true });
  let local = false;
  try {
    local = ["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    );
  } catch {
    /* Preserve an incomplete environment without exposing it. */
  }
  if (local && !existsSync(".local/local.env")) {
    await mkdir(".local", { recursive: true });
    await copyFile(".env", ".local/local.env");
  }
  console.info(
    "Existing .env preserved. Use the documented commands with its selected database.",
  );
} else {
  const databasePassword = randomBytes(24).toString("base64url");
  const password = randomBytes(18).toString("base64url");
  const url = `postgresql://bern_demo:${databasePassword}@127.0.0.1:54349/bern_local?connection_limit=4`;
  await mkdir(".local", { recursive: true });
  await writeFile(
    ".env",
    `DATABASE_URL=${url}\nDIRECT_URL=${url}\nPORT=4400\nWEB_ORIGIN=http://localhost:3400\nSEED_PASSWORD=${password}\n`,
    { flag: "wx" },
  );
  if (!existsSync(".local/local.env"))
    await copyFile(".env", ".local/local.env");
  await writeFile(
    ".local/development-access.txt",
    `PRIVATE local demonstration accounts. Do not upload.\n\nPassword: ${password}\n\nadmin@bern.demo — Property manager\nsteward@bern.demo — Data steward\nfinance@bern.demo — Finance\nfrontdesk@bern.demo — Front desk / Security\nviewer@bern.demo — Viewer\n\nThese accounts are created by the local seed only.\n`,
    { flag: "wx" },
  );
  console.info(
    "Generated local configuration and private .local/development-access.txt. No credentials were printed.",
  );
}
