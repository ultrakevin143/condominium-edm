import { z } from "zod";
import { assertRuntimeDatabase } from "./config/database-safety.js";
import { loadEnvironment } from "./config/environment.js";
import { createApp } from "./app.js";
loadEnvironment();
assertRuntimeDatabase();
const { db } = await import("./database/client.js");
const port = z.coerce
  .number()
  .int()
  .min(1)
  .max(65535)
  .default(4400)
  .parse(process.env.PORT);
const origin = z
  .url()
  .default("http://localhost:3400")
  .parse(process.env.WEB_ORIGIN);
const server = createApp(db, origin).listen(port, "127.0.0.1", () =>
  console.info(`Bern API listening on http://127.0.0.1:${port}`),
);
async function stop() {
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
