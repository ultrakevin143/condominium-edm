# Prepublication verification

Completed on 29 October 2026 against the current condominium EDM implementation. All checks below passed. Application behavior, schema, shared passwords and operational records were preserved; this round adds test coverage and publication exclusions.

## Account checks

| Role                    | Local browser sign in and permitted views | Local direct API access and denials | Local question enrollment and password change | Shared Neon sign in role permissions and sign out |
| ----------------------- | ----------------------------------------- | ----------------------------------- | --------------------------------------------- | ------------------------------------------------- |
| Property manager        | Pass                                      | Pass                                | Pass                                          | Pass                                              |
| Data steward            | Pass                                      | Pass                                | Pass                                          | Pass                                              |
| Finance                 | Pass                                      | Pass                                | Pass                                          | Pass                                              |
| Front desk and Security | Pass                                      | Pass                                | Pass                                          | Pass                                              |
| Viewer                  | Pass                                      | Pass                                | Pass                                          | Pass                                              |

The direct API matrix checks own security/catalog access, quality and pipeline-history permissions, issue access, administrator account/audit access, and denied pipeline/recovery operations. Tenant detail assertions check financial and visitor visibility for every role; Viewer contact masking and restricted lineage are covered by the existing governance assertions. The new browser flow checks Steward controls, Front desk visitor access, absent financial controls, restricted-route fallback, and rejection of protected requests after logout. Existing browser flows cover Admin, Finance, Viewer and role changes.

Each role also completed initial security-question enrollment, password change, invalidation of old sessions, successful login with the new password, logout and rejection of the old password through the local API. These tests use generated fixture accounts and secrets on disposable loopback PostgreSQL. Shared accounts were not changed.

The bounded shared-runtime check performed exactly ten HTTP requests: one sign-in and sign-out per account. It verified each expected role and permission list and confirmed that safe profile responses omit password/answer hashes. No retry, seed, migration, pipeline or password/question/role change was performed. Remote data projections and attack/negative cases were exercised locally rather than repeated against Neon. An HTTP request can execute multiple SQL statements; ten is the application request count.

## Executed verification

| Command or check                                     | Result                                                                                                                                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                       | Passed with zero warnings.                                                                                                                                                                                 |
| `npm run typecheck`                                  | Backend and frontend TypeScript passed, including the added tests.                                                                                                                                         |
| `npm test`                                           | 32 unit tests passed.                                                                                                                                                                                      |
| `npm run test:browser`                               | 42 reported database/API checks including parent groups, followed by all five core Chromium flows, passed. This command includes the normal integration suite; a duplicate standalone run was unnecessary. |
| `npm run test:security`                              | Three access and 13 expanded security checks including parent groups, followed by one complete recovery/password Chromium flow, passed.                                                                    |
| `npm run test:acceptance`                            | Three access and ten acceptance checks including parent groups, followed by both instructor browser flows, passed.                                                                                         |
| Migration behavior inside local runners              | All six migrations apply to fresh test databases; the second deployment has no pending migrations.                                                                                                         |
| `npm run build`                                      | Express and Next.js production builds passed.                                                                                                                                                              |
| `npm audit --omit=dev --json` and `npm audit --json` | Zero known vulnerabilities reported in both production-only and complete dependency scopes at check time.                                                                                                  |
| Source and latest SRS credential scan                | No configured account/database password matches; no Neon password token found in the final document XML/metadata. Secret fields in `.env.example` are blank.                                               |
| Shared Neon account runtime check                    | All five passed; exactly ten HTTP requests, no retries or credential changes.                                                                                                                              |

Eight Chromium flows passed across the three separate browser modes. Existing core/security/acceptance checks include responsive overflow assertions, Axe scans, loading/error/empty states, correction verification, classification differences, role revocation, policy edits and readable audit details. Password recovery tests cover wrong/missing proof, expiry/reissue, durable attempt limits, single-use concurrent redemption, session revocation, role restrictions, stale credential versions and omission of generated secrets from audit payloads.

The instructor acceptance again confirmed one Maria tenant from four sources, six verified corrections, a real score increase from 92.18% to 94.84%, stable canonical IDs/counts and retained audit evidence. These corrections happened only in the disposable test database.

## Publication readiness and limits

Root `.env`, all private `.env.*` variants, `.local/`, dependencies and generated build directories are excluded by `.gitignore`; `.env.example` is explicitly allowed. Office lock files and the two superseded SRS copies are now excluded. The final document for publication is `docs/Condominium_EDM_Software_Requirements_Specification_Revised.docx`. Private account notes and test logs remain ignored.

This folder is not yet a Git repository. There is therefore no current commit history, staged-file set or Git remote to inspect. These checks validate the working source and ignore rules; inspect the exact staged file list before the first commit and push. No repository, branch, commit, push or deployment was created during verification.

Testing provides evidence for the covered cases, not proof that every possible defect or bypass is impossible. Manual screen-reader/non-Chromium verification, production capacity/load testing, backup restoration, restricted database runtime credentials and multi-server rate-limit storage remain outside the verified classroom baseline. Recovery uses manual administrator code delivery and supplementary knowledge questions, not email/SMS delivery or independent MFA.

Private evidence is under ignored `.local/prepublication/`: lint, type, unit, regression, security, acceptance and build logs; both dependency reports; source/document privacy reports; and the bounded account result. Automated suites used loopback PostgreSQL only. John/Jomari environments and data were not accessed.
