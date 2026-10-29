# Bern instructor demonstration

All residents, visitors and amounts are fictional. The project demonstrates integration, data quality and governance using four simulated source tables.

## Repeatable acceptance check

From the project root run `npm run test:acceptance`. Install Chromium once with `npx playwright install chromium` if it is missing. The command creates its own loopback `bern_test` database, applies the existing migrations, seeds fresh fictional records, runs the API acceptance scenarios and then opens headless Chromium for the presentation flows. Test API/web ports are 4450/3450; test PostgreSQL is 54350. These ports must be available.

The database and servers shut down at the end. This command never uses the regular runtime database or Neon. It saves the API result summary in ignored `.local/acceptance-results.txt` and browser screenshots in `.local/acceptance-evidence/`. Passwords are supplied privately by the runner and are absent from its report and screenshots.

The regular `npm run test:integration` suite covers additional concurrency, stale-change, quarantine, rollback, permission and immutable-audit cases. `npm run test:browser` covers the main screens, issue correction, account-role changes, responsive accessibility and recovery states. Acceptance adds six verified corrections plus the policy-editor and audit-detail flows.

## Live demonstration

Follow the root README setup first. For an isolated 237-row fictional scenario, keep `npm run db:local` running and use `npm run dev:local`, or build then use `npm run start:local`. Open `http://localhost:3400`. Private demo accounts are in `.local/development-access.txt`; keep that file out of presentation screenshots. Ordinary `dev`/`start` uses the configured Neon runtime, which now contains the separately authorized shared fictional import and its first pipeline results. Use local mode for repeat corrections/password demonstrations so classmates' shared records and credentials stay stable.

1. Sign in as the Property manager. Open Pipeline and click **Run pipeline**. Inspect the run: 237 rows are extracted from tenancy, billing, maintenance and visitors. Loaded, quarantined and duplicate counts reconcile to the extracted count. Partial completion is expected because the fixtures deliberately include defects.
2. Open Tenants & units, search **Maria**, and open her single result. Her accepted unit is **12-A**. The lineage table records evidence from all four sources despite variants such as `12A`, `12-A`, `Unit 12 A`, `MARIA SANTOS` and `Maria S. Santos`. A field credits the source that actually supplied its value; Maria's name is owned by tenancy.
3. Open Data quality. Show the 13 rule results, their checked/passed/failed counts and the real overall score. Explain that the history is saved per run. The seeded sources trigger at least six distinct failing rules.
4. In Issue queue, choose a rule and open the relevant source row. Fix one field, enter a reason and save. The service creates a verification run and marks the old issue resolved only if the selected rule passes. Select the newest issue list before making the next correction; an old issue cannot overwrite newer work.
5. Compare the same Maria page using Property manager, Finance and Viewer accounts. Property manager sees financial amounts and visitors. Finance sees amounts and excludes visitors. Viewer excludes both and masks tenant contact fields. The API enforces these differences.
6. As Property manager, open Governance. Show field owners, classifications, source systems and policies. In Policies & roles, edit policy text with a reason. Policy prose does not change server permission grants.
7. In Audit history, filter `PIPELINE_FINISHED`, `SOURCE_CORRECTED`, `ISSUE_UPDATED`, `CLASSIFIED_READ` or `POLICY_UPDATED`. Inspect an event to show its actor, time and before/after values. Confidential reads, corrections, pipeline runs and governance changes leave records. The database rejects ordinary audit edits/deletes; its owner can disable database triggers.

## Six correction examples from untouched fixtures

Use these only for the fictional seeded records. Confirm the source ID shown in the queue, not just the resident's name.

| Rule                                      | Source ID     | Field       | Verified fictional value     |
| ----------------------------------------- | ------------- | ----------- | ---------------------------- |
| Email address has a valid format          | `tenancy-1`   | Email       | `resident2@example.test`     |
| Tenant contact details are complete       | `tenancy-2`   | Phone       | `FICTIONAL-VERIFIED-CONTACT` |
| Lease start date is present               | `tenancy-3`   | Lease start | `2026-02-01`                 |
| Dates use a supported valid calendar date | `tenancy-7`   | Lease start | `2026-02-01`                 |
| Unit code can be normalized               | `tenancy-6`   | Unit code   | `26B`                        |
| Dues and paid amounts are nonnegative     | `billing-4-0` | Amount paid | `0`                          |

Each example needs its own explanatory reason. Financial corrections require the Property manager's finance permission. Data stewards can correct eligible nonfinancial issues; accepting a warning records a decision without increasing historical scores. Quarantine prevents future loading from a source row and preserves earlier accepted warehouse values.

Seeding again preserves previous corrections and account changes. It is not a reset command. For a repeatable untouched-fixture check, use the disposable acceptance command rather than clearing the regular database.

## Configuration and limits

The ignored `.env` belongs at the project root beside `frontend/` and `backend/`. The Next API rewrite forwards requests to the Express service; database secrets never belong in frontend code. Neon requires explicit runtime configuration, matching pinned pooled/direct URLs, TLS and schema `bern_hub`. The preserved `.local/local.env` selects local presentation data. See [Neon operation](neon-runtime.md); all automated suites stay local.

The demonstration is synchronous and supports up to 500 source rows per run. It does not connect real external condo systems, process payments or provide SSO. Automated accessibility checks and the recorded Chromium walkthrough do not replace a complete assistive-technology or cross-browser assessment.
