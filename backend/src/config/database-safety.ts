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

export function assertNeonConfiguration(env: Environment = process.env) {
  if (testing(env) || env.BERN_DATABASE_TARGET !== "neon")
    throw new Error(
      "Neon requires explicit runtime configuration; tests stay local.",
    );
  let pooled: URL, direct: URL;
  try {
    pooled = new URL(env.DATABASE_URL!);
    direct = new URL(env.DIRECT_URL!);
  } catch {
    throw new Error("Both private Neon connection URLs are required.");
  }
  const host = env.BERN_NEON_HOST;
  if (
    !host ||
    !/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.aws\.neon\.tech$/.test(host) ||
    host.split(".")[0]!.endsWith("-pooler")
  )
    throw new Error("Configure Bern's direct Neon endpoint pin.");
  const expectedPool = host.replace(".", "-pooler.");
  for (const url of [pooled, direct]) {
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
  }
  if (
    pooled.hostname !== expectedPool ||
    direct.hostname !== host ||
    pooled.pathname !== direct.pathname ||
    pooled.username !== direct.username ||
    pooled.password !== direct.password ||
    pooled.port !== direct.port
  )
    throw new Error(
      "Pooled and direct URLs must identify the same pinned Bern database.",
    );
  const limit = Number(pooled.searchParams.get("connection_limit"));
  if (!Number.isInteger(limit) || limit < 1 || limit > 4)
    throw new Error("Use a small explicit Neon connection limit (1 to 4).");
  return { pooled, direct };
}

export function assertRuntimeDatabase(env: Environment = process.env) {
  if (testing(env)) {
    const url = assertLocalDatabase(env.DATABASE_URL, true);
    assertLocalDatabase(env.DIRECT_URL, true);
    return url;
  }
  return env.BERN_DATABASE_TARGET === "neon"
    ? assertNeonConfiguration(env).pooled
    : assertLocalDatabase(env.DATABASE_URL);
}
