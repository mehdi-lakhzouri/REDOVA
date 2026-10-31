# UM-004 — MFA TOTP & Account Security

| Field | Value |
| --- | --- |
| Ticket ID | UM-004 |
| Title | MFA TOTP & Account Security |
| Priority | **P0** |
| Story points | **5** |
| Dependencies | UM-002 (sign-in flow). Soft: UM-003 (notification emails via the `security-notification` template) |
| Blocks | UM-007 (MFA mandatory for `PLATFORM_ADMIN`) |
| References | README §5.5, §7, §15, §17.1 (T1, T8), §17.4 |

## User story

**As a** REDOVA user handling sensitive security findings,
**I want** to protect my account with an authenticator app, keep recovery codes for emergencies, change my password and confirm my identity before sensitive actions,
**so that** a stolen password alone is not enough to take over my account.

## Business objective

Protect the highest-impact accounts (BO-3) and give every user strong, self-service account security through the API. Users are notified of every security-relevant change, and every change is audited (BO-4).

## Scope

### In scope

- Verification, through tests, of the native two-factor flows configured in UM-001: enable (password), verify TOTP (enrollment and sign-in), backup codes (single use, regenerate), trusted device (7 days), lockout, disable.
- Change password (current password, HIBP, revoke other sessions).
- Recent-authentication behavior: native `SESSION_NOT_FRESH` and the re-authentication procedure (README §5.5).
- `PLATFORM_ADMIN` cannot disable MFA (`MFA_REQUIRED_FOR_ROLE`).
- Security notification emails and audit events for: MFA enabled, MFA disabled, backup codes regenerated, password changed.
- Audit events for challenge failures and backup-code usage.
- Operator runbook + CLI for MFA reset when all factors are lost **[P1]**.

### Out of scope

- `MfaRequiredGuard` and `FreshSessionGuard` for REDOVA admin APIs (UM-006 builds them, UM-007 uses them).
- Email/SMS OTP, passkeys (future). Any UI (backend-only phase).

## Implementation tasks

- [x] Confirm the `twoFactor` configuration from UM-001 (issuer `REDOVA`, `trustDeviceMaxAge: 604800`, TOTP defaults, backup codes encrypted, lockout defaults).
- [x] `hooks.before` (matcher `/two-factor/disable`): load the session user; if `role === "PLATFORM_ADMIN"` throw `APIError("FORBIDDEN", { code: "MFA_REQUIRED_FOR_ROLE" })`.
- [x] `hooks.after` (matcher `/two-factor/verify-totp`):
  - success **with** an authenticated session (enrollment confirmation) → audit `auth.mfa.enabled` (★) + enqueue `security-notification` ("Two-factor authentication enabled");
  - error **without** a session (sign-in challenge) → audit `auth.mfa.challenge_failed` (no secret, no code in metadata).
- [x] `hooks.after` (matcher `/two-factor/verify-backup-code`): success → audit `auth.mfa.backup_code_used`; error → `auth.mfa.challenge_failed`.
- [x] `hooks.after` (matcher `/two-factor/disable`): success → audit `auth.mfa.disabled` (★) + notification.
- [x] `hooks.after` (matcher `/two-factor/generate-backup-codes`): success → audit `auth.mfa.backup_codes_regenerated` (★) + notification.
- [x] `hooks.after` (matcher `/change-password`): success → audit `auth.password.changed` (★) + notification "Password changed".
- [x] Add `eventLabel` values for the new notifications to the `security-notification` template mapping (`packages/integrations`).
- [x] Rate-limit rules for `/two-factor/verify-totp` and `/two-factor/verify-backup-code` (README Appendix C.2).
- [x] Test helper: compute a TOTP code from `totpURI` (RFC 6238, `otpauth` or `@better-auth/utils`).
- [x] Logger redaction includes `totpURI`, `code`, `backupCodes` (README §17.3); verify with a test.
- [x] **[P1]** `apps/server` CLI `mfa:reset --email <email> --reason <text>`: requires an interactive confirmation, deletes the `twoFactor` row, sets `twoFactorEnabled=false`, revokes all sessions, writes `admin.user.mfa_reset` with actor `SYSTEM` and the reason. Runbook in `docs/user-management/runbooks/mfa-reset.md` (identity-verification steps, who may run it).

## Affected monorepo packages/apps

`packages/auth` (hooks), `packages/integrations` (notification labels), `apps/server` (tests; CLI, P1), `docs/user-management/runbooks/` (P1).

## Database changes

None. Uses the native `twoFactor` table and `user.twoFactorEnabled`.

## Frontend requirements

None (backend-only phase). The client obligations for `totpURI` and backup codes are in README §15.

## Backend requirements

- All MFA flows use the native `/two-factor/*` endpoints. No custom TOTP code.
- Hooks must not alter native responses except the `MFA_REQUIRED_FOR_ROLE` rejection.
- Audit metadata never contains TOTP codes, backup codes, secrets or the `totpURI`.

## Security considerations

- **No session before the second factor:** native: sign-in for an MFA user returns `twoFactorRedirect` and a short-lived signed two-factor cookie only.
- **Brute force:** native lockout after 10 consecutive failures (15 min) + per-IP rate limit 5/min on verification endpoints.
- **Backup codes:** encrypted at rest, single use, returned once, regenerable with password, never logged.
- **TOTP secret:** encrypted at rest (native). The `totpURI` is returned once and never logged.
- **Trusted device:** 7 days, signed cookie (native). A trusted-device cookie alone never yields a session without the password.
- **Step-up:** sensitive operations need either the password (native) or a fresh session (≤ 1 h).
- **Admins:** cannot disable MFA (custom hook).
- **Notifications** inform the legitimate owner of every factor change (detects silent takeover).

## Acceptance criteria

### AC-004-01 — Enrollment requires the password

- **Given** a signed-in user without MFA
- **When** they call `two-factor/enable` with a wrong password
- **Then** the API returns `400 INVALID_PASSWORD` and no `twoFactor` row is created.

### AC-004-02 — MFA is inactive until the first valid code

- **Given** the user called `enable` with the correct password and received a `totpURI` and 10 backup codes
- **When** they sign out and sign in again **without** verifying a TOTP code
- **Then** sign-in succeeds without a second factor, and `user.twoFactorEnabled` is `false`.

### AC-004-03 — Enrollment confirmation

- **Given** the `totpURI` from enrollment
- **When** the user submits the current TOTP code computed from that secret
- **Then** `twoFactorEnabled` becomes `true`, `auth.mfa.enabled` is recorded, and a "Two-factor authentication enabled" notification email is received. An incorrect code leaves MFA disabled.

### AC-004-04 — Sign-in requires the second factor

- **Given** a user with MFA enabled and no trusted device
- **When** they sign in with the correct password
- **Then** the response is `{ twoFactorRedirect: true }` with a two-factor cookie, no session row is created, and `GET /api/auth/get-session` returns `null`.

### AC-004-05 — TOTP challenge

- **Given** the state of AC-004-04
- **When** a valid TOTP code is submitted
- **Then** a session is created and the session cookie is set.
- **When** an invalid code is submitted instead
- **Then** the API returns an error, no session exists, and `auth.mfa.challenge_failed` is recorded.

### AC-004-06 — Lockout

- **Given** 10 consecutive invalid second-factor attempts for the account
- **When** the 11th attempt uses a **valid** code
- **Then** it is still rejected until `lockedUntil` has passed (test: move `lockedUntil` to the past → valid code succeeds).

### AC-004-07 — Backup codes are single-use

- **Given** a user with MFA and their 10 backup codes
- **When** they complete a sign-in with backup code #1
- **Then** a session is created and `auth.mfa.backup_code_used` is recorded.
- **When** they later try backup code #1 again in a new sign-in
- **Then** it is rejected and no session is created, while backup code #2 still works.

### AC-004-08 — Regenerating backup codes invalidates old ones

- **When** the user regenerates codes with their password
- **Then** every previous code is rejected, the new codes work, `auth.mfa.backup_codes_regenerated` is recorded, and a notification is sent. A wrong password returns `400` and keeps the old codes valid.

### AC-004-09 — Trusted device

- **Given** a sign-in completed with `trustDevice: true`
- **When** the same cookie jar signs out and signs in again within 7 days
- **Then** no second factor is requested. A different cookie jar still gets `twoFactorRedirect`.

### AC-004-10 — Disable MFA

- **Given** a `USER` with MFA enabled
- **When** they disable MFA with the correct password
- **Then** `twoFactorEnabled` becomes `false`, the next sign-in has no challenge, `auth.mfa.disabled` is recorded, and a notification is sent.

### AC-004-11 — Platform admins cannot disable MFA

- **Given** a `PLATFORM_ADMIN` with MFA enabled
- **When** they call `two-factor/disable` with the correct password
- **Then** the API returns `403 MFA_REQUIRED_FOR_ROLE` and MFA stays enabled.

### AC-004-12 — Change password

- **Given** a user signed in with cookie jars A and B
- **When** A calls `change-password` with the correct current password and `revokeOtherSessions: true`
- **Then** the new password works, B is rejected on its next request, A stays signed in, `auth.password.changed` is recorded, and a notification email is sent. A wrong current password returns `400` and changes nothing. A compromised new password returns `PASSWORD_COMPROMISED`.

### AC-004-13 — Re-authentication for stale sessions

- **Given** a session created more than 1 h ago (test: `session.createdAt` moved back)
- **When** the user calls `GET /api/auth/list-sessions`
- **Then** the API returns `403 SESSION_NOT_FRESH`. After the documented re-authentication procedure (sign-in + TOTP if enabled, then `revoke-session` with the previous token), `list-sessions` succeeds and the superseded session no longer exists.

### AC-004-14 — Secrets never leak

- **When** `GET /api/auth/get-session` and `GET /api/auth/list-sessions` are called for an MFA user
- **Then** neither response contains the TOTP secret or any backup code, and the `twoFactor.secret` column does not equal the base32 secret from the `totpURI` (stored encrypted). No log line produced during enrollment and challenge contains the secret, the `totpURI`, a TOTP code or a backup code.

### AC-004-15 — OTP paths are disabled

- **When** `POST /api/auth/two-factor/send-otp` is called
- **Then** the response is `404`.

### AC-004-16 — [P1] Operator MFA reset

- **Given** a user with MFA enabled and two active sessions
- **When** an operator runs `mfa:reset --email <email> --reason "lost device, identity verified"` and confirms
- **Then** `twoFactorEnabled` is `false`, the `twoFactor` row is gone, both sessions are rejected, and `admin.user.mfa_reset` (actor `SYSTEM`, reason in metadata) is recorded. Without confirmation, nothing changes.

## Test cases

### Unit

| ID | Test |
| --- | --- |
| UT-004-01 | TOTP helper computes the same code as an RFC 6238 reference vector. |
| UT-004-02 | `MFA_REQUIRED_FOR_ROLE` hook: admin → throws; user → passes. |
| UT-004-03 | Hook branch selection for `verify-totp`: enrollment (session) vs challenge (no session). |
| UT-004-04 | Notification label mapping for the four security events. |

### Integration

| ID | Test | AC |
| --- | --- | --- |
| IT-004-01 | Enable with a wrong password | AC-004-01 |
| IT-004-02 | Enable without verification → no challenge at sign-in | AC-004-02 |
| IT-004-03 | Verify TOTP computed from the URI; audit + Mailpit notification | AC-004-03 |
| IT-004-04 | MFA sign-in returns `twoFactorRedirect`, 0 sessions | AC-004-04 |
| IT-004-05 | Valid/invalid TOTP challenge + audit | AC-004-05 |
| IT-004-06 | 10 failures → locked → unlock by time manipulation | AC-004-06 |
| IT-004-07 | Backup code reuse rejected; next code valid | AC-004-07 |
| IT-004-08 | Regenerate invalidates the old set | AC-004-08 |
| IT-004-09 | Trusted-device cookie skips the challenge; another cookie jar doesn't | AC-004-09 |
| IT-004-10 | Disable flow + audit + notification | AC-004-10 |
| IT-004-11 | Admin disable → 403 | AC-004-11 |
| IT-004-12 | Change password: revoke others, wrong current password, HIBP | AC-004-12 |
| IT-004-13 | `SESSION_NOT_FRESH` + re-authentication procedure | AC-004-13 |
| IT-004-14 | Response/DB/log inspection for secrets | AC-004-14 |
| IT-004-15 | `/two-factor/send-otp` → 404 | AC-004-15 |
| IT-004-16 | [P1] `mfa:reset` CLI (child process) | AC-004-16 |

### API end-to-end

| ID | Test | AC |
| --- | --- | --- |
| **E2E-JOURNEY-04** | Against the running server and worker: enable MFA → verify with a computed TOTP → notification in Mailpit → sign out → sign in with TOTP → sign out → sign in with a backup code → sign out → reuse of the same backup code is rejected | AC-004-03, 05, 07 |

## Implementation notes

- Hooks live in `packages/auth/src/mfa-hooks.ts`; notification labels and the notifier in `security-notifications.ts` (also used for the password-reset notice).
- The caller is resolved in `hooks.before`: the session user, or, during a sign-in challenge, the user of the signed two-factor cookie. `auth.mfa.challenge_failed` therefore targets the challenged account, with only the method and the native error code.
- Verified native behavior (README §7.3, §7.3.1): enrollment confirmation replaces the session; a challenge allows 5 attempts (`TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE`), and 10 consecutive failures lock the factor (`429 ACCOUNT_TEMPORARILY_LOCKED`). AC-004-06 is tested with two challenges of 5 failures.
- The TOTP helper (`apps/server/test/support/totp.ts`) is a small RFC 6238 implementation checked against the RFC vectors (UT-004-01).
- Log secrecy (AC-004-14) is covered by the redaction unit test, which includes `totpURI`, `code` and `backupCodes`.
- E2E-JOURNEY-04 is delivered with the API end-to-end harness in UM-008; its steps are covered by IT-004-03/05/07.

## Definition of Done

- [ ] Global Definition of Done (README §20) satisfied.
- [x] All AC-004-xx automated and green (AC-004-16 if the P1 task is done).
- [ ] Manual check: the `totpURI` scanned (as a QR code generated locally) into two real authenticator apps produces accepted codes; issuer shows "REDOVA".
- [ ] All four security-notification variants render correctly (Mailpit screenshots).
