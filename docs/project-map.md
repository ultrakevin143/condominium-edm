# Bern project map

## Implemented foundation

| Responsibility                                               | Location                                            |
| ------------------------------------------------------------ | --------------------------------------------------- |
| Prisma table definitions                                     | `backend/prisma/schema.prisma`                      |
| Initial database migration                                   | `backend/prisma/migrations/202610280001_initial/`   |
| Warehouse constraints and immutable audit trigger            | `backend/prisma/migrations/202610280002_integrity/` |
| Local seed entry point                                       | `backend/prisma/seed.ts`                            |
| Fictional sources, roles, rule definitions and field catalog | `backend/prisma/seed-data.ts`                       |
| Local setup / private credential generation                  | `backend/scripts/setup-local.ts`                    |
| Local persistent database                                    | `backend/scripts/local-postgres.ts`                 |
| Safe Windows PostgreSQL shutdown                             | `backend/scripts/postgres-runtime.ts`               |
| Local migration/seed guard                                   | `backend/scripts/database.ts`                       |
| Disposable test cluster                                      | `backend/scripts/integration-test.ts`               |
| Database target validation                                   | `backend/src/config/database-safety.ts`             |
| Salted password hashing                                      | `backend/src/shared/security.ts`                    |
| Unit and database checks                                     | `backend/tests/`                                    |

## Implemented pipeline and quality

| Responsibility                                                | Location                                              |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| Four source adapters                                          | `backend/src/modules/pipeline/adapters.ts`            |
| Name/unit/date matching and normalization                     | `backend/src/modules/pipeline/transform.ts`           |
| Pipeline transaction, staging and results                     | `backend/src/modules/pipeline/pipeline.service.ts`    |
| Canonical upserts and per-run field lineage                   | `backend/src/modules/pipeline/pipeline.repository.ts` |
| Data-driven rule engine                                       | `backend/src/modules/quality/engine.ts`               |
| Real score history                                            | `backend/src/modules/quality/quality.service.ts`      |
| Issue correction, acceptance, quarantine and freshness guards | `backend/src/modules/issues/`                         |
| Opaque session login                                          | `backend/src/modules/auth/`                           |
| Session and permission checks                                 | `backend/src/middleware/`                             |
| Express composition and startup                               | `backend/src/app.ts`, `backend/src/server.ts`         |
| Shared application Prisma client                              | `backend/src/database/client.ts`                      |

Routes validate requests, call services and return the API envelope. Services own transactions, check the current user and use Prisma. The source repositories and adapters keep source access in named functions. See [the pipeline/quality guide](pipeline-quality.md) for endpoints, limitations and issue semantics.

## Governed browser workspace

| Responsibility                                            | Location                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Landing page                                              | `frontend/app/page.tsx`                                                |
| Workspace routes                                          | `frontend/app/[section]/page.tsx`                                      |
| Layout and design tokens                                  | `frontend/app/layout.tsx`, `frontend/app/globals.css`                  |
| Session, sign-in and navigation                           | `frontend/src/app-shell/workspace.tsx`                                 |
| Pipeline, quality, issues, tenants and governance screens | `frontend/src/features/`                                               |
| Source-owned reusable UI controls                         | `frontend/src/shared/ui/`                                              |
| Typed API requests and contracts                          | `frontend/src/shared/api/`                                             |
| Loading/error/empty states and formatting                 | `frontend/src/shared/data-view.tsx`, `use-resource.ts`, `utils.ts`     |
| Tenant/unit queries and field protection                  | `backend/src/modules/warehouse/`                                       |
| Policies, role management, audit queries                  | `backend/src/modules/governance/`                                      |
| Browser flows and screen evidence                         | `frontend/tests/workspace.spec.ts`; ignored `.local/browser-evidence/` |

The request flow is screen → shared typed client → Next `/api` rewrite → Express session/permission middleware → validated handler → service → shared Prisma → PostgreSQL. Frontend assets belong in `frontend/public/` when needed. No database URL reaches the frontend bundle.

## Instructor acceptance

`npm run test:acceptance` selects a fresh acceptance scenario in `backend/scripts/integration-test.ts`. API assertions live in `backend/tests/acceptance.integration.test.ts`; the separate browser presentation flows live in `frontend/tests/acceptance.spec.ts`. The runner uses only its disposable local test database. See `docs/instructor-demo.md` for manual steps and `.local/acceptance-results.txt` for the generated API summary.

## Handoff

`docs/BERN-SETUP-GUIDE.txt` explains first-time Windows setup, daily commands, environment-file placement and troubleshooting. `docs/BERN-REVIEWER-BISAYA.txt` explains the real functions, role limits, request flow and presentation answers for a beginner. Private credentials stay in ignored `.local/development-access.txt` and are absent from the guides.

## Runtime database selection

`backend/src/config/environment.ts` chooses the root or preserved local environment; `database-safety.ts` enforces loopback test targets and explicit pinned Neon runtime settings. `backend/scripts/run-local.ts` implements local startup. `neon-provision.ts` performs fresh remote migration/access setup; `provisionAccess()` in `backend/prisma/seed-data.ts` batches account/catalog creation. `seed()` adds local fictional data, while `neon-demo.ts` performs the separately authorized, guarded one-time shared import. `neon-migrate.ts` applies reviewed pending SQL without seeding and compares account/operational summaries. See `docs/neon-runtime.md`.

## Account security

`/account` uses the existing `frontend/app/[section]/page.tsx` route entry. Forms live in `frontend/src/features/account/`: `account.screen.tsx` (own question/password), `recovery-form.tsx` (sign-in recovery), `admin-recovery.tsx` (Governance account controls), and `secret-field.tsx` (labelled secret inputs).

`backend/src/modules/auth/account-security.routes.ts` validates public versus authenticated routes; `.schemas.ts` validates payloads and `.service.ts` verifies credentials, changes hashes, revokes access and records audits. `backend/src/shared/account-lock.ts` serializes sensitive actions. Login and session middleware enforce credential versions. The schema extension is in `backend/prisma/migrations/20261028161557_account_security/`. API/concurrency tests are in `backend/tests/account-security.integration.test.ts`; `frontend/tests/account-security.spec.ts` supplies the separate `npm run test:security` browser flow. See `docs/account-security.md` for route names, limits and recovery boundaries.
