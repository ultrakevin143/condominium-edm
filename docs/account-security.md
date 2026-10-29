# Account security and administrator-assisted recovery

The requested extension follows the established Condo desk interface. It adds an Account security workspace for every signed-in role, a recovery form beside sign-in, and administrator recovery controls in Governance → Account roles.

## Implemented flows

- A user sets their own security question and answer after proving their current password. Changing an existing question also requires its current answer. Answers are normalized and salted/hashed; the application never returns stored answers or hashes.
- Password changing requires the current password and the configured security answer. New passwords are 15–128 characters and must differ from the current password. The change signs out existing sessions and invalidates outstanding recovery codes.
- The Property manager verifies a requester outside the application, records a non-sensitive verification note, and proves their own password/security answer before issuing a recovery code for another account. Codes are cryptographically random, shown once, stored only as hashes, expire after 15 minutes and are single-use.
- The requester enters their email and code on the recovery form, answers their configured question if present and chooses a new password. The code is checked again and atomically consumed during reset. There is no automatic login afterward.
- If a requester also lost their answer, the administrator may clear their question after verification. The administrator cannot read or replace the old answer. The requester sets their own new question after recovery. Self-recovery through administrator controls is blocked.

Sensitive account verification is limited by role, current credentials, per-account failure limits and request limits. Audit entries record actions, target IDs and verification notes; they exclude passwords, answers and recovery codes. Role or credential changes revoke old sessions and codes. A question is another knowledge check, not an independent MFA factor.

## Boundaries

Codes are delivered manually by the administrator; no email/SMS service or delivery claim is added. A sole administrator who loses all credentials needs a trusted database owner or another authorized administrator to arrange recovery; there is no public administrator bypass. Private test-account notes describe initial credentials and become outdated for an account after its password changes.

The implementation and local tests follow [OWASP's password-change guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) and [single-use, expiring recovery-token guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). Security questions are supplementary checks; the recovery code is issued only after administrator verification, consistent with [OWASP's cautions about questions](https://cheatsheetseries.owasp.org/cheatsheets/Choosing_and_Using_Security_Questions_Cheat_Sheet.html).

## Code and API map

The Account security tab is `/account`. Its form is `frontend/src/features/account/account.screen.tsx`; `recovery-form.tsx` handles Forgot password and `admin-recovery.tsx` handles the administrator panel. `secret-field.tsx` shares labelled password fields. The existing route entry, application shell and request client remain in their framework/shared locations.

Express mounts public POST `/auth/recovery/details` and `/auth/recovery/reset` before session authentication. Protected routes are GET `/account/security`, PUT `/account/security-question`, POST `/account/password`, POST `/account/users/:id/recovery-code` and DELETE `/account/users/:id/security-question`. All writes validate strict schemas. Administrator actions require `governance:manage` in middleware and a fresh service authorization check. Services live in `backend/src/modules/auth/account-security.service.ts`; validation is alongside them. Sorted per-account locks serialize login, password/question changes, recovery redemption and role changes; session credential versions reject stale access.

The additive migration is `backend/prisma/migrations/20261028161557_account_security/migration.sql`. Passwords and normalized answers use the existing salted scrypt helper; high-entropy recovery codes use SHA-256 fingerprints. Five failed account-verification attempts lock sensitive changes for 15 minutes; five wrong recovery answers disable that code. Public recovery also has a shared eight-request/15-minute IP limit; protected security writes have a ten-request/15-minute IP limit. A shared classroom network can therefore hit a limit even across different accounts; wait for the window rather than repeatedly retrying. Limits are in memory per API process; a multi-server deployment would require a shared limiter store.

`npm run test:security` runs focused local API and Chromium flows with randomly generated fixture secrets. It covers initial enrollment, password changing, recovery, answer reset, expiry/reuse, permissions, persistent attempt limits, session revocation, concurrent redemption/login and omission of credentials from audits. It never targets Neon. Completion and actual results are recorded in `docs/verification.md`.
