# Phases 4 and 5: governed workspace

The browser application starts on port 3400 and the API on 4400. The landing entry is `frontend/app/page.tsx`. The `/pipeline`, `/tenants`, `/quality`, `/issues` and `/governance` URLs use `frontend/app/[section]/page.tsx`. Pipeline is the default for roles with quality access; Front desk/Security opens the permitted tenant workspace instead.

## Features

- Pipeline: actual history, trigger, per-source stages and row counts, quarantine and deduplication counts.
- Quality: per-rule counts and scores, actual run history, comparison and snapshot inspection. There is no fabricated chart history.
- Issues: rule/severity/status filters, protected source inspection and labelled correction fields. Fix, accept and quarantine require a reason; correction runs the pipeline and verifies the selected rule.
- Tenants and units: search, pagination and tenant detail. Lease, financial, maintenance and visitor sections apply server access rules. Field provenance records the run and source. The page explains that retained older values are not automatically revalidated by a later failed input.
- Governance: field catalog with owner, classification, source and policy; readable policy and role permissions; administrator policy editor and account-role changes; filtered append-only audit history.

## Access

| Role                     | Main capabilities                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Property manager / Admin | All views, pipeline, issues, amounts, visitors, policies, roles and audit                                    |
| Data steward             | Pipeline, quality and eligible issues; catalog and policy read; no financial amount edits or visitor records |
| Finance                  | Tenant views and dues amounts; quality read; no visitor entries, issue mutation or governance administration |
| Front desk / Security    | Tenant views and visitor entries; no dues amounts, pipeline or quality administration                        |
| Viewer                   | Tenant/unit views, quality read and catalog; tenant contacts are masked; no amounts or visitor entries       |

The API omits forbidden values. UI hiding is only an aid. Every tenant/detail request is processed using current database role permissions. Confidential or restricted reads create audit records before a response is sent. Policy changes require the original text and a reason to prevent stale overwrites. Role changes revoke the affected account's sessions; self-role changes and removal of the last active administrator are rejected.

Policy prose documents responsibilities; editing it does not automatically grant permissions. Field classifications are catalog metadata used by the server. There is no classification editor in this release. Authentication and rate limits are local demonstration controls, not SSO or an enterprise identity service.

## Added API routes

All paths below are Express paths; the browser uses the Next.js `/api` prefix. Responses keep the shared `data` or `error` envelope.

| Method and path                                     | Purpose                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /warehouse/tenants`, `GET /warehouse/units`    | Search and paginate allowed warehouse records                                      |
| `GET /warehouse/tenants/:id`                        | Tenant detail, permitted related records and field lineage                         |
| `GET /governance/catalog`                           | Field owner, classification, source and policy                                     |
| `GET /governance/roles`, `GET /governance/policies` | Read role permissions and policy text                                              |
| `PATCH /governance/policies/:id`                    | Administrator policy edit with expected description and reason                     |
| `GET /governance/users`                             | Administrator account-role list without authentication secrets                     |
| `PATCH /governance/users/:id/role`                  | Administrator role change with session revocation                                  |
| `GET /governance/audit`                             | Administrator audit search and pagination; reading audit details is itself audited |

Warehouse routes require `tenants:read`. Governance route handlers additionally enforce the relevant `governance:read`, `governance:manage` or `audit:read` permission. Policies and account-role changes recheck authorization inside their transaction.

## Local operation

Run `npm ci`, `npm run setup:local`, and `npm run db:generate` from the root for a fresh local setup. Keep `npm run db:local` open. In another root terminal run `npm run db:migrate`, `npm run db:seed`, then `npm run dev:local`. Open `http://localhost:3400`. Private demo passwords remain in ignored `.local/development-access.txt`. Never put those values in screenshots or Git. Ordinary `dev`/`start` selects the root runtime environment; see [Neon operation](neon-runtime.md) for the shared fictional import, preserved accounts and startup boundaries.

`npm run build` builds the API and Next.js app. `npm start` starts both production-mode builds on loopback. The root `.env` serves both workspaces; no database credentials are sent to the browser. For tests the Next rewrite can select a different local API with the server-only `BERN_API_ORIGIN` variable.

## Verification

`npm run test:integration` provisions a disposable local PostgreSQL cluster for foundation, ETL, issue and governance tests. `npm run test:browser` runs the same isolated setup and starts a dedicated test API/web pair on ports 4450/3450. It checks pipeline execution, issue correction and role-dependent fields, and captures layouts at 360, 768 and 1280px. Install its browser once with `npx playwright install chromium`. No test uses Neon or the regular local demonstration database.

The shared UI controls are readable source components using shadcn/ui conventions, Radix Slot/Tabs, Tailwind and class-variance-authority. Shared navigation, API clients and data states stay separate from feature screens. All data is fictional and API-backed.
