import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

export function loadEnvironment(local = false) {
  const root =
    path.basename(process.cwd()) === "backend"
      ? path.resolve("..")
      : process.cwd();
  const localFile = path.join(root, ".local/local.env");
  const file =
    local && existsSync(localFile)
      ? localFile
      : path.resolve(root, process.env.BERN_ENV_FILE || ".env");
  // Test runners supply both loopback URLs; never replace them from runtime files.
  if (
    process.env.NODE_ENV === "test" ||
    process.env.BERN_BROWSER_TEST === "true" ||
    process.env.BERN_ACCEPTANCE_TEST === "true"
  )
    return file;
  // Prisma can preload root .env during import. Explicit file selection must win.
  config({ path: file, quiet: true, override: true });
  return file;
}
