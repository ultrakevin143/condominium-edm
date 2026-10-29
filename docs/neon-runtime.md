# Neon runtime

Bern uses its explicitly configured Neon database for ordinary application traffic. Automated suites remain local. After initial empty-table provisioning, the user authorized one fictional shared demo import and the account-security extension. No historical migration was edited.

## Private configuration

Keep `.env` at the project root, beside `frontend/` and `backend/`. Its private values include `DATABASE_URL` (pooled), `DIRECT_URL` (direct), `BERN_DATABASE_TARGET=neon`, and `BERN_NEON_HOST` (the direct endpoint hostname). Both URLs must use the same database/credentials, TLS and `schema=bern_hub`. The configured runtime connection limit is two; direct provisioning uses one connection. `.env.example` contains names and empty values only.

The separate schema keeps Bern tables and its `_prisma_migrations` history away from other projects. Table names still use the existing `bern_` prefix. Schema selection comes from the private URLs, so local tests can exercise the same schema without a remote connection.

The current project uses Prisma 6.19.3 with its existing PostgreSQL connector. The pooled/direct split follows [Neon's connection guidance](https://neon.com/docs/guides/prisma) and [Prisma's Neon documentation](https://docs.prisma.io/docs/orm/v6/overview/databases/neon); no driver or major-version upgrade was needed.

## Running the app

`npm run dev` starts the frontend and API using the configured runtime database. For a built local server, use `npm run build` and `npm start`. The browser remains `http://localhost:3400`; database secrets stay on the API side.

The preserved local configuration is ignored `.local/local.env`. Keep its database running with `npm run db:local`, then use `npm run dev:local` or `npm run start:local` for the local fictional demonstration. Both modes use the same web/API ports, so run one mode at a time.

Ordinary `db:migrate`, `db:seed` and `db:author` deliberately select the local configuration and reject remote targets. They are not remote maintenance commands. `setup:local` preserves existing configuration; on a fresh local setup it also saves the local copy.

## One-time provisioning

`npm run db:neon:provision` is a deliberate fresh-database setup command. It validates the endpoint pin and TLS, checks for existing Bern objects, deploys migrations, and creates access/catalog metadata in a transaction. It refuses to run against an already populated Bern schema. Initial provisioning used the five migrations available then; account security adds a sixth migration through the separate maintenance command below.

It creates five demonstration accounts using the private account-note password, their roles, 13 rule definitions, ownership/policy/catalog entries and a provisioning audit record. Provisioning itself does not load operational sources. The later authorized import below populated the shared demonstration.

The explicit `--verify-only` provisioning recovery option reads initial account/metadata state without rerunning migrations. It was used once after fixing schema qualification in the initial summary query. Its initial-empty-table/bootstrap-password checks no longer describe a populated demonstration after users change passwords; do not use it as ongoing health monitoring. Raw administrative SQL names `bern_hub` explicitly; Prisma model queries apply the configured schema themselves.

The command saves a sanitized migration log and provisioning summary under ignored `.local/`. It never prints connection URLs or passwords. Existing unrelated data is not cleared or copied. Account provisioning uses batched inserts and preserves existing values when reused by local seeding.

## Shared fictional demo and later migrations

`npm run db:neon:demo` performed the explicitly authorized one-time import: 32 tenancy, 181 billing, 12 maintenance and 12 visitor rows. It preserves accounts and catalog metadata, requires empty source/warehouse tables and refuses a prior import audit marker. It then runs one real initialization pipeline. The recorded result was PARTIAL: 237 extracted, 206 loaded, 30 quarantined, one duplicate removed, 92.18% quality and 12 failing rule types. These are fictional Filipino resident examples, not real tenancy or financial records. Do not repeat this command on the shared database.

`npm run db:neon:migrate` is deliberate maintenance after reviewing pending SQL and verifying it locally. It deploys pending migrations without seeding or triggering a pipeline, saves sanitized private evidence, and compares existing account hashes/roles/active flags plus source/tenant/run counts before and after. The account-security migration only adds user/session versioning, question/answer-hash fields and the recovery-code table. Existing passwords and operational records are preserved. Do not run it automatically at startup or as a status poll.

Use Account security to set a question before changing a password. Administrators also need their own configured question before using Governance → Account roles → Manage recovery. Codes are handed over privately after identity verification; no automatic email service is configured. Changing a shared demo account's password changes it for every classmate using that account, and its original private account note becomes outdated. See [the account guide](account-security.md).

## Verification boundaries

Unit tests use synthetic endpoint strings only. Integration/browser/acceptance runners force both connection URLs to an isolated loopback `bern_test` database with schema `bern_hub`. The runtime guard rejects remote URLs whenever a test flag is present, even if remote runtime configuration was inherited. Browser screens have explicit loading; there are no polling or retry loops.

Remote work is limited to authorized provisioning, the single shared import/initialization, the additive auth migration and bounded runtime smoke checks. Automated suites never target Neon. Do not run test loops, repeated migration status checks, repeat fixture imports or unattended pipeline calls against the remote database.

For a classmate's laptop, share configuration and assigned account details privately. They install dependencies with `npm ci`, generate Prisma with `npm run db:generate`, place the private `.env` at the project root and run `npm run dev`. They do not need a local PostgreSQL server merely to use the Neon runtime, and they must not run provisioning again.

The supplied database owner connection is for this educational setup. Application roles govern API access; possession of database-owner credentials also permits direct database operations. A deployed production service needs a separate restricted runtime identity and server-hosted secrets. No Git publication or deployment is part of this setup.
