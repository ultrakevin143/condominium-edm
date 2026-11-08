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

export function loadMigrationEnvironment() {
  const root =
    path.basename(process.cwd()) === "backend"
      ? path.resolve("..")
      : process.cwd();
  const file = path.join(root, ".local/neon-migration.env");
  if (!existsSync(file))
    throw new Error(
      "Create the ignored .local/neon-migration.env with Bern's direct migration credential.",
    );
  delete process.env.DIRECT_URL;
  const result = config({ path: file, quiet: true, override: true });
  if (result.error)
    throw new Error("Could not load Bern's private migration environment.");
  if (!process.env.DIRECT_URL)
    throw new Error("The private migration environment must define DIRECT_URL.");
  return file;
}
