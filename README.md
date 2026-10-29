# Condominium EDM platform

This fictional condominium EDM demonstration includes four-source ETL, automatic quality checks, an issue queue, governed tenant/unit views, a field catalog, policy and role administration, audit history, and [account security with administrator-assisted recovery](docs/account-security.md). It uses a Next.js frontend and separate Express API. See [the pipeline guide](docs/pipeline-quality.md), [the governed workspace guide](docs/governance-ui.md), and [Neon versus local operation](docs/neon-runtime.md).

The requested scope is in [the brief](docs/brief.md). See [the completion checklist](docs/completion-checklist.md), [project map](docs/project-map.md) and [verification](docs/verification.md). Run `npm run dev` to start the frontend at `http://localhost:3400` and API at port 4400. All stored resident and financial records are fictional samples.

For the final classroom walkthrough, see [the instructor demo](docs/instructor-demo.md). `npm run test:acceptance` repeats its acceptance scenarios against a fresh disposable local database and saves private evidence under `.local/`.

The final academic document is [the Software Requirements Specification](docs/Condominium_EDM_Software_Requirements_Specification_Revised.docx). See [the prepublication verification report](docs/prepublication-verification.md) for the five-role checks and test results.

## Clone and use the shared classroom database

```sh
git clone https://github.com/ultrakevin143/condominium-edm.git
cd condominium-edm
npm ci
npm run db:generate
```

Get the private environment file and assigned account details directly from the project owner. Place `.env` at the repository root, beside `package.json`, `frontend/` and `backend/`. Then run `npm run dev` and open `http://localhost:3400`. Root npm commands install and run both workspaces; separate dependency installation in each subfolder is unnecessary.

The public repository includes only the blank `.env.example`. Do not run setup, seeding, migration or Neon provisioning merely to use the already configured shared classroom database. Use the separate local setup below for isolated practice. Password changes to a shared role account affect everyone using that account.

Notepad handoff files: [Windows setup guide](docs/BERN-SETUP-GUIDE.txt) and [Bisaya reviewer/code walkthrough](docs/BERN-REVIEWER-BISAYA.txt). Private local accounts remain in ignored `.local/development-access.txt`; their passwords, assigned roles and permissions were checked against the local database on 28 October 2026 without printing credential values.

## Local foundation setup

Install Node.js 22.12+ and npm. Run these commands from the project root, where `package.json`, `frontend/` and `backend/` are located:

```sh
npm ci
npm run setup:local
npm run db:generate
npm run db:local
```

Keep that database terminal open. Open a second terminal in the project root:

```sh
npm run db:migrate
npm run db:seed
npm run dev:local
```

`setup:local` creates the ignored root `.env`, preserved `.local/local.env`, and private `.local/development-access.txt` with generated local passwords on a fresh local setup. It preserves existing files. Local PostgreSQL uses port 54349 and database `bern_local`. Stop it with Ctrl+C. Migration/seed helpers remain local even when ordinary application startup uses Neon.

The local seed creates five demo accounts, 30 distinct fictional tenant identities in 32 tenancy rows, 181 billing rows, 12 maintenance records and 12 visitor entries. Six complete months of dues include partial, paid and unpaid examples. It also creates 13 rule definitions and field catalog entries. Source defects include duplicates, a conflicting active lease, invalid dates/email/unit code, a negative payment, missing contact/start dates and a nonexistent referenced unit. Maria occurs in all four sources. Warehouse tables remain empty until an authorized user triggers the pipeline API.

Seeding twice preserves later edits, policies and account passwords. These are source simulations; nothing is a real resident, visitor or financial record.

## Verification commands

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

The integration runner never loads `.env`; it overrides both database URLs with its isolated loopback cluster on port 54350 and a dedicated `bern_test` database. Prisma may report that it read `.env`, but its supplied test URLs take precedence. The runner applies migrations, checks repeat application and runs database/API tests. No automated test targets Neon. `npm run build` builds the API and Next.js app; `npm start` starts both production builds. `npm run test:browser` runs isolated local browser flows; `npm run test:security` runs focused account-security API and browser flows. Run these suites sequentially because they share fixed local ports. Install Chromium first using `npx playwright install chromium`.

## Database structure and governance limits

All application tables and enums use `bern_` prefixes, including `bern_src_tenancy`, `bern_src_billing`, `bern_src_maintenance` and `bern_src_visitor_log`. Staging retains raw rows; typed warehouse tables use stronger constraints. These constraints reject malformed canonical unit codes, negative canonical amounts, inconsistent quality counts and conflicting active leases. Source tables deliberately allow invalid input so the pipeline can detect issues and quarantine unsuitable rows.

The audit table has a database trigger that rejects UPDATE, DELETE and TRUNCATE. Database owners can disable triggers; use separate runtime/migration identities before production operation. The policy text references the Philippine Data Privacy Act as requested; it is not a legal compliance claim. Session and permission checks protect the API; amounts and visitors are omitted for unauthorized roles and Viewer contacts are masked. Classified reads, edits and pipeline actions are audited. Policy prose is editable by administrators; classification metadata and permission definitions are not arbitrary UI-editable grants.

## Neon runtime

Keep Bern's own private `.env` at this project root. It uses a pooled runtime URL, direct migration URL, explicit remote target and endpoint pin, TLS, and the dedicated `bern_hub` schema. Never commit the real values or reuse John/Jomari databases. `npm run dev` / `npm start` use that runtime configuration. `dev:local` / `start:local` select the preserved local environment instead. The authorized one-time shared demo import loaded 237 fictional source records and initialized the pipeline: 206 loaded, 30 quarantined and one duplicate removed, with a 92.18% quality score. Existing accounts/passwords were preserved. See [the Neon guide](docs/neon-runtime.md) for maintenance and shared-laptop setup. Classmates must not repeat provisioning or the shared import.
