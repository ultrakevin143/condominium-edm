# Product

Bern is a web application for condominium property staff. The supplied brief identifies administrators, data stewards, finance staff, front desk/security staff and viewers. The product demonstrates integration, data quality and governance across tenancy, billing, maintenance and visitor data. The source systems are simulated; payments processing, live external connections, SSO and file uploads are out of scope.

## Stack

Next.js App Router and TypeScript; separate Express API; Prisma and PostgreSQL, with separate pooled and direct Neon connections when supplied.

## Constraints

Compact, accessible operational screens; no unsubstantiated claims of legal compliance; real results only. The user approved fictional data using Filipino names, including Jomari Andales, John Degamo, Kevin Mercado, Bern Tajanlangit and Gerald Litang. No actual contact information or condominium records are supplied. Neon credentials stay in ignored environment files. Automated tests use local PostgreSQL.
