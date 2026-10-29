# Task: Condo Management EDM Platform

## Goal

Build a working mini Enterprise Data Management (EDM) platform for a condominium
property manager. It must demonstrate three pillars on real, running code:

1. Integration: extract data from four separate source systems, transform it,
   and load it into one unified store (ETL).
2. Data quality management (DQM): automatically check, score, and fix data
   quality during the pipeline.
3. Data governance: enforce roles, field-level access, ownership, and an audit
   trail on the unified data.

The four source systems deliberately disagree with each other, e.g. the same tenant
appears as "Maria Santos", "MARIA SANTOS", and "Maria S. Santos", and the same unit
as "12A", "12-A", "Unit 12 A".

## Scope

In scope: the schema, seed script, ETL pipeline, DQM engine, governance layer,
Express API, Next.js screens, and tests described below.
Out of scope: real external systems (sources are seeded tables), SSO, file
uploads, payments processing, ML. Do not refactor or restyle unrelated files.

## Stack

- Frontend: Next.js (App Router, TypeScript)
- Backend: Express (TypeScript), separate API service
- Database: PostgreSQL on Neon, accessed only through Prisma
- Neon: use the pooled connection string (DATABASE_URL) at runtime and the direct
  connection string (DIRECT_URL, via `directUrl` in schema.prisma) for migrations.
  Secrets live in .env; commit a .env.example with no real values.

## Before you write code

1. Read the repo: structure, existing components, utilities, conventions.
2. Post a short plan: files to add or change, schema, endpoints, screens, and the
   phase order below. Then implement. Follow existing patterns over inventing new ones.

## Data layers (Prisma)

Use either Prisma multiSchema or consistent table prefixes. Pick one and keep it.

- Source layer (seeded with messy data):
  src_tenancy (unit and tenant records), src_billing (dues and payments),
  src_maintenance (requests), src_visitor_log (visitors and entries).
- Staging layer: raw extracted rows tagged with runId and source system.
- Warehouse layer (unified, clean): Tenant, Unit, Lease, DuesLedger,
  MaintenanceRequest, VisitorEntry. Every field records its source system (lineage).
- Pipeline: PipelineRun (status, start/end, row counts per stage), PipelineStageLog.
- DQM: QualityRule, QualityResult (per run, per rule: checked, passed, failed),
  QualityIssue (row reference, rule, severity, status: open | resolved | quarantined | accepted).
- Governance: User, Role, Policy, FieldClassification (public | internal |
  confidential | restricted), DataOwner, AuditLog (append-only: actor, action,
  entity, before/after, timestamp, IP).

## Integration (ETL)

- Extract: one adapter per source, triggered from the Express API, logged per run.
- Transform: standardize names (case, initials, spacing), normalize unit codes to
  one format (e.g. "12-A"), standardize date formats and status codes, match records
  across systems (by tenant ID where present, otherwise by normalized name + unit),
  remove duplicates, correct invalid data, and calculate values (e.g. months overdue,
  days a request has been open).
- Load: upsert into the warehouse layer. Rows that fail validation go to quarantine
  with a reason. Never drop rows silently.
- The pipeline must be idempotent: running it twice on the same data produces no
  duplicates.

## DQM

Implement rules as data (QualityRule rows) executed by one engine, not hard-coded
if-statements scattered around.

- Completeness: tenant has contact number and email; lease has start date.
- Validity: unit code matches the format; email format; amounts are not negative.
- Uniqueness: no duplicate tenants; at most one active lease per unit.
- Consistency: every billing and maintenance record references an existing unit;
  tenant name matches across sources after normalization.
- Timeliness: dues overdue by more than 90 days flagged; maintenance requests
  open more than 30 days flagged.
- Each run computes a score per rule and overall from real results, with the
  change versus the previous run.
- Issue queue: a data steward can fix, accept, or quarantine each issue with a
  note. Every action is audit-logged.

## Governance

- Roles: Admin (property manager), Data Steward, Finance, Front Desk/Security, Viewer.
- Enforce permissions in Express middleware, not only by hiding things in the UI.
- Field-level access by classification:
  - Payment amounts and balances: confidential (Admin, Finance)
  - Tenant contact details: internal (masked for Viewer)
  - Visitor logs: restricted (Admin, Front Desk/Security)
- Audit log: records every pipeline run, every edit, every issue resolution, and
  every read of confidential or restricted fields. It is append-only: no update
  or delete endpoint.
- Data catalog: each field with owner, classification, source system, and the
  policy that applies to it.
- Reference the Philippine Data Privacy Act as the policy basis in seeded
  policy text only. Do not claim legal compliance anywhere in the UI.

## Screens

1. Pipeline: run history, trigger a run, per-stage row counts, failures, quarantine count.
2. Quality dashboard: score per rule and trend across runs (computed, never faked).
3. Issue queue: filter by rule, severity, status; resolve with a note.
4. Unified tenants and units: searchable table, drill-in with lineage per field and
   role-based masking.
5. Governance: roles and policies, data catalog, audit log with filters.

## Seed data (required)

A seed script (`prisma db seed`) with realistic, varied data, including:

- Tenant "Maria Santos" in unit 12A appearing in all four sources with name and
  unit-code variations that must merge into ONE tenant.
- Duplicate tenants, a unit with two overlapping active leases, billing for a
  nonexistent unit, a negative payment amount, an invalid email, missing contact
  numbers, mixed date formats, a request open 45+ days, and dues 120+ days overdue.
- At least 30 tenants and 6 months of dues so lists, filters, and trends look real.

## Design direction

Build an operational tool for property staff doing real work, not a showcase.

- Prioritize density and scannability: tables, filters, and forms over decorative cards.
- One neutral palette plus one accent, defined as design tokens. One type scale,
  one spacing scale, aligned to a grid.
- Compact page headers: title, one context line, primary action. No hero sections.
- Icons only where they aid recognition, from one icon set. No emoji in the UI.
- Specific domain language everywhere, e.g. "No pipeline runs yet. Run the pipeline
  to load tenant and billing data", never "No data found" or "Get started".
- Avoid: generic admin-dashboard layouts, gradients, glassmorphism, decorative blobs,
  repetitive card grids, boilerplate labels, and any element that does not support a
  task the user is actually doing.

## Data honesty

- Every number, chart, and status comes from the database or API. No fake metrics
  or meaningless charts. If there is no data, show a real empty state.
- Every button and link does something real or is removed. No lorem ipsum,
  placeholder copy, or TODO text in the UI.

## Engineering rules

- Validate every request body, query, and param with zod. Consistent error shape:
  { error: { code, message } } with correct HTTP status codes.
- Thin route handlers, logic in services, one shared Prisma client.
- Schema changes via `prisma migrate dev`; commit the migrations.
- All frontend API calls go through one typed client module.
- Reuse existing components and utilities. No abstractions for single-use cases,
  no duplicated components.

## States, accessibility, responsiveness

- Every data-driven screen: loading (skeleton matching the layout), empty, error
  (with retry), success. Forms: inline validation, disabled while submitting, clear
  success or failure feedback.
- Keyboard reachable, visible focus, semantic HTML, labels on all inputs, WCAG AA
  contrast. Works at 360px, 768px, and 1280px; tables scroll or collapse gracefully.

## Build in phases (stop and summarize after each)

1. Schema, migrations, and seed script.
2. ETL pipeline (extract, transform, load, quarantine, idempotency).
3. DQM engine, rules, scoring, issue queue API.
4. Governance: roles, middleware, field masking, audit log, catalog.
5. Screens, wired to the real API.
6. Tests and polish.

## Testing

- Backend: tests for the transform (name and unit-code normalization, matching),
  each DQM rule, role-based masking, audit-log append-only behavior, and pipeline
  idempotency.
- Frontend: tests for the key flows (run pipeline, resolve an issue, role change
  affecting visible data).

## Acceptance (instructor demo)

Running one pipeline on the seed data must visibly show:

- Maria Santos, unit 12A, merged from 4 sources into 1 tenant despite name and
  unit-code differences
- at least 6 distinct DQ issues detected, scored, and resolvable
- the same tenant page showing different data for Admin, Finance, and Viewer
- every one of those actions appearing in the audit log

## Definition of done

1. Run lint, typecheck, and tests. Fix all failures.
2. Review every screen you touched and output this table, marking each cell
   Pass or Fix, then fix every "Fix":

| Screen | Hierarchy | Spacing/alignment | Responsive | A11y | Loading/empty/error | Real data & labels |

3. Final report: what changed (files, migrations, endpoints), how to run locally
   (including Neon env setup), and anything you could not verify or assumed.
