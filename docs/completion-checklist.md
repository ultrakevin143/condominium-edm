# Bern completion checklist

Checked against `docs/brief.md` on 29 October 2026. The six development phases and the subsequently requested shared Neon demonstration and account-security extension are implemented. This is the requested classroom EDM platform; it is not a production condominium/payment service.

| Requirement                                      | Implementation                                                                                                                                         | Verification evidence                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Four separate messy source systems               | Tenancy, billing, maintenance and visitor adapters; 237 fictional rows, 30 tenant identities and six months of dues                                    | Access/foundation tests; acceptance row reconciliation                                           |
| Staging, ETL and unified warehouse               | Run-tagged raw staging; normalization/matching; canonical upserts; counts and stage logs; explicit quarantine                                          | Transform/pipeline unit and integration tests; instructor acceptance                             |
| Maria's four sources merge                       | ID-first matching and unambiguous name/unit fallback; one Maria in unit 12-A; source-specific field lineage                                            | Acceptance API assertions and Admin/Finance/Viewer browser walkthrough                           |
| Real DQM rules, scores and history               | 13 database rule definitions covering five dimensions; saved observations, weighted actual scores and prior-run comparison                             | Unit tests for every rule; pipeline/acceptance assertions                                        |
| At least six fixable defects                     | Source correction, verified rerun, accept/quarantine with notes, stale-source guards and audit records                                                 | Acceptance corrects email, contact, missing date, invalid date, unit format and negative payment |
| Backend governance                               | Five roles; session and permission middleware; financial/visitor omission and Viewer contact masking                                                   | Governance and acceptance API tests; role-difference browser flows                               |
| Ownership, classification and append-only audit  | Catalog with owner/source/policy; audited edits/runs/classified reads; database audit mutation guards                                                  | Foundation/governance/acceptance assertions and filtered audit browser flow                      |
| Required screens and real API data               | Pipeline, tenants/units and lineage, quality, issues, governance; explicit loading/error/empty states                                                  | Four core Chromium flows and two instructor acceptance flows; responsive/Axe evidence            |
| Separate frontend/backend and safe configuration | Next route entries in `frontend/app`, feature screens in `frontend/src/features`, Express modules in `backend/src/modules`; private root configuration | Project map; successful lint/types/build; configured-secret scan                                 |
| Neon shared demonstration                        | Pinned pooled/direct configuration, dedicated schema, five role accounts, one authorized import and initialization run                                 | Private provisioning/import reports and bounded runtime checks; no automated remote suites       |
| Password changes and administrator recovery      | Own hashed question/answer, password proof, session revocation; verified administrator assistance and hashed single-use expiring codes                 | Account-security API/concurrency tests and dedicated Chromium flow                               |
| Beginner handoff                                 | Separate setup guide, Bisaya code/role reviewer, instructor walkthrough and private account note                                                       | Guides cross-checked with actual modules, routes and scripts                                     |

The shared initialization produced 237 extracted, 206 loaded, 30 quarantined and one deduplicated source row, with a 92.18% actual quality score. These counts describe source dispositions, not the number of unified tenants. Local acceptance demonstrates six corrections and improved quality without changing the shared database.

## Verification commands

Run from the root. Database/browser suites must run sequentially because they share isolated test ports:

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:browser
npm run test:security
npm run test:acceptance
npm run build
```

The latest implementation passed lint, both TypeScript checks, 32 unit tests, 41 reported normal database/API tests, four core browser flows and the additional account-security browser flow. The final instructor acceptance rerun also passed its three access and ten acceptance API/database checks (including parent groups) and both presentation browser flows. Detailed results and dated evidence are in `docs/verification.md`. Do not rerun unchanged checks simply to generate more results; all automated database work uses disposable loopback PostgreSQL.

## Deliberate boundaries

Sources are seeded simulations; live external adapters, SSO, uploads, payment processing and ML were excluded by the brief. Recovery codes are delivered manually; automatic email/SMS and independent MFA are not implemented. A security question is a supplementary knowledge check. A sole administrator who loses all proof needs trusted-owner assistance.

The application preserves previously accepted warehouse records when later source input is missing or quarantined. Lease transfer/termination and automatic warehouse deletion are not part of this mini EDM. Classification metadata and permission definitions are not arbitrary UI-editable grants. The append-only database guard can still be disabled by a database owner.

Production hosting/publication, restricted database runtime credentials, shared multi-server rate limits and capacity testing require a separate deployment scope. The educational database-owner connection stays private. No Git publication or deployment has been performed. Manual screen-reader and non-Chromium testing remain unverified; automated accessibility checks do not certify full compliance.
