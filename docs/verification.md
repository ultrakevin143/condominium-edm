# Phase 1 verification — 28 October 2026

## Completed

- Prisma Client generation and TypeScript checks passed.
- Lint passed with zero warnings.
- Two local-target safety unit tests passed.
- The disposable local PostgreSQL suite passed eight reported tests (seven subtests and their parent), including seeded roles/password hashes, source examples, empty warehouse, catalog coverage, idempotent seed, warehouse constraints and immutable audit.
- Both migrations applied successfully to a fresh `bern_test` database on loopback port 54350. A second deployment reported no pending migrations.
- TypeScript compilation passed. This is a foundation/tooling build; no Next.js frontend is implemented yet.
- Dependency installation reported zero known vulnerabilities at that time.
- A clean `npm ci`, Prisma generation and TypeScript check also passed in the independent Desktop Bern folder. Its own generated local configuration started PostgreSQL on port 54349, and the documented migration/seed commands completed against `bern_local`.

The test database was shut down and its temporary directory removed. No environment secrets were printed, no John/Jomari data was modified, and no Neon database was contacted.

## Phases 2 and 3 verification

- Lint, TypeScript checks and the backend TypeScript build passed after the review fixes.
- Unit suite: 27 passed, covering local-only guards, all 13 rules, name/unit/date normalization, ambiguous matching, excluded sources and stable fingerprints.
- Isolated local PostgreSQL: 8 foundation tests and 13 pipeline/workflow tests passed. All five migrations applied to a fresh cluster and a repeat deployment found no pending work.
- The seeded pipeline stages all 237 input rows, reconciles counts, merges Maria to one tenant, and saves actual quality observations. Repeat runs retain canonical IDs/counts. A verified correction improves the new result while older scores and provenance remain.
- API checks covered login/logout, origin rejection, invalid input, unauthorized access, issue filters and classified issue reads. Workflow checks covered stale and changed-source actions, financial/visitor access, acceptance, quarantine, concurrent work and rollback on invalid rule configuration.
- Missing or newly invalid sources preserve accepted warehouse data. Quarantine prevents future loading from a row rather than deleting earlier accepted values. Documentation describes this boundary for later UI work.
- No Neon queries or migrations were performed. No frontend or browser UI was tested because the screens are not implemented yet.
- The compiled API started on loopback port 4400 and `/health` returned `ok`. Its health endpoint does not query PostgreSQL.

The migration authoring command created the pipeline/quality migration locally. Prisma refused interactive authoring for the expanded lineage index in this tool environment, so its inspected SQL diff was saved as a separate migration and verified on a fresh local database. Historical migrations were preserved. No Git commits or deployment were performed.

## Phases 4 and 5 verification

Governed tenant/unit browsing, server-side warehouse field protection, catalog/policy/role/audit APIs and the five browser workspaces are now implemented. See `docs/governance-ui.md` for endpoints and the access matrix. No new database migration was needed for this batch.

- The local browser walkthrough passed pipeline execution, source correction verified by a new run, Viewer versus Finance field visibility and an administrator role change affecting a subsequent sign-in.
- Screens were captured at 360, 768 and 1280px with no document overflow. Tables intentionally scroll inside labelled, keyboard-focusable regions at narrow widths. Desktop and mobile captures of all five main screens were visually inspected.
- Axe checks for WCAG 2 A/AA and WCAG 2.1 AA reported no violations on the five main populated screens. This automated check does not establish a full accessibility certification or replace assistive-technology testing.
- Backend integration includes all five roles, classified-read audit persistence, invalid inputs, stale policy edits, unauthorized mutations and session revocation after role changes.
- Final test totals: 27 unit tests, 26 reported local integration tests (including parent groups), and four Chromium browser flows passed. Lint and both TypeScript checks passed.
- The API and Next.js production build passed. `npm start` launched both successfully. A local production-mode smoke check verified the landing response, API health, sign-in through the Next API rewrite, a protected warehouse read and sign-out. The regular database stays separate from the disposable test records.
- The recovery-state browser flow deliberately holds requests to inspect loading, returns a simulated service error, then checks that explicit Retry loads an empty result. It covers Pipeline, Tenants, Quality, Issues and the governance catalog. Login was also captured at 360/1280px and passed its Axe scan.
- Browser captures are in ignored `.local/browser-evidence/`. They contain fictional data. Test accounts and passwords come from isolated test configuration; passwords are absent from the UI and captures.

The earlier failed browser attempt exposed ambiguous select labels and a capitalization-sensitive test locator. Explicit accessible labels and the locator were corrected before the passing run.

### Screen review

| Screen            | Hierarchy | Spacing/alignment | Responsive | A11y | Loading/empty/error | Real data & labels |
| ----------------- | --------- | ----------------- | ---------- | ---- | ------------------- | ------------------ |
| Login             | Pass      | Pass              | Pass       | Pass | Pass                | Pass               |
| Pipeline          | Pass      | Pass              | Pass       | Pass | Pass                | Pass               |
| Tenants and units | Pass      | Pass              | Pass       | Pass | Pass                | Pass               |
| Data quality      | Pass      | Pass              | Pass       | Pass | Pass                | Pass               |
| Issue queue       | Pass      | Pass              | Pass       | Pass | Pass                | Pass               |
| Governance        | Pass      | Pass              | Pass       | Pass | Pass                | Pass               |

This table combines source/state review, the visual captures and automated browser checks above. The login's empty state is the blank credential form; backend authentication errors are covered by API tests. Governance policy/role/account subviews have loading/error wrappers and explicit empty messages; the browser recovery simulation targets its catalog. Core issue correction and the account-role editor were exercised end to end. Phase 6 adds separate policy-editor and audit-detail browser scenarios.

## Phase 6 acceptance verification

`npm run test:acceptance` now creates a fresh disposable local database and runs the instructor's acceptance scenario separately from the regression fixtures. It overrides runtime database variables, applies all five existing migrations and verifies that repeat migration deployment has no pending work. No schema or production API changes were needed.

- Nine API/database acceptance scenarios and their parent passed (10 reported tests). A first run stages and reconciles all 237 source rows and produces one Maria Santos in unit 12-A with lineage evidence from tenancy, billing, maintenance and visitors.
- Six distinct seeded defects were corrected through the authenticated API: invalid email, missing contact, missing lease start, invalid calendar date, malformed unit and negative payment. Each correction produced a verification run, a resolved issue and audit entries. The overall score improved from **92.18% to 94.84%**; the original snapshot stayed unchanged.
- Repeating the pipeline after corrections preserved warehouse IDs/counts. All eight runs have start/finish audits; all six source corrections and decisions have audit records. Admin/Finance classified reads were audited and prohibited Viewer/Finance API actions were denied.
- Two new Chromium flows passed: the same Maria detail for Admin, Finance and Viewer, and policy editing followed by filtered audit inspection. They verified readable before/after policy text, the reason, the six source-correction events, four-source lineage and role-specific data.
- Audit detail passed 360/1280px overflow checks and an Axe WCAG 2 A/AA and 2.1 AA scan. Desktop role screenshots and desktop/mobile audit screenshots were visually inspected. No UI styling changes were required.
- Unit tests (27), lint, both TypeScript checks and the backend build passed. The frontend application sources did not change; the preceding production frontend build remains the build verification for those sources.
- The normal regression command also passed all 26 reported integration tests after the runner gained its acceptance mode. The regular web/API still returned HTTP 200 after the isolated runs.

The first new browser attempt used the source visitor name's casing instead of its normalized display name and a textarea-label selector that failed to locate the prefilled value. The selectors were corrected, and the focused acceptance command then exited successfully. A formatting warning in the new backend test was also corrected.

Evidence: ignored `.local/acceptance-results.txt`, `.local/phase6-acceptance.txt` and `.local/acceptance-evidence/`. See `docs/instructor-demo.md` for a repeatable command and the manual classroom walkthrough. The tests shut down their own local servers/database and preserve the regular demonstration records.

## Unverified or outside scope

Handoff documentation was checked against actual exported functions, routes, role definitions and setup scripts. One batched local account lookup verified all five private account-note passwords, active status, assigned role and permission lists. No credentials were printed. This documentation-only handoff did not repeat the earlier automated test/build suites or change application behavior.

Production identity management, external source adapters and a field-classification editor are outside the implemented scope. A screen reader and browsers other than Chromium have not been manually tested. The six local development phases are complete; the subsequently authorized Neon runtime setup is recorded below.

## Authorized Neon connection and access provisioning

- A read-only preflight found no existing user tables. The supplied connection was saved only in ignored private configuration. The original local environment was preserved at `.local/local.env`.
- Runtime now accepts an explicitly selected, pinned Neon endpoint with TLS, matching pooled/direct URLs and dedicated `bern_hub` schema. The configured runtime pool is two connections. Test flags require dedicated loopback URLs on both connections regardless of a remote runtime setting.
- Five existing migrations were applied to Neon once. Batched access provisioning created five accounts, five roles, 13 rules, 35 catalog entries and one provisioning audit. All account passwords, active state, assigned roles and permissions matched the private note. Source and warehouse records were not seeded remotely.
- An environment-file precedence guard rejected the first provisioning attempt before remote writes; the explicit selection rule was corrected and regression-tested. The later migration/access setup succeeded, but its final raw summary query lacked schema qualification. Read-only inspection confirmed the completed setup; the corrected `--verify-only` report finished without repeating migrations or account writes.
- The local test runner now applies migrations in schema `bern_hub`, matching remote schema selection. Its audit TRUNCATE check explicitly names that schema and requires SQLSTATE 42501, preventing a missing-table error from falsely satisfying the append-only test.
- Unit suite: 32 passed, including environment precedence and refusal to replace test URLs. Local integration: 29 reported tests passed, including access-only provisioning and its idempotence. Four local Chromium flows passed, including recovery states, while the root `.env` selected Neon. No automated suite targeted Neon.
- Full production build passed; the backend was refreshed after the environment/provisioning fixes. Lint and both TypeScript checks passed. No frontend application styles or API response contracts changed.
- The running production-mode app used the new root configuration. Its single authorized runtime check signed in all five roles through the frontend API rewrite, checked their permissions, confirmed Viewer administration denial (403), and signed out all five sessions. This used 11 application HTTP requests, with no retry or pipeline loop. Each application request may execute multiple SQL statements; this is not a count of total database statements during provisioning.
- A scan of 96 source/document files found neither the actual database password nor the private account password. Private environment/account files and generated dependency/build directories were excluded from that source scan. Final lint, TypeScript, unit and backend build checks passed after the environment fixes.

Private evidence: `.local/neon-provisioning.txt`, sanitized `.local/neon-migration.log`, `.local/neon-runtime-check.txt`, `.local/neon-final-local-tests.txt` and `.local/neon-unit.txt`. No credentials were printed or added to source/docs. No Git publication, deployment, remote fixture seeding or modification of John/Jomari data occurred. See `docs/neon-runtime.md` for operational commands and shared-laptop setup.

## Shared demo and account security — 29 October 2026

The user subsequently selected both extensions in order: a shared fictional import, then password changing and administrator-assisted recovery. This supersedes the earlier initial-empty-Neon state above.

- One explicit guarded import created 32 tenancy, 181 billing, 12 maintenance and 12 visitor source records in Bern's schema, preserving access/catalog metadata. Its single initialization pipeline staged 237 rows: 206 loaded, 30 quarantined and one deduplicated. The actual score was 92.18%, with 12 failing rule types. The report is `.local/neon-demo-import.txt`; the import refuses existing operational records or its previous audit marker. No repeat import or remote pipeline loop was run.
- Account security now lets all five roles set/change their own question and change their own password with fresh proof. The administrator can issue an expiring single-use code or clear another active user's lost question after recording identity verification and proving their own password/answer. Stored answers and codes are never returned from database hashes. Password/question/role changes revoke existing sessions and outstanding codes. See `docs/account-security.md` for limits and boundaries.
- Normal local database/API verification passed 41 reported tests (access 3, foundation 8, pipeline 13, governance 5, account security 12, including parent groups). New security cases cover missing/wrong proof, durable failure limits, expiry/reissue/email binding, single-use concurrent redemption, concurrent login/password change, admin permissions, session/code revocation, strict payloads and credential-free audit records.
- `npm run test:security` passed its focused access/security API suites and one complete Chromium flow: user enrollment/password change, administrator issuance, requester recovery, administrator question reset and subsequent sign-in. Its randomly generated answers and changed password exist only in the disposable test database. The normal browser regression then passed all four existing flows, including pipeline correction, role differences/changes and loading/error/empty states.
- Account security, blank Forgot password and the blank administrator recovery panel passed 360/1280px document-overflow and Axe WCAG 2 A/AA and 2.1 AA checks. All six saved captures were visually inspected for hierarchy, readable labels, spacing and responsive layout. No secrets were entered before those captures. The design detector flagged only the pre-existing Arial font declaration; the established typography was retained. No screen-reader or non-Chromium certification is claimed.
- Lint with zero warnings, backend/frontend TypeScript checks, all 32 unit tests, and the full Express/Next.js production build passed. New code remains in the existing feature/module folders; no route entry was moved and no files were deleted. The project map and separate Bisaya guides were updated. A scan of 115 source/document files found none of the actual configured account/database passwords; ignored private and generated directories were excluded.
- The sixth, additive account-security migration was applied to Neon once after local verification. Before/after comparisons matched account IDs/password hashes/roles/active flags and source/tenant/run counts. This command did not seed records, run a pipeline or change a password. Private sanitized evidence is `.local/neon-auth-migration.log` and `.local/neon-auth-migration.txt`.
- The refreshed production-mode app passed a bounded runtime smoke check through the Next API rewrite: Viewer sign-in, initial account-security profile read and sign-out. It used three HTTP requests with no retries and no password/question changes. Evidence is `.local/neon-account-runtime.txt`. The app is running at `http://localhost:3400`; this runtime check is separate from the automated loopback-only suites.

### Account screen review

| Screen                 | Hierarchy | Spacing/alignment | Responsive | A11y | State/flow review | Real labels |
| ---------------------- | --------- | ----------------- | ---------- | ---- | ----------------- | ----------- |
| Account security       | Pass      | Pass              | Pass       | Pass | Pass              | Pass        |
| Forgot password        | Pass      | Pass              | Pass       | Pass | Pass              | Pass        |
| Administrator recovery | Pass      | Pass              | Pass       | Pass | Pass              | Pass        |

This combines source review, six blank-form visual captures and the successful end-to-end flow. Credential/error/limit cases are asserted in API tests; loading/error rendering was reviewed in source. It does not mean every possible error state was screenshot-tested. Evidence is in ignored `.local/account-evidence/`, `.local/security-browser.txt`, `.local/account-regression-browser.txt`, `.local/account-production-build.txt` and `.local/account-secret-scan.txt`.

Recovery codes are handed over manually; automatic email/SMS and independent MFA are not implemented. The sole administrator cannot use these controls to recover their own account. Initial private account notes become outdated when a user changes a shared account's password. No automated test targeted Neon; John/Jomari data was untouched. No Git commit, push or deployment was performed.

## Final requirements review — 29 October 2026

The implementation, exported modules, route entries, scripts and existing test evidence were compared with `docs/brief.md`. No missing feature was found within the agreed classroom EDM scope. `docs/completion-checklist.md` maps each requirement to its implementation and verification. Outdated phase notes in the pipeline and governance guides were corrected; no application code, database schema or runtime configuration changed during this review.

After the account-security changes, `npm run test:acceptance` was rerun once against fresh isolated loopback PostgreSQL. All six migrations applied and the repeat deployment found no pending migrations. The access suite passed three reported tests and the instructor suite passed ten reported tests (including parent groups). They reconfirmed four-source Maria reconciliation, six verified issue corrections, improvement from 92.18% to 94.84%, stable canonical IDs/counts, field permissions and audit evidence. Both Chromium acceptance flows passed: Admin/Finance/Viewer tenant views and policy editing/filtered audit details, including the audit detail's responsive/Axe checks.

Evidence: ignored `.local/final-completion-acceptance.txt`, `.local/acceptance-results.txt` and `.local/acceptance-evidence/`. The runner shut down its test services and database. It did not contact Neon, alter shared demonstration records or change account credentials. Existing passing lint/type/unit/regression/security/build results remain applicable; only documentation changed in this final review.

## Prepublication account and regression review — 29 October 2026

The user requested full testing and every account check before GitHub publication. All local suites, lint/types, the complete production build and both dependency-audit scopes passed. Added coverage explicitly checks the five-role API matrix, Steward/Front desk browser behavior and password/question changes for every role using generated local fixture accounts. Five core browser flows, one security flow and two instructor flows passed. Normal database/API coverage reported 42 checks; the focused security run reported three access plus 13 expanded security checks, with parent groups included.

All five shared Neon accounts then passed one sign-in/permission-list/sign-out check each: ten HTTP requests total, no retries or credential/operational changes. No remote test suite, source import, migration or pipeline was run. Publication hygiene excludes Office locks and superseded SRS copies, in addition to existing ignored credentials and generated/private directories. The source and final document scans found no configured password matches; `.env.example` secret fields remain blank. Both npm audit scopes reported zero known vulnerabilities at check time.

See `docs/prepublication-verification.md` for the role table, exact command results and remaining limits, and ignored `.local/prepublication/` for evidence. The folder is not yet a Git repository, so history/staging/remote inspection is not available; no Git publication or deployment was performed.
