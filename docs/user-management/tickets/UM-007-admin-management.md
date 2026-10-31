# UM-007 — Admin User Management

| Field | Value |
| --- | --- |
| Ticket ID | UM-007 |
| Title | Admin User Management |
| Priority | **P1** |
| Story points | **5** |
| Dependencies | UM-004 (MFA), UM-006 (`@PlatformAdmin`, `@PlatformAdminMutation`, guards) |
| Blocks | UM-008 |
| References | README §4.2, §4.6, §9.2, §9.3, §14, §18 |

## User story

**As a** REDOVA platform administrator,
**I want** to find any account, see its security state, suspend or reinstate it, sign it out everywhere and manage who else is a platform administrator through the API,
**so that** I can respond immediately to abuse or a compromised account without touching the database.

## Business objective

Stop compromised or abusive accounts immediately (BO-5), with every administrative action protected by MFA and recent authentication (BO-3) and fully audited (BO-4). This is the reference implementation of the REDOVA API conventions: envelope, cursor pagination, idempotent state endpoints.

## Scope

### In scope

- REDOVA admin API (README §18.6): list/search users (cursor), user details, ban/unban, change global role, list sessions, revoke one/all sessions.
- Custom safeguards: no self role change, no demotion of the last `PLATFORM_ADMIN` (concurrency-safe), no ban of a `PLATFORM_ADMIN`.
- Idempotent semantics without duplicate audit events.
- Bootstrap CLI `admin:promote`.
- Audit events: `admin.user.banned`, `admin.user.unbanned`, `admin.user.role_changed`, `admin.user.session_revoked`, `admin.user.sessions_revoked`, `admin.bootstrap.promoted`.

### Out of scope

- Create, edit, delete users; set passwords; impersonation (not granted, HTTP paths disabled).
- Admin view of organizations (future).
- Platform audit log API (UM-008). Any UI (backend-only phase).

## Implementation tasks

### `packages/core`

- [x] `admin-policies.ts`:
  - `canChangeGlobalRole({ actorId, targetId, targetCurrentRole, newRole, platformAdminCount })` → `ADMIN_SELF_ROLE_CHANGE_FORBIDDEN` | `LAST_PLATFORM_ADMIN` | ok.
  - `canBanUser({ actorId, targetId, targetRole })` → native self-ban check is kept, plus `ADMIN_TARGET_IS_PLATFORM_ADMIN`.

### `packages/contracts`

- [x] Zod DTOs: `AdminUserListQuery` (`q` ≤ 100 chars, `status` `active|banned`, `role`, `limit`, `cursor`), `AdminUserSummary` (`id`, `name`, `email`, `emailVerified`, `role`, `banned`, `banExpires`, `twoFactorEnabled`, `createdAt`), `AdminUserDetail` (+ `banReason`, `membershipCount`, `activeSessionCount`), `AdminSession` (`id`, `createdAt`, `updatedAt`, `expiresAt`, `ipAddress`, `userAgent`, **no token**), `BanUserBody` (`reason` 10–500, `expiresInDays` 1 \| 7 \| 30 \| null), `SetRoleBody` (`role: GlobalRole`). Output schemas are `strict()`.

### `packages/db`

- [x] `UserQueryRepository.list({ q, status, role, limit, cursor })`: Prisma native cursor (`take: limit + 1`, `cursor: { id }`, `skip: 1`, `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`). `q` = case-insensitive prefix on email or name. Explicit `select`, so `account`/password data is never read.
- [x] `UserQueryRepository.getDetail(id)`, `countPlatformAdmins()`, `findSessionTokenForUser(sessionId, userId)`.

### `apps/server` — `AdminModule`

- [x] `AdminUsersController` (all routes `@PlatformAdmin()`; mutations `@PlatformAdminMutation()`):

| Route | Behavior |
| --- | --- |
| `GET /api/v1/admin/users` | Repository list → paginated envelope. |
| `GET /api/v1/admin/users/:userId` | Detail or `404 USER_NOT_FOUND`. |
| `PUT /api/v1/admin/users/:userId/ban` | Policy check → if already banned with the same reason/expiry → `200` no-op (no audit); else `auth.api.banUser({ headers, body: { userId, banReason, banExpiresIn } })` → audit `admin.user.banned` with `metadata: { expiresInDays }` (reason stored in `user.banReason`, **not** copied into audit metadata) → `200` with `AdminUserDetail`. |
| `DELETE /api/v1/admin/users/:userId/ban` | Not banned → `204` (no audit); else `auth.api.unbanUser` → audit `admin.user.unbanned` → `204`. |
| `PUT /api/v1/admin/users/:userId/role` | Inside `prisma.$transaction` holding `pg_advisory_xact_lock(hashtext('redova:platform-admin-role'))`: count admins → policy check → same role → `200` no-op; else `auth.api.setRole` → audit `admin.user.role_changed` `{ previousRole, newRole }` → `200`. The lock serializes concurrent role changes, so two admins cannot demote each other at the same moment and leave zero admins. |
| `GET /api/v1/admin/users/:userId/sessions` | `auth.api.listUserSessions` → map to `AdminSession[]` (strip tokens) → envelope with `meta.pagination: null` (bounded collection). |
| `DELETE /api/v1/admin/users/:userId/sessions` | `auth.api.revokeUserSessions` → audit `admin.user.sessions_revoked` (`metadata.count`, written only when count > 0) → `204`. |
| `DELETE /api/v1/admin/users/:userId/sessions/:sessionId` | Resolve the token with `findSessionTokenForUser`; not found or another user's session → `404 SESSION_NOT_FOUND`; `auth.api.revokeUserSession({ sessionToken })` → audit `admin.user.session_revoked` → `204`. |

- [x] All `auth.api.*` calls forward the caller's headers, so Better Auth re-checks the admin permission natively (defense in depth). Native `APIError`s are mapped by the exception filter.
- [x] OpenAPI documentation for every route (request/response schemas, error codes).
- [x] CLI `admin:promote --email <email> [--force]` (`apps/server/src/cli`): the user must exist and be verified; refuses if a `PLATFORM_ADMIN` exists unless `--force`; sets `role = PLATFORM_ADMIN`; audit `admin.bootstrap.promoted` (actor `SYSTEM`, `metadata.forced`). Prints a reminder that MFA enrollment is required before any admin API works.

## Affected monorepo packages/apps

`apps/server` (AdminModule, CLI), `packages/core`, `packages/contracts`, `packages/db`.

## Database changes

None. The `user @@index([createdAt, id])` from UM-001 supports the cursor query. `audit_event` rows are written.

## Frontend requirements

None (backend-only phase).

## Backend requirements

- Envelope on every response. `PUT` returns the resulting resource and `DELETE` returns `204`.
- Cursor list: deterministic order, `limit` ≤ 100, `INVALID_CURSOR` on tampering.
- No session token, password hash, TOTP secret or backup code in any admin response.
- Idempotent repeats return the same final state and write **no** additional audit event.

## Security considerations

- **Native admin endpoints are not reachable over HTTP** (`disabledPaths`, UM-001), so every admin action goes through these guards: role (native `@Roles`), MFA, fresh session for mutations, origin check, safeguards, audit.
- **Defense in depth:** Better Auth re-checks the admin permission on every forwarded `auth.api.*` call.
- **Ban is immediate:** native `banUser` deletes all sessions, and cookie cache is disabled, so the next request is rejected.
- **No token disclosure:** sessions are exposed by id; tokens are resolved server-side and checked to belong to `:userId`.
- **Ban reason confidentiality:** visible to admins only; banned users get the generic message; the reason is not copied into audit metadata (admins can read it on the user).
- **Lockout prevention:** the last `PLATFORM_ADMIN` cannot be demoted (advisory lock against races); admins cannot be banned or change their own role.
- **Bootstrap safety:** `admin:promote` refuses a second bootstrap unless `--force`, and both cases are audited.

## Acceptance criteria

### AC-007-01 — Only MFA-enabled platform admins can use the admin API

- **When** `GET /api/v1/admin/users` is called by a `USER`, by a `PLATFORM_ADMIN` without MFA, and by a `PLATFORM_ADMIN` with MFA
- **Then** the responses are `403 FORBIDDEN_PERMISSION`, `403 MFA_ENROLLMENT_REQUIRED` and `200` respectively.

### AC-007-02 — Cursor pagination

- **Given** 45 users
- **When** an admin requests `limit=20` three times following `nextCursor`
- **Then** the pages contain 20, 20 and 5 users, with no duplicates and no gaps, ordered by `createdAt` descending. `hasMore` is `true`, `true`, `false`, and the last `nextCursor` is `null`. A modified cursor returns `400 INVALID_CURSOR`.

### AC-007-03 — Search and filters

- **When** the admin searches `q=ali` with `status=banned`
- **Then** only banned users whose email or name starts with "ali" (case-insensitive) are returned.

### AC-007-04 — No sensitive fields

- **When** any admin endpoint returns user or session data
- **Then** the JSON contains no `password`, `token`, `secret` or `backupCodes` keys, and validates against the strict Zod output schema.

### AC-007-05 — Ban is enforced immediately

- **Given** Bob is signed in with two cookie jars
- **When** an admin (MFA, fresh session) bans him for 7 days with reason "Credential stuffing source"
- **Then** the response is `200` with `banned: true` and `banExpires` ≈ now + 7 days, Bob's next request with either cookie jar gets `401`, his sign-in attempts get `403 BANNED_USER` with the generic message (no reason), and exactly one `admin.user.banned` audit event exists.

### AC-007-06 — Ban is idempotent

- **When** the same ban request is sent again
- **Then** the response is `200` with the same state, and no second `admin.user.banned` event is written.

### AC-007-07 — Ban safeguards

- **When** an admin tries to ban themselves or another `PLATFORM_ADMIN`
- **Then** the responses are, respectively, the native self-ban error (mapped) and `403 ADMIN_TARGET_IS_PLATFORM_ADMIN`, and no state changes.

### AC-007-08 — Unban

- **Given** Bob is banned
- **When** the admin calls `DELETE …/ban`
- **Then** the response is `204`, Bob can sign in again, and `admin.user.unbanned` is recorded. Repeating the call returns `204` without a new audit event.

### AC-007-09 — Temporary ban expires

- **Given** Bob's `banExpires` is moved into the past (test manipulation)
- **When** he signs in
- **Then** sign-in succeeds and his ban fields are cleared (native behavior).

### AC-007-10 — Global role changes and safeguards

- **Given** exactly one `PLATFORM_ADMIN` (Ada) and a `USER` (Carl)
- **When** Ada promotes Carl
- **Then** Carl becomes `PLATFORM_ADMIN` and `admin.user.role_changed` is recorded. Carl gets `403 MFA_ENROLLMENT_REQUIRED` on admin APIs until he enables MFA.
- **When** Ada tries to change her own role
- **Then** the response is `403 ADMIN_SELF_ROLE_CHANGE_FORBIDDEN`.
- **When** Ada and Carl, the only two admins, send requests demoting each other **concurrently**
- **Then** exactly one request succeeds, the other returns `409 LAST_PLATFORM_ADMIN`, and exactly one `PLATFORM_ADMIN` remains.

### AC-007-11 — Recent authentication for mutations

- **Given** an admin with MFA whose session is older than 1 h
- **When** they call any admin mutation
- **Then** the response is `403 REAUTHENTICATION_REQUIRED` and nothing changes. `GET` endpoints still work. After re-authenticating (README §5.5), the same mutation succeeds.

### AC-007-12 — Session listing and revocation

- **Given** Bob has sessions S1 and S2
- **When** the admin lists them
- **Then** two items with `id`s and **no tokens** are returned.
- **When** the admin revokes S1 by id
- **Then** S1 is rejected on its next request, S2 still works, and `admin.user.session_revoked` is recorded.
- **When** the admin revokes a session id that belongs to another user under Bob's path
- **Then** the response is `404 SESSION_NOT_FOUND` and nothing is revoked.

### AC-007-13 — Global sign-out of a user

- **When** the admin calls `DELETE /api/v1/admin/users/{bob}/sessions`
- **Then** all of Bob's sessions are rejected on their next request, `admin.user.sessions_revoked` is recorded with the count, and a repeated call returns `204` without a new event.

### AC-007-14 — Cross-origin admin mutation blocked

- **When** a ban request with a valid admin cookie carries `Origin: https://evil.example`
- **Then** the response is `403 ORIGIN_NOT_ALLOWED` and the user is not banned.

### AC-007-15 — Native admin endpoints unreachable

- **When** an admin calls `POST /api/auth/admin/ban-user` directly
- **Then** the response is `404`.

### AC-007-16 — Bootstrap CLI

- **Given** no `PLATFORM_ADMIN` and a verified user `ada@redova.io`
- **When** `admin:promote --email ada@redova.io` runs
- **Then** Ada becomes `PLATFORM_ADMIN` and `admin.bootstrap.promoted` (actor `SYSTEM`) is recorded. Running it again for another user without `--force` exits non-zero and changes nothing. An unverified or unknown email exits non-zero.

## Test cases

### Unit

| ID | Test |
| --- | --- |
| UT-007-01 | `canChangeGlobalRole`: self, last admin, promotion, demotion with several admins. |
| UT-007-02 | `canBanUser`: self, admin target, user target. |
| UT-007-03 | `AdminSession` mapper strips the token; output schema is `strict()`. |
| UT-007-04 | Ban duration mapping (1/7/30 days → seconds; permanent → no expiry). |
| UT-007-05 | Idempotency decision functions (same state → no-op). |

### Integration

| ID | Test | AC |
| --- | --- | --- |
| IT-007-01 | Guard matrix on `GET /admin/users` | AC-007-01 |
| IT-007-02 | 45-user cursor walk; tampered cursor | AC-007-02 |
| IT-007-03 | Search + filters | AC-007-03 |
| IT-007-04 | Response key scan on all admin endpoints | AC-007-04 |
| IT-007-05 | Ban → both sessions 401, sign-in 403 generic, one audit | AC-007-05 |
| IT-007-06 | Repeat ban → no new audit | AC-007-06 |
| IT-007-07 | Self-ban and admin-ban refused | AC-007-07 |
| IT-007-08 | Unban + idempotent repeat | AC-007-08 |
| IT-007-09 | Expired ban lifted at sign-in | AC-007-09 |
| IT-007-10 | Role promotion, self-change refusal, and concurrent mutual demotion (two parallel requests, `Promise.all`) leaving exactly one admin | AC-007-10 |
| IT-007-11 | Stale session → `REAUTHENTICATION_REQUIRED` on mutations only | AC-007-11 |
| IT-007-12 | Session list (no tokens), revoke by id, foreign session id → 404 | AC-007-12 |
| IT-007-13 | Revoke all + idempotent repeat | AC-007-13 |
| IT-007-14 | Foreign origin → 403 | AC-007-14 |
| IT-007-15 | Native admin path → 404 | AC-007-15 |
| IT-007-16 | CLI bootstrap scenarios (child process) | AC-007-16 |

### API end-to-end

| ID | Test | AC |
| --- | --- | --- |
| **E2E-JOURNEY-05** | Against the running server: bootstrap admin via CLI → admin enables MFA → searches Bob → bans him for 1 day → Bob's existing cookie gets 401 → Bob's sign-in gets `BANNED_USER` → admin unbans → Bob signs in | AC-007-05, 08, 16 |

## Implementation notes

- Ban idempotency (`isSameBan`): same reason and same remaining duration in whole days. A retry minutes later is a no-op; the same request days later renews the ban.
- `UserQueryRepository.list` returns `INVALID_CURSOR` both for a malformed cursor and for a well-formed cursor whose anchor user does not exist.
- The role change runs `pg_advisory_xact_lock` in a Prisma interactive transaction; Better Auth's `setRole` commits before the lock is released, so the next request counts the new state (IT-007-10 runs both demotions with `Promise.all`).
- Integration tests use real TOTP enrollment for admins (`test/support/mfa.ts`), so re-authentication after a stale session is the real password + TOTP flow.
- E2E-JOURNEY-05 is delivered with the API end-to-end harness in UM-008; the demo script is in the PR description.

## Definition of Done

- [ ] Global Definition of Done (README §20) satisfied.
- [x] All AC-007-xx automated and green.
- [x] OpenAPI at `/api/v1/docs` shows all admin routes with request/response/error schemas.
- [x] Root README documents the `admin:promote` bootstrap step.
- [x] Demo script for the PFE defense (API calls for JOURNEY-05) written in the PR description.
