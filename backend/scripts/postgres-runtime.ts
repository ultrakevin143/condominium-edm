import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// The package uses taskkill on Windows, which can orphan an I/O worker that
// retains the listening socket. pg_ctl performs PostgreSQL's coordinated stop.
export function embeddedPostgres(
  options: ConstructorParameters<typeof EmbeddedPostgres>[0],
) {
  const pg = new EmbeddedPostgres(options);
  if (process.platform !== "win32") return pg;
  const require = createRequire(import.meta.url);
  const entry = require.resolve("@embedded-postgres/windows-x64");
  const executable = path.resolve(
    path.dirname(entry),
    "../native/bin/pg_ctl.exe",
  );
  const directory = path.resolve(options?.databaseDir ?? ".local/postgres");
  const allowedRoot = path.resolve(process.cwd(), ".local") + path.sep;
  if (!directory.startsWith(allowedRoot))
    throw new Error("Embedded database must stay inside .local.");
  let stopped = false;
  pg.stop = async () => {
    if (stopped) return;
    if (existsSync(path.join(directory, "postmaster.pid"))) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          executable,
          ["-D", directory, "-w", "-t", "15", "-m", "fast", "stop"],
          { stdio: "ignore", windowsHide: true },
        );
        child.on("error", reject);
        child.on("exit", (code) =>
          code === 0
            ? resolve()
            : reject(new Error("Local PostgreSQL did not stop cleanly.")),
        );
      });
    }
    stopped = true;
  };
  return pg;
}
