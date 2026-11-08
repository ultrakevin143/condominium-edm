export function assertLocalDatabase(
  value: string | undefined,
  testOnly = false,
) {
  if (!value) throw new Error("A local PostgreSQL connection is required.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The database connection configuration is invalid.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
  )
    throw new Error("This operation only supports loopback PostgreSQL.");
  if (testOnly && !/^\/bern_test(?:_[a-z0-9]+)?$/.test(url.pathname)) {
    throw new Error("Tests require a dedicated bern_test database.");
  }
  return url;
}

type Environment = Record<string, string | undefined>;
const testing = (env: Environment) =>
  env.NODE_ENV === "test" ||
  env.BERN_BROWSER_TEST === "true" ||
  env.BERN_ACCEPTANCE_TEST === "true";

function assertTargetAndHost(env: Environment) {
  if (testing(env) || env.BERN_DATABASE_TARGET !== "neon")
    throw new Error(
      "Neon requires explicit endpoint configuration; tests stay local.",
    );
  const host = env.BERN_NEON_HOST;
  if (
    !host ||
    !/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.aws\.neon\.tech$/.test(host) ||
    host.split(".")[0]!.endsWith("-pooler")
  )
    throw new Error("Configure Bern's direct Neon endpoint pin.");
  return host;
}

function readNeonUrl(value: string | undefined) {
  let url: URL;
  try {
    url = new URL(value!);
  } catch {
    throw new Error("A private Neon database URL is required.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["require", "verify-ca", "verify-full"].includes(
      url.searchParams.get("sslmode") || "",
    ) ||
    url.searchParams.get("schema") !== "bern_hub" ||
    !url.username ||
    !url.password
  )
    throw new Error(
      "Neon requires TLS, private credentials and Bern's dedicated schema.",
    );
  return url;
}

function assertPoolLimit(pooled: URL) {
  const limit = Number(pooled.searchParams.get("connection_limit"));
  if (!Number.isInteger(limit) || limit < 1 || limit > 4)
    throw new Error("Use a small explicit Neon connection limit (1 to 4).");
}

export function assertNeonRuntimeConfiguration(env: Environment = process.env) {
  const host = assertTargetAndHost(env);
  const pooled = readNeonUrl(env.DATABASE_URL);
  if (pooled.hostname !== host.replace(".", "-pooler."))
    throw new Error(
      "The pooled URL does not match Bern's pinned Neon endpoint.",
    );
  assertPoolLimit(pooled);
  return pooled;
}

export function assertNeonConfiguration(env: Environment = process.env) {
  const host = assertTargetAndHost(env);
  const pooled = assertNeonRuntimeConfiguration(env);
  const direct = readNeonUrl(env.DIRECT_URL);
  if (
    direct.hostname !== host ||
    pooled.pathname !== direct.pathname ||
    pooled.port !== direct.port
  )
    throw new Error(
      "Pooled and direct URLs must identify the same pinned Bern database; credentials may differ.",
    );
  return { pooled, direct };
}

export function assertRuntimeDatabase(env: Environment = process.env) {
  if (testing(env)) {
    const url = assertLocalDatabase(env.DATABASE_URL, true);
    assertLocalDatabase(env.DIRECT_URL, true);
    return url;
  }
  if (env.BERN_DATABASE_TARGET === "neon") {
    const pooled = assertNeonRuntimeConfiguration(env);
    if (env === process.env) delete process.env.DIRECT_URL;
    return pooled;
  }
  return assertLocalDatabase(env.DATABASE_URL);
}
