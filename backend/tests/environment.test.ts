import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { loadEnvironment } from "../src/config/environment.js";

test("explicit runtime files replace preloaded values while test URLs stay isolated", async () => {
  await mkdir(".local", { recursive: true });
  const directory = await mkdtemp(path.resolve(".local/env-test-"));
  assert.ok(directory.startsWith(path.resolve(".local") + path.sep));
  const keys = [
    "BERN_ENV_FILE",
    "DATABASE_URL",
    "DIRECT_URL",
    "NODE_ENV",
    "BERN_BROWSER_TEST",
    "BERN_ACCEPTANCE_TEST",
  ];
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  const file = path.join(directory, "fixture.env");
  const fixture = "postgresql://fixture@127.0.0.1/bern_local";
  try {
    await writeFile(file, `DATABASE_URL=${fixture}\nDIRECT_URL=${fixture}\n`);
    process.env.BERN_ENV_FILE = file;
    process.env.NODE_ENV = "development";
    process.env.BERN_BROWSER_TEST = "false";
    process.env.BERN_ACCEPTANCE_TEST = "false";
    process.env.DATABASE_URL = "preloaded-value";
    loadEnvironment();
    assert.equal(process.env.DATABASE_URL, fixture);
    const localTest = "postgresql://fixture@127.0.0.1/bern_test";
    for (const flag of [
      "NODE_ENV",
      "BERN_BROWSER_TEST",
      "BERN_ACCEPTANCE_TEST",
    ]) {
      process.env.NODE_ENV = "development";
      process.env.BERN_BROWSER_TEST = "false";
      process.env.BERN_ACCEPTANCE_TEST = "false";
      process.env[flag] = flag === "NODE_ENV" ? "test" : "true";
      process.env.DATABASE_URL = localTest;
      process.env.DIRECT_URL = localTest;
      loadEnvironment();
      loadEnvironment(true);
      assert.equal(process.env.DATABASE_URL, localTest);
      assert.equal(process.env.DIRECT_URL, localTest);
    }
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    await rm(directory, { recursive: true, force: true });
  }
});
