# Phases 2 and 3: pipeline and quality

The four adapters read the separate simulated tenancy, billing, maintenance and visitor tables. Every extracted row is saved with its source and run. Format normalization supports explicit ISO dates and day/month/year slash dates, unit spelling variations, whitespace and case changes. Tenant IDs take precedence. Fallback matching needs an unambiguous compatible name in the same unit; conflicting initials or tenant/unit associations are rejected.

The run automatically evaluates enabled database rule definitions through a shared engine. Rule parameters carry the day thresholds; saved results retain the definition that was used. All 13 rules have clean/defect unit coverage. Scores use observed checks rather than averaging percentages. Zero observations is unavailable, and no history is fabricated.

Canonical source data is upserted with stable IDs. Exact duplicates are recorded as deduplicated and their issue can be automatically resolved. Unknown or invalid inputs are staged with quarantine reasons. No source row is silently dropped. `extracted = loaded + quarantined + deduplicated` counts source rows; it is not a count of warehouse entities.

Field lineage is saved separately for each run. A tenant name credits the tenancy row that supplied the value; matching billing or visitor evidence is not misrepresented as its source. Unit lineage can show all four normalized inputs. The load calculates and saves balances, completed overdue months and open-request days using that run's reporting time. The tenant detail screen displays permitted financial/maintenance values alongside provenance and reporting context.

## Preserving accepted data

Missing, rejected or manually quarantined source rows do not automatically delete previously accepted warehouse records. Quarantine stops future loading from that row, while the current warehouse may retain the earlier valid value. An empty source is reported in its extraction log and the run is PARTIAL. Tenant browsing shows the record's last successful lineage and explains that retained data is not automatically revalidated by a later failed input. Automatic deletion/archival is outside this demonstration's scope.

Conflicting active leases are quarantined. The database rejects a second active lease rather than silently replacing an accepted one. A full lease transfer/termination workflow is outside this EDM demonstration; resolving conflicting source data does not authorize silently deleting the prior warehouse lease.

## Issue actions

An administrator or data steward can inspect eligible issues and submit a reason of at least ten characters:

- `fix`: update allowed source fields and rerun the whole pipeline in the same transaction. The selected rule must pass for that source row before the issue is resolved. If it still fails, changes are rolled back. Other newly observed issues remain visible in the new run.
- `accept`: acknowledge the risk without changing source values or historical scores.
- `quarantine`: exclude the row from future loads and rerun checks. Earlier accepted warehouse values are preserved.

Every action requires the issue's current `expectedUpdatedAt`, the latest completed run and an unchanged source snapshot. Older issues remain historical evidence. Financial amount corrections/quarantine require financial access; visitor issues require visitor access and are hidden from stewards who lack it. Authorized classified issue reads are audited. There are no public endpoints for raw staging rows.

## API

All successful responses use `{ data: ... }`; failures use `{ error: { code, message } }`. Requests, queries and parameters are validated with Zod. Mutating browser requests must send the configured exact Origin.

| Method | Path                 | Purpose / access                                                                                |
| ------ | -------------------- | ----------------------------------------------------------------------------------------------- |
| POST   | `/auth/login`        | Sign in with email/password; HTTP-only session cookie                                           |
| GET    | `/auth/me`           | Current active session and permissions                                                          |
| POST   | `/auth/logout`       | Revoke current session                                                                          |
| POST   | `/pipeline/runs`     | Run ETL and DQM; `pipeline:run`; empty body `{}`                                                |
| GET    | `/pipeline/runs`     | Paginated history; `quality:read`                                                               |
| GET    | `/pipeline/runs/:id` | Counts and source/stage logs; `quality:read`                                                    |
| GET    | `/quality/rules`     | Rule definitions; `quality:read`                                                                |
| GET    | `/quality/history`   | Last 12 completed snapshots, scores and changes; `quality:read`                                 |
| GET    | `/issues`            | Paginated queue; `quality:manage`; filters: `runId`, `rule`, `severity`, `status`               |
| GET    | `/issues/:id`        | Issue details with protected source values; `quality:manage`                                    |
| PATCH  | `/issues/:id`        | `{ action, note, expectedUpdatedAt, correction? }`; permission checked again in the transaction |

`page` starts at 1 and `limit` is 1–100. Issue listing defaults to the latest completed run. IDs are UUIDs. Status filters are `OPEN`, `RESOLVED`, `QUARANTINED` and `ACCEPTED`; severity is `warning` or `error`.

## Running the implemented platform

From the root, complete the local setup in README and leave `npm run db:local` running. Run `npm run db:migrate` and `npm run db:seed` to add local fixtures without changing existing account passwords. Then use `npm run dev:local` to start the local frontend/API. The private account note is `.local/development-access.txt`. Ordinary `dev`/`start` uses the configured Neon runtime, which now contains the separately authorized shared fictional import and initialization run. Do not repeat remote provisioning/imports for ordinary startup. There is no automated source scheduler.

The synchronous demo is limited to 500 source rows per run. Staging, issues and lineage writes are batched, but canonical upserts still need database calls. No remote throughput or production capacity is claimed. Rate limits are process-local; login/pipeline requests are bounded. A failed pipeline rolls back its warehouse writes and records a sanitized failed run and audit event. Concurrent pipelines/corrections are rejected with a conflict.

Tenant/finance/visitor browsing, governance screens, Neon runtime provisioning and the authorized shared demo import are implemented. Local automated tests cover the pipeline, issue actions, field masking, audit immutability and browser flows; bounded remote runtime checks are recorded separately in `docs/verification.md`. Automated suites never target Neon. Distributed rate limiting, live external adapters and production capacity validation remain outside scope.
