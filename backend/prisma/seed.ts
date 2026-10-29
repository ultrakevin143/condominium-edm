import { PrismaClient } from "@prisma/client";
import { assertLocalDatabase } from "../src/config/database-safety.js";
import { seed } from "./seed-data.js";
import { loadEnvironment } from "../src/config/environment.js";

loadEnvironment(true);
assertLocalDatabase(process.env.DATABASE_URL);
assertLocalDatabase(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
if (process.env.NODE_ENV === "production")
  throw new Error("Demo seeding is disabled in production.");
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 12)
  throw new Error("Set a private seed password of at least 12 characters.");
const db = new PrismaClient();
try {
  await seed(db, password);
  console.info(
    "Fictional condo sources and demo accounts seeded. Warehouse is still empty until the pipeline runs.",
  );
} catch {
  console.error("Local seed failed. No credentials were logged.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
