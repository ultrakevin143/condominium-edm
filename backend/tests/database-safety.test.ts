import test from "node:test";
import assert from "node:assert/strict";
import {
  assertLocalDatabase,
  assertRuntimeDatabase,
  assertNeonConfiguration,
} from "../src/config/database-safety.js";

test("test database guard accepts a dedicated loopback database", () => {
  assert.equal(
    assertLocalDatabase("postgresql://runner@127.0.0.1:54350/bern_test", true)
      .hostname,
    "127.0.0.1",
  );
});

// Synthetic endpoint and password, never connected to by these unit tests.
const neon = {
  BERN_DATABASE_TARGET: "neon",
  BERN_NEON_HOST: "ep-fixture-one.us-east-2.aws.neon.tech",
  DATABASE_URL:
    "postgresql://fixture:not-a-real-secret@ep-fixture-one-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&schema=bern_hub&connection_limit=2",
  DIRECT_URL:
    "postgresql://fixture:not-a-real-secret@ep-fixture-one.us-east-2.aws.neon.tech/neondb?sslmode=require&schema=bern_hub&connection_limit=1",
};

test("runtime accepts explicit matching Neon endpoints but defaults to local", () => {
  assert.equal(
    assertRuntimeDatabase(neon).searchParams.get("schema"),
    "bern_hub",
  );
  assert.equal(
    assertRuntimeDatabase({
      DATABASE_URL: "postgresql://fixture@127.0.0.1/bern_local",
    }).hostname,
    "127.0.0.1",
  );
  assert.throws(() =>
    assertRuntimeDatabase({ ...neon, BERN_DATABASE_TARGET: undefined }),
  );
});

test("Neon runtime rejects wrong targets, missing TLS/schema and oversized pools", () => {
  for (const env of [
    { ...neon, BERN_NEON_HOST: "ep-other.us-east-2.aws.neon.tech" },
    { ...neon, DIRECT_URL: neon.DATABASE_URL },
    { ...neon, DIRECT_URL: neon.DIRECT_URL.replace("neondb?", "different?") },
    {
      ...neon,
      DIRECT_URL: neon.DIRECT_URL.replace("not-a-real-secret", "different"),
    },
    {
      ...neon,
      DATABASE_URL: neon.DATABASE_URL.replace(
        "sslmode=require",
        "sslmode=disable",
      ),
    },
    {
      ...neon,
      DATABASE_URL: neon.DATABASE_URL.replace(
        "schema=bern_hub",
        "schema=public",
      ),
    },
    {
      ...neon,
      DATABASE_URL: neon.DATABASE_URL.replace(
        "connection_limit=2",
        "connection_limit=100",
      ),
    },
  ])
    assert.throws(() => assertNeonConfiguration(env));
});

test("test contexts cannot opt into Neon and require local URLs on both connections", () => {
  for (const flags of [
    { NODE_ENV: "test" },
    { BERN_BROWSER_TEST: "true" },
    { BERN_ACCEPTANCE_TEST: "true" },
  ]) {
    assert.throws(() => assertRuntimeDatabase({ ...neon, ...flags }));
    assert.throws(() => assertNeonConfiguration({ ...neon, ...flags }));
    const local = {
      ...neon,
      ...flags,
      DATABASE_URL: "postgresql://fixture@127.0.0.1/bern_test",
      DIRECT_URL: "postgresql://fixture@127.0.0.1/bern_test",
    };
    assert.equal(assertRuntimeDatabase(local).hostname, "127.0.0.1");
    assert.throws(() =>
      assertRuntimeDatabase({ ...local, DIRECT_URL: neon.DIRECT_URL }),
    );
  }
});

test("invalid connection errors never include the supplied value", () => {
  const sentinel = "private-value-that-must-not-appear";
  assert.throws(
    () => assertLocalDatabase(sentinel),
    (error) => error instanceof Error && !error.message.includes(sentinel),
  );
});
test("test database guard rejects remote and ordinary runtime targets", () => {
  for (const value of [
    undefined,
    "postgresql://runner@example.test/bern_test",
    "postgresql://runner@127.0.0.1/bern_local",
    "http://localhost/bern_test",
  ]) {
    assert.throws(() => assertLocalDatabase(value, true));
  }
});
