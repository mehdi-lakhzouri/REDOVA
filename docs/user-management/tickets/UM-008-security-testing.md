# UM-008 — Security Audit, Integration Tests & Hardening

| Field | Value |
| --- | --- |
| Ticket ID | UM-008 |
| Title | Security Audit, Integration Tests & Hardening |
| Priority | **P0** (tasks marked **[P1]** are stretch) |
| Story points | **8** |
| Dependencies | UM-005, UM-007 (and transitively all previous tickets) |
| Blocks | Release of the User Management backend |
| References | README §17, §18.3, §19, §20; [GIT-STRATEGY.md](../../GIT-STRATEGY.md) §8, §11 |

## User story

**As an** organization owner and auditor relying on REDOVA for security work,
**I want** every privileged action to be traceable through the API, the platform hardened against common web attacks, and its security guarantees proven by automated tests,
**so that** I can trust REDOVA with my AI agents' vulnerability data and prove compliance to my own auditors.

## Business objective

Make BO-4 (traceability) available to customers and administrators through the API. Prove BO-2, BO-3 and BO-5 with a consolidated, automated security suite that maps every security requirement (SR-01…SR-12) to tests, so the module can be released and defended with evidence.

## Scope

### In scope

- **Audit read API** (REDOVA conventions): platform scope and organization scope, cursor-paginated, filterable.
- **Audit catalog completeness:** every action of README §17.4 is produced exactly once by its trigger.
- **Per-account sign-in throttle** (Redis), with audit `auth.sign_in.throttled` **[P1]**.
- **Hardening:** production-profile checks (cookies, docs routes, headers, error masking), CORS absence, dependency audit, secret scanning, lint rules.
- **Consolidated security suite** (`*.security.spec.ts`) and **traceability**: README §17.2 gains a "Verified by" column with test IDs.
- **CI:** integration and API end-to-end jobs (server + worker + PostgreSQL + Redis + Mailpit), `security` job (`pnpm audit`, gitleaks), all required for merge.
- Final threat-model review (README §17.1) with sign-off.

### Out of scope

- Audit export (CSV/JSON), retention/purge jobs, SIEM forwarding (future).
- Penetration test by a third party (future; this ticket prepares the evidence).
- Any UI (backend-only phase).

## Implementation tasks

### Audit read API (`apps/server`, `packages/db`, `packages/contracts`)

- [x] `AuditEventQuery` DTO: `action` (enum, optional, repeatable), `outcome`, `actorUserId` (platform only), `from`/`to` (ISO dates, `to - from` ≤ 90 days), `limit`, `cursor`.
- [x] `AuditEventDto`: `id`, `occurredAt`, `action`, `outcome`, `actorType`, `actor` (`{ id, name, email }` resolved by batch lookup; `null` for SYSTEM/ANONYMOUS or deleted users), `targetType`, `targetId`, `ipAddress`, `userAgent`, `requestId`, `metadata` (allow-listed keys only).
- [x] `AuditEventRepository.list({ scope, organizationId?, filters, cursor, limit })`: `orderBy: { id: "desc" }` (UUIDv7), Prisma cursor. Platform scope = **all** events, including organization ones (admin oversight). Organization scope = `where organizationId = :organizationId` **always**.
- [x] `GET /api/v1/admin/audit-events` → `@PlatformAdmin()`.
- [x] `GET /api/v1/organizations/:organizationId/audit-events` → `@RequireOrgPermission({ auditLog: ["read"] })`, tenant from `@Tenant()` only.
- [x] Apply `describeTenantIsolation` (UM-006) to the organization audit endpoint.
- [x] OpenAPI documentation.

### Audit completeness

- [x] `audit-catalog.security.spec.ts`: a table mapping each `AuditAction` → a trigger function (reusing the factories), asserting exactly one matching row with correct `actorType`, `actorUserId`, `organizationId`, `targetType` and `outcome`. Fails if an enum value has no mapping.
- [x] Metadata allow-list per action in `packages/contracts` (`auditMetadataSchemas`). `AuditService.record` rejects unknown keys in test and strips them in production with a warning log.

### Per-account sign-in throttle **[P1]**

- [x] `hooks.before` matcher `/sign-in/email`: key `signin-fail:{sha256(lowercase(email))}`; if the failure count ≥ 10 → `APIError(429, { code: "TOO_MANY_ATTEMPTS", message: generic })` + audit `auth.sign_in.throttled`.
- [x] `hooks.after` matcher `/sign-in/email`: on `APIError` with `INVALID_EMAIL_OR_PASSWORD` → `INCR` + `EXPIRE … 900 NX` (atomic, reusing the UM-001 Redis script helper); on success → `DEL`.
- [x] Applies identically to unknown emails (anti-enumeration).

### Hardening

- [ ] Verify the `helmet` configuration (README §17.5); no `Access-Control-Allow-Origin` header on any `/api/*` response (CORS not enabled in this phase); `x-powered-by` disabled.
- [ ] ESLint: forbid `console.log` in `apps/server` / `apps/worker` (logger only); forbid `findUnique` on tenant-owned models without a reviewed exception comment (custom `no-restricted-syntax` rule) **[P1]**.
- [ ] `pnpm audit --prod --audit-level=high` in CI (fails the build). Exceptions documented with an expiry date.
- [ ] gitleaks in CI on every PR (GIT-STRATEGY §11).
- [ ] Production-mode test profile: start the server with `NODE_ENV=production` + HTTPS `BETTER_AUTH_URL` and assert the cookie `__Secure-redova.session_token` with `Secure`, docs routes (`/api/v1/docs`, `/api/auth/reference`) → 404, HSTS present, error masking.

### Security suite and traceability

- [ ] Create `apps/server/test/security/` with one `*.security.spec.ts` per SR (README §17.2), reusing scenarios from earlier tickets where they exist (import shared scenarios; no copy-paste).
- [ ] Add the "Verified by" column to README §17.2 (test IDs) and confirm the "Verified by" references in §17.1.
- [ ] Threat-model review: walk through T1–T16, confirm the control and the test for each, record residual risks in README §17.1.

### CI

- [ ] Jobs: `lint-typecheck-unit` → `integration` (services: postgres, redis, mailpit) → `e2e` (built server + worker started; API journeys; logs uploaded on failure) → `security` (pnpm audit, gitleaks) → `git-hygiene` (from UM-001). All required for merging into `master` (GIT-STRATEGY §8).

### Delivery

UM-008 ships in several PRs that reference the ticket: (1) audit read API, metadata allow-list, catalog completeness and per-account throttle; (2) hardening and the consolidated security suite with traceability; (3) API end-to-end harness, CI `e2e` and `security` jobs and coverage reporting.

Notes for part 1:

- The metadata allow-list is a key list per action (`AUDIT_METADATA_KEYS`), not a schema per action: values are already constrained by the audit input schema.
- Single-event routes (`…/audit-events/{eventId}`) were added for both scopes, so the tenant isolation kit can check item access (TENANT-ISO-02).
- The per-account throttle shares the `RATE_LIMIT_ENABLED` switch and only runs with Redis.

## Affected monorepo packages/apps

`apps/server`, `apps/worker` (lint rule), `packages/db`, `packages/contracts`, `packages/auth` (throttle hooks), CI configuration, `docs/user-management/README.md` (traceability).

## Database changes

None. Existing indexes on `audit_event` (`organizationId, id`), (`actorUserId, id`), (`action, id`) support the queries.

## Frontend requirements

None (backend-only phase).

## Backend requirements

- Audit endpoints are read-only. No endpoint can modify or delete audit events (also enforced by the trigger).
- Organization-scope queries always include `organizationId` from `TenantContext`.
- Metadata returned only through the allow-list schema.

## Security considerations

- **Audit confidentiality:** organization audit logs are readable only by `ORG_OWNER`, `ORG_ADMIN` and `AUDITOR` of **that** organization. Platform logs are readable only by `PLATFORM_ADMIN` with MFA. IPs and user agents are personal data, so access is restricted; future retention is noted.
- **Audit integrity:** append-only trigger (UM-001), no update/delete endpoint, writes include the request id for log correlation.
- **No sensitive data in audit:** enforced by metadata allow-lists and the catalog test.
- **Throttle anti-enumeration:** same counter behavior and same response for existing and unknown emails. The counter key is a hash, so raw emails are not stored in Redis.
- **Supply chain:** dependency audit and secret scanning are required merge checks.

## Acceptance criteria

### Audit trail

#### AC-008-01 — Platform audit log

- **Given** events from several users and organizations
- **When** a `PLATFORM_ADMIN` with MFA calls `GET /api/v1/admin/audit-events?action=admin.user.banned&limit=10`
- **Then** the response is a paginated envelope containing only `admin.user.banned` events, newest first, each with a resolved actor and no metadata keys outside the allow-list.

#### AC-008-02 — Organization audit log is tenant-scoped

- **Given** organizations A and B, each with events
- **When** an `AUDITOR` of A calls `GET /api/v1/organizations/{A}/audit-events`
- **Then** only events with `organizationId = A` are returned. The same call with `{B}` returns `404 ORGANIZATION_NOT_FOUND`. A `VIEWER` of A gets `403 FORBIDDEN_PERMISSION`. The `describeTenantIsolation` kit passes for this endpoint.

#### AC-008-03 — Cursor and filters

- **Given** 120 events in organization A
- **When** the log is walked with `limit=50`
- **Then** 50, 50 and 20 events are returned without duplicates. A date range over 90 days returns `400 VALIDATION_FAILED`, and a tampered cursor returns `400 INVALID_CURSOR`.

#### AC-008-04 — Catalog completeness (SR-12)

- **When** the catalog test triggers each action listed in README §17.4
- **Then** each produces exactly one audit event with the expected scope, actor, target and outcome, and every `AuditAction` enum value is covered.

#### AC-008-05 — Audit events are immutable through every path

- **When** any authenticated user (including a `PLATFORM_ADMIN`) sends `PUT`, `PATCH` or `DELETE` to any audit URL
- **Then** the response is `404` or `405`, and a direct SQL `UPDATE`/`DELETE` fails (trigger).

### Rate limiting and anti-enumeration (SR-09)

#### AC-008-06 — [P1] Per-account throttle

- **Given** 10 failed sign-ins for `alice@acme.io` within 15 minutes from **different** IPs
- **When** the 11th attempt is made with the **correct** password
- **Then** the response is `429 TOO_MANY_ATTEMPTS` with a generic message, and `auth.sign_in.throttled` is recorded. After the key expires (test: delete or shorten the TTL), the correct password succeeds and the counter is cleared.

#### AC-008-07 — [P1] Throttle does not reveal accounts

- **When** the same 11-attempt sequence targets an unknown email
- **Then** the responses (status, body, headers apart from timing) are identical to AC-008-06.

### Hardening checks

#### AC-008-08 — Security headers and CORS

- **When** any `/api/v1` response is fetched in the production profile
- **Then** it carries the headers in README §17.5 (including HSTS) with the specified values, has no `x-powered-by`, and no `/api/*` response has `Access-Control-Allow-Origin`, even for a request with a foreign `Origin`.

#### AC-008-09 — Production cookie and docs exposure

- **Given** the server started with `NODE_ENV=production` and an HTTPS `BETTER_AUTH_URL`
- **When** a user signs in
- **Then** the cookie is `__Secure-redova.session_token` with `Secure; HttpOnly; SameSite=Lax`, and `/api/v1/docs` and `/api/auth/reference` return `404`.

#### AC-008-10 — CSRF defenses (SR-10)

- **Given** a valid session cookie
- **When** a state-changing request is sent with a foreign `Origin` to (a) a Better Auth endpoint (`/api/auth/organization/update`) and (b) a REDOVA endpoint (`PUT /api/v1/admin/users/{id}/ban`)
- **Then** both are rejected (native origin check / `ORIGIN_NOT_ALLOWED`), and no state changes. A `text/plain` or form-encoded body is rejected on both surfaces.

#### AC-008-11 — Supply-chain gates

- **When** CI runs on a PR
- **Then** `pnpm audit --prod --audit-level=high` and gitleaks pass. A planted test secret (in a throwaway branch) makes gitleaks fail the build.

### Consolidated security requirements

#### AC-008-12 — Every security requirement is proven

- **Given** the security suite in `apps/server/test/security/`
- **When** CI runs
- **Then** each requirement below has at least one passing test, listed in README §17.2's "Verified by" column:

| SR | Requirement (short) | Minimum scenarios |
| --- | --- | --- |
| SR-01 | Unverified email restrictions | Sign-in denied; no session row; REDOVA guard rejects a forged verified-false session (DB manipulation) with `EMAIL_NOT_VERIFIED`; cannot create an organization or accept an invitation |
| SR-02 | Reset token expiry + single use | Expired → `INVALID_TOKEN`; reused → `INVALID_TOKEN`; not stored verbatim |
| SR-03 | Session revocation | Sign-out, revoke one, revoke others, admin revoke all → next request 401 |
| SR-04 | Ban enforcement | Existing sessions killed; new sign-in 403; expiry lifts ban; banned user's org access gone |
| SR-05 | MFA + backup code reuse | No session before second factor; lockout; backup code single use |
| SR-06 | Role escalation prevention | Global `role` injection ignored; org escalation matrix (UM-006); admin safeguards incl. concurrent demotion |
| SR-07 | Cross-organization denial | Contract kit on every tenant-scoped endpoint (org audit + test items); non-member → 404 |
| SR-08 | Membership verification per request | Removal/role change effective on next request |
| SR-09 | Rate limiting + anti-enumeration | Per-IP 429; per-account throttle; identical responses for sign-up, sign-in, reset |
| SR-10 | Secure cookies + CSRF | AC-008-09, AC-008-10 |
| SR-11 | No credential leakage | Response key scan across all REDOVA endpoints; native session/2FA responses free of secrets; log capture during full journeys contains no password, token, secret, TOTP code or backup code |
| SR-12 | Audit of privileged operations | AC-008-04 |

#### AC-008-13 — Full CI pipeline

- **When** a PR is opened
- **Then** the jobs `lint-typecheck-unit`, `integration`, `e2e`, `security` and `git-hygiene` run and are required for merge, E2E-JOURNEY-01…06 all pass, and server/worker logs are uploaded when a journey fails.

## Test cases

### Unit

| ID | Test |
| --- | --- |
| UT-008-01 | `AuditEventQuery` validation: date range ≤ 90 days, repeated `action` params, invalid enum. |
| UT-008-02 | Metadata allow-list: unknown keys rejected (test env) or stripped (production). |
| UT-008-03 | Throttle key derivation (lower-casing, hashing, no raw email). |
| UT-008-04 | Actor resolution for USER, SYSTEM, ANONYMOUS and deleted users. |

### Integration

| ID | Test | AC |
| --- | --- | --- |
| IT-008-01 | Platform audit list + filter + allow-listed metadata | AC-008-01 |
| IT-008-02 | Org audit scoping, 404/403, contract kit | AC-008-02 |
| IT-008-03 | Cursor walk 120 events; range and cursor validation | AC-008-03 |
| IT-008-04 | Audit catalog completeness | AC-008-04 |
| IT-008-05 | No mutating audit routes; trigger | AC-008-05 |
| IT-008-06 | Per-account throttle across IPs; reset on expiry/success | AC-008-06 |
| IT-008-07 | Throttle parity for unknown emails | AC-008-07 |
| IT-008-08 | Header and CORS assertions (production profile) | AC-008-08 |
| IT-008-09 | Production cookie + docs 404 | AC-008-09 |
| IT-008-10 | CSRF on both API surfaces; non-JSON bodies | AC-008-10 |
| SEC-01 … SEC-12 | One security spec per SR (table above) | AC-008-12 |

### API end-to-end

| ID | Test | AC |
| --- | --- | --- |
| E2E-008-01 | After an invitation and a role change in organization A, an `AUDITOR` of A reads both events from the org audit endpoint; a `PLATFORM_ADMIN` reads `admin.user.banned` after JOURNEY-05 | AC-008-01, 02 |
| E2E suite | E2E-JOURNEY-01 … 06 run together in CI | AC-008-13 |

### CI / tooling

| ID | Check | AC |
| --- | --- | --- |
| CI-008-01 | `pnpm audit` gate | AC-008-11 |
| CI-008-02 | gitleaks gate (planted-secret dry run) | AC-008-11 |

## Definition of Done

- [ ] Global Definition of Done (README §20) satisfied.
- [ ] All AC-008-xx automated and green (P1 items either done or explicitly moved to the next sprint with the owner's agreement).
- [ ] README §17.1 and §17.2 updated with "Verified by" test IDs, and residual risks recorded.
- [ ] Coverage targets of README §19.3 met and reported in CI.
- [ ] All six API journeys pass in CI on `master`.
- [ ] Security sign-off: threat-model walkthrough completed and recorded in the PR description. This evidence pack is reused in the PFE report.
