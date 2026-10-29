# Bern working rules

- Independent condominium EDM project. Never load John or Jomari environment files.
- Automated tests and demo seeding use loopback PostgreSQL only. No tests target Neon.
- Secrets stay in ignored root `.env` and `.local/`. Never print or commit passwords, tokens or database URLs.
- Frontend route entries belong in `frontend/app`; feature screens in `frontend/src/features`; API features in `backend/src/modules`.
- Use consistent `bern_` database table prefixes. Sources deliberately contain invalid data; warehouse rows use stronger constraints.
- No scheduled polling or automatic retries. No deployment or Git publication unless explicitly requested.
- The user authorized Bern's own Neon runtime and one-time tables/account/catalog provisioning. Root `.env` selects it with an explicit endpoint pin and `bern_hub` schema. Do not print it. Fictional operational seeding stays local. Only the authorized bounded runtime sign-in/role check may use Neon; automated suites remain loopback-only.
- Use `.local/local.env` and `npm run dev:local` for local UI verification. Ordinary migration/seed helpers select that local file. `db:neon:provision` is fresh setup only and refuses existing Bern objects; do not repeat remote migration/status/seed requests.
- Run relevant lint, TypeScript, tests and builds. Record actual verification and incomplete phases honestly.
- The user subsequently explicitly authorized (1) loading fictional shared demo data into Bern's Neon, then (2) password change and administrator-assisted recovery. `db:neon:demo` is the one-time empty-table import plus one initialization pipeline; it must preserve accounts/existing data and refuse repeat import. This is an exception to local-only fixture seeding, not permission for automated Neon test loops. Apply a future remote auth migration only after local verification.
