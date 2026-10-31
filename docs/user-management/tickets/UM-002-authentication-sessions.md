# UM-002 — Registration, Login & Session Management

| Field | Value |
| --- | --- |
| Ticket ID | UM-002 |
| Title | Registration, Login & Session Management |
| Priority | **P0** |
| Story points | **3** |
| Dependencies | UM-001 |
| Blocks | UM-003, UM-004 |
| References | README §5, §13, §15, §17.1 (T1–T3, T11), §17.4 |

## User story

**As a** security professional evaluating REDOVA,
**I want** to create an account, sign in, sign out, update my display name, and list and revoke my active sessions through the API,
**so that** I can access the platform securely and stay in control of every device signed in to my account.

## Business objective

Provide the entry point to the product (BO-1) with secure defaults: no account enumeration, breached-password rejection, rate limiting, and full session control (BO-5). Most behavior is native Better Auth. This ticket verifies it, wires the audit trail and builds the reusable test factories.

## Scope

### In scope

- Verification, through tests, of the native sign-up, sign-in, sign-out, update-user, list-sessions and revoke-session behavior configured in UM-001.
- Audit events: `auth.sign_up.completed`, `auth.session.created`, `auth.sign_in.failed`, `auth.sign_out`, `auth.session.revoked`.
- Test factories used by every later ticket: `createUser()`, `createVerifiedUser()`, `signInAs()` (cookie jar), `withOrigin()`.

### Out of scope

- Sending/resending verification emails (UM-003). Tests here assert that the `enqueueEmail` dependency is called, using a test double.
- MFA challenge (UM-004); per-account sign-in throttle (UM-008).
- Any UI (backend-only phase).

## Implementation tasks

- [x] `hooks.after` (matcher `/sign-in/email`): when `ctx.context.returned` is an `APIError`, record `auth.sign_in.failed` with `outcome: FAILURE`, `metadata: { reason: <native code>, emailHash: sha256(lowercase(email)) }`, and `targetId` = user id when the email exists. Never store the raw email or password.
- [x] `hooks.after` (matcher `/sign-out`): record `auth.sign_out`.
- [x] `hooks.after` (matchers `/revoke-session`, `/revoke-other-sessions`, `/revoke-sessions`): record `auth.session.revoked` with `metadata.scope` = `one` | `others` | `all`.
- [x] Confirm `databaseHooks.user.create.after` → `auth.sign_up.completed` and `databaseHooks.session.create.after` → `auth.session.created` (wired in UM-001), with `ipAddress`/`userAgent` taken from the session.
- [x] Hooks never throw into the auth flow: audit failures are logged (README §17.4).
- [x] Test factories in `apps/server/test/support/factories.ts` (they need `auth.api`, which `packages/db` may not import — README §3.3): user creation through `auth.api.signUpEmail`, DB email verification, `auth.api.signInEmail` returning cookie headers, default `Origin: WEB_ORIGIN` header.
- [x] Mocked HIBP helper (undici `MockAgent`) for the compromised-password tests.
- [x] README §15 (API client contract) checked against actual responses (status codes, error codes, `X-Retry-After`).

## Affected monorepo packages/apps

`packages/auth` (hooks), `packages/db` (test factories), `apps/server` (tests).

## Database changes

None. Writes go to the existing `user`, `account`, `session` and `audit_event` tables.

## Frontend requirements

None (backend-only phase).

## Backend requirements

- No new REDOVA endpoint. Flows use the native endpoints `/sign-up/email`, `/sign-in/email`, `/sign-out`, `/get-session`, `/update-user`, `/list-sessions`, `/revoke-session`, `/revoke-other-sessions`, `/revoke-sessions`.
- Audit hooks as listed above.

## Security considerations

- **Anti-enumeration:** with `requireEmailVerification: true`, duplicate sign-up returns the same response as a new sign-up (native, verified in source). Sign-in returns the same `INVALID_EMAIL_OR_PASSWORD` for an unknown email and for a wrong password.
- **Role fields cannot be set by clients:** `role`, `banned`, `banReason`, `banExpires`, `twoFactorEnabled` are `input: false` (native). Fully tested in UM-006, sanity-checked here.
- **Callback URLs:** `callbackURL` outside `trustedOrigins` is rejected natively.
- **Session cookies:** `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` + `__Secure-` prefix in production.
- **Audit metadata** never contains raw email, password or token values.

## Acceptance criteria

### AC-002-01 — Sign-up creates an unverified user without a session

- **Given** no account exists for `alice@acme.io`
- **When** `POST /api/auth/sign-up/email` is called with a valid name, that email and a 14-character non-breached password
- **Then** the API returns `200` without a session `Set-Cookie`, a `user` row exists with `emailVerified=false` and `role="USER"`, the `enqueueEmail` double received one `verify-email` job, and `audit_event` contains `auth.sign_up.completed`.

### AC-002-02 — Duplicate sign-up is indistinguishable

- **Given** `alice@acme.io` already exists
- **When** the sign-up endpoint is called again with that email
- **Then** the HTTP status and response body *shape* are identical to AC-002-01, and no second user is created.

### AC-002-03 — Password policy

- **When** sign-up is attempted with an 11-character password
- **Then** the API returns `400` with the native "password too short" code.
- **When** it is attempted with a password present in the (mocked) HIBP range
- **Then** the API returns `400 PASSWORD_COMPROMISED` and no user is created.
- **When** the (mocked) HIBP API is unreachable
- **Then** the API returns `500` and no user is created (fail-closed).

### AC-002-04 — Unverified users cannot sign in

- **Given** a user with `emailVerified=false` and a correct password
- **When** they sign in
- **Then** the API returns `403 EMAIL_NOT_VERIFIED`, no session row is created, no session cookie is set, and a new `verify-email` job is enqueued.

### AC-002-05 — Generic invalid-credential response

- **When** sign-in is attempted (a) with an unknown email and (b) with a known email and wrong password
- **Then** both return `401` with the identical code `INVALID_EMAIL_OR_PASSWORD` and message. Both write `auth.sign_in.failed`, case (b) with `targetId` set, and neither audit row contains the password or the raw email.

### AC-002-06 — Successful sign-in

- **Given** a verified user without MFA
- **When** they sign in with correct credentials
- **Then** the response sets `redova.session_token` with `HttpOnly`, `SameSite=Lax`, `Path=/` (and `Secure` with the `__Secure-` prefix when `NODE_ENV=production` and `BETTER_AUTH_URL` is HTTPS), a `session` row with IP and user agent exists, and `auth.session.created` is recorded.

### AC-002-07 — Untrusted callback URL is rejected

- **When** sign-up or sign-in is called with `callbackURL: "https://evil.example/x"`
- **Then** the request is rejected with a 4xx and no user or session is created. With `callbackURL` on `WEB_ORIGIN`, the request succeeds.

### AC-002-08 — Sign-out invalidates the session

- **Given** a signed-in user
- **When** they call `POST /api/auth/sign-out`
- **Then** their session row is deleted, `GET /api/auth/get-session` with the old cookie returns `null`, a REDOVA protected endpoint returns `401`, and `auth.sign_out` is recorded.

### AC-002-09 — Revoke other sessions

- **Given** the same user signed in with two cookie jars A and B (fresh sessions)
- **When** A calls `POST /api/auth/revoke-other-sessions`
- **Then** B's next `GET /api/auth/get-session` returns `null`, A remains signed in, and `auth.session.revoked` (scope `others`) is recorded.

### AC-002-10 — Revoke one session

- **Given** three sessions A, B, C
- **When** A lists sessions and revokes B's token
- **Then** B is rejected on its next request, while A and C still work.

### AC-002-11 — Banned user cannot sign in

- **Given** a verified user banned via `auth.api.banUser` (test setup)
- **When** they sign in with correct credentials
- **Then** the API returns `403 BANNED_USER` with the generic configured message (no ban reason), and no session is created.

### AC-002-12 — Sign-in rate limit

- **When** a 6th sign-in attempt is made from the same IP within 60 s
- **Then** the API returns `429` with an `X-Retry-After` header.

### AC-002-13 — Profile update cannot escalate

- **Given** a signed-in `USER`
- **When** they call `update-user` with `{ name: "Alice B", role: "PLATFORM_ADMIN" }`
- **Then** the request is rejected or the `role` field is ignored. In both cases `user.role` stays `USER`. A request with only `{ name }` updates the name.

## Test cases

### Unit

| ID | Test |
| --- | --- |
| UT-002-01 | Failed sign-in audit metadata builder: `emailHash` only, no `email`/`password` keys; hash is stable for case variants of the same email. |
| UT-002-02 | Revocation-scope mapper from matcher path to `one` / `others` / `all`. |

### Integration

| ID | Test | AC |
| --- | --- | --- |
| IT-002-01 | Sign-up creates unverified `USER`, no session cookie, email job captured, audit row | AC-002-01 |
| IT-002-02 | Duplicate sign-up: same status/shape; user count unchanged | AC-002-02 |
| IT-002-03 | Short password → 400; HIBP mocked compromised → `PASSWORD_COMPROMISED`; HIBP down → 500 | AC-002-03 |
| IT-002-04 | Unverified sign-in → 403, 0 sessions, email job captured | AC-002-04 |
| IT-002-05 | Unknown email vs wrong password → identical body; audit rows correct | AC-002-05 |
| IT-002-06 | Cookie attributes in dev and production configs | AC-002-06 |
| IT-002-07 | Untrusted `callbackURL` rejected on sign-up and sign-in | AC-002-07 |
| IT-002-08 | Sign-out → session deleted; protected REDOVA route 401 | AC-002-08 |
| IT-002-09 | Revoke others / revoke one across three sessions | AC-002-09, AC-002-10 |
| IT-002-10 | Banned sign-in → 403 `BANNED_USER`, generic message | AC-002-11 |
| IT-002-11 | 6th attempt → 429 + `X-Retry-After` | AC-002-12 |
| IT-002-12 | `update-user` with `role` → role unchanged | AC-002-13 |

### API end-to-end

| ID | Test | AC |
| --- | --- | --- |
| E2E-002-01 | Covered by the in-process "end-to-end flow" integration test; the black-box harness against running processes is introduced with the worker in UM-003. Against the running server: verified user (seeded) signs in → `get-session` → `update-user` name → `list-sessions` → `sign-out` → protected REDOVA call returns 401 | AC-002-06, AC-002-08 |

## Definition of Done

- [ ] Global Definition of Done (README §20) satisfied — coverage reporting (§19.3) is added to CI in UM-008.
- [x] All AC-002-xx automated and green.
- [x] Test factories documented (JSDoc + example) and used by UM-002 tests.
- [x] README §15 matches observed native responses.
