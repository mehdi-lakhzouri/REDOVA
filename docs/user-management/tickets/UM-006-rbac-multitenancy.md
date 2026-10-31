# UM-006 — RBAC & Multi-Tenant Authorization

| Field | Value |
| --- | --- |
| Ticket ID | UM-006 |
| Title | RBAC & Multi-Tenant Authorization |
| Priority | **P0** |
| Story points | **5** |
| Dependencies | UM-001 (tests create users and organizations through `auth.api.*`) |
| Blocks | UM-005, UM-007 |
| Execution note | Runs **before** UM-005 so that organization role management never ships without escalation rules. |
| References | README §8, §9, §10, §17.1 (T5–T7), §18.8 |

## User story

**As an** organization owner entrusting REDOVA with sensitive vulnerability data,
**I want** every request to be checked against my organization's membership and roles on the server, and nobody to be able to grant themselves more rights than they were given,
**so that** members of other organizations, or members with lower roles, can never read or change what they shouldn't.

## Business objective

Guarantee tenant isolation (BO-2) and least privilege across the platform. Provide reusable, tested authorization building blocks that every future module (Agent Registry, Assessments, Findings, Reports) must use.

## Scope

### In scope

- Pure policies in `packages/core`: organization role ranks, `canAssignOrgRole`, `canManageMember`, `isValidOrgRole`.
- Escalation enforcement in Better Auth (README §10.4): `organizationHooks.beforeCreateInvitation`; `hooks.before` on `/organization/update-member-role` and `/organization/remove-member`; `organizationId` required in those bodies.
- NestJS authorization building blocks in `apps/server`:
  - `OrgPermissionGuard` + `@RequireOrgPermission({ resource: [actions] })` → resolves membership from the DB, evaluates the shared access control, attaches `TenantContext`, maps to 404/403.
  - `@Tenant()` parameter decorator returning `TenantContext`.
  - `MfaRequiredGuard` (`user.twoFactorEnabled`) → `403 MFA_ENROLLMENT_REQUIRED`.
  - `FreshSessionGuard` (session age < `freshAge`) → `403 REAUTHENTICATION_REQUIRED`.
  - `EmailVerifiedGuard` (defense in depth) → `403 EMAIL_NOT_VERIFIED` — implemented as `requireSession()`, which every REDOVA guard calls (global guard ordering relative to the library AuthGuard is not guaranteed).
  - `OriginGuard` for non-GET REDOVA requests → `403 ORIGIN_NOT_ALLOWED`.
  - Composite decorators: `@PlatformAdmin()` = `@Roles(["PLATFORM_ADMIN"])` (native from `@thallesp/nestjs-better-auth`) + `MfaRequiredGuard`; `@PlatformAdminMutation()` = `@PlatformAdmin()` + `FreshSessionGuard` + `OriginGuard`.
- Audit `authz.access_denied` for 403 decisions of REDOVA guards.
- `tenantScoped(organizationId)` Prisma helper and the tenant data rules (README §10.3) in the server contributing guide.
- **Cross-tenant contract test kit** `describeTenantIsolation()` for current and future tenant-scoped endpoints.
- Full permission-matrix test (README §9.1 and §9.2), cell by cell.

### Out of scope

- Organization flows (UM-005), admin endpoints (UM-007), audit read endpoints (UM-008). Guards are proven with **test-only controllers** registered in the integration test module. Their first production consumers are UM-007 (admin guards) and UM-008 (`OrgPermissionGuard` on organization audit events).
- PostgreSQL Row-Level Security (future hardening). Any UI (backend-only phase).

## Implementation tasks

### `packages/core`

- [x] `org-roles.ts`: `ORG_ROLE_RANK` (`ORG_OWNER` 100, `ORG_ADMIN` 80, the others 10). `isValidOrgRole(value)`: exactly one known role, no comma.
- [x] `canAssignOrgRole({ actorRole, targetRole })`: owner → any role; admin → only rank < 80; others → none.
- [x] `canManageMember({ actorRole, actorMemberId, targetMemberId, targetRole, newRole? })`: implements R1, R3, R4 and R5 (self-promotion forbidden, self-demotion allowed). The last-owner rule (R2) is left to Better Auth (native).

### `packages/auth`

- [x] `organizationHooks.beforeCreateInvitation({ invitation, inviter, organization })`: load the inviter's `member` row for `organization.id`; reject invalid roles (`ORG_ROLE_INVALID`) and `!canAssignOrgRole` (`ORG_ROLE_ESCALATION_FORBIDDEN`).
- [x] `hooks.before` matcher `/organization/update-member-role`: require `body.organizationId` (`400 ORGANIZATION_ID_REQUIRED`); `getSessionFromCtx(ctx)` → actor; load actor member and target member (`body.memberId`) **within `body.organizationId`** (a target from another organization → let the native check fail, do not leak); validate `body.role`; apply `canManageMember` with `newRole`.
- [x] `hooks.before` matcher `/organization/remove-member`: same, with `body.memberIdOrEmail` resolved within the organization, without `newRole`.
- [x] `hasOrgPermission(role, permissions)` using `roles[role].authorize(permissions)` from the shared access control (single source of truth with Better Auth).

### `apps/server`

- [x] `TenantContext` type `{ userId, organizationId, memberId, role }` in `packages/contracts`.
- [x] `OrgPermissionGuard`: read `:organizationId` from route params only; query `member` by `(organizationId, userId)`; none → `NotFound(ORGANIZATION_NOT_FOUND)`; `!hasOrgPermission` → `Forbidden(FORBIDDEN_PERMISSION)` + audit `authz.access_denied` (`organizationId`, `metadata: { required, role }`); else set `request.tenant`.
- [x] `@RequireOrgPermission(permissions)` decorator (metadata + `UseGuards(OrgPermissionGuard)`), `@Tenant()` param decorator.
- [x] `MfaRequiredGuard`, `FreshSessionGuard` (reads `session.createdAt` + the auth config's `freshAge`), `EmailVerifiedGuard` (registered globally after the auth guard), `OriginGuard` (non-GET/HEAD/OPTIONS on `/api/v1/*`: `Origin` must equal `WEB_ORIGIN`; absent `Origin` + `Sec-Fetch-Site: same-origin` accepted; otherwise 403). All 403s audited as `authz.access_denied`.
- [x] `@PlatformAdmin()` and `@PlatformAdminMutation()` composite decorators.
- [x] `tenantScoped()` helper in `packages/db` + "Tenant data rules" section in the server contributing guide (README §10.3).
- [x] Test-only module `AuthzTestModule` (loaded only when `NODE_ENV=test`) exposing:
  - `GET /api/v1/organizations/:organizationId/__test/members-only` (`@RequireOrgPermission({ member: ["read"] })`),
  - `GET /api/v1/organizations/:organizationId/__test/audit` (`{ auditLog: ["read"] }`),
  - `GET /api/v1/organizations/:organizationId/__test/items` (cursor list) and `…/__test/items/:itemId`, backed by a test-only tenant-owned table, used to exercise the contract kit,
  - `GET|POST /api/v1/__test/admin` (`@PlatformAdmin()` / `@PlatformAdminMutation()`).
- [x] `test/tenant-isolation.kit.ts`: `describeTenantIsolation({ name, createResourceIn(orgId), getOne(orgId, id), list(orgId, cursor?) })` generating tests TENANT-ISO-01…04 (README §10.3).

## Affected monorepo packages/apps

`packages/core`, `packages/auth`, `packages/contracts`, `packages/db` (helper), `apps/server`.

## Database changes

None in the production schema. A **test-only** table `test_tenant_item(id, organizationId, createdAt)` is created by the integration test setup to exercise the contract kit. It must not be part of the production migrations.

## Frontend requirements

None (backend-only phase).

## Backend requirements

- Tenant always taken from the path parameter `organizationId`, never from `session.activeOrganizationId`, body or query.
- Membership read from the DB on every request (no caching).
- 404 for non-members, 403 for members lacking a permission.
- `PLATFORM_ADMIN` has no bypass in `OrgPermissionGuard`.

## Security considerations

- **Native vs custom:** Better Auth already protects the owner role and the last owner, and it rejects non-members on its own organization endpoints. This ticket adds what Better Auth does not provide: admin-to-admin escalation (R3/R4), self-promotion for non-owners (R5), single-role enforcement (R6), and REDOVA API guards.
- **Hook bypass risk:** the `hooks.before` rules depend on resolving the same organization as Better Auth. Requiring an explicit `organizationId` removes the ambiguity, and a test proves that omitting it is rejected.
- **Existence disclosure:** a non-member gets 404, never 403, for an organization's REDOVA resources.
- **Multi-client safety:** a request for organization A is evaluated against A, even if the session's active organization is B.
- **Global role injection:** `role` and other admin fields are `input: false` (native). Verified here at sign-up and update-user.
- **Origin check** complements `SameSite=Lax` for state-changing REDOVA requests.

## Acceptance criteria

### AC-006-01 — Permission matrix is exactly as documented

- **Given** the shared access-control definitions
- **When** every (role, resource, action) cell of README §9.1 and §9.2 is evaluated
- **Then** the result equals the matrix for every cell (✅ → allowed, — → denied; ⚖️ → allowed at matrix level, with rank rules tested separately).

### AC-006-02 — ORG_ADMIN cannot invite at or above their rank

- **Given** Alice is `ORG_ADMIN` of organization A
- **When** she invites `bob@x.io` as `ORG_ADMIN` or `ORG_OWNER`
- **Then** the API returns `403` (`ORG_ROLE_ESCALATION_FORBIDDEN`, or the native code for `ORG_OWNER`) and no invitation row is created.
- **When** she invites him as `SECURITY_ENGINEER`
- **Then** the invitation is created.

### AC-006-03 — ORG_ADMIN cannot promote or manage peers

- **Given** Alice and Carol are `ORG_ADMIN`s of organization A, and Dave is `VIEWER`
- **When** Alice changes Dave's role to `ORG_ADMIN`, changes Carol's role to `VIEWER`, or removes Carol
- **Then** each call returns `403 ORG_ROLE_ESCALATION_FORBIDDEN` and nothing changes.
- **When** Alice changes Dave's role to `AUDITOR` or removes Dave
- **Then** the operation succeeds.

### AC-006-04 — No self-promotion

- **Given** Erin is `SECURITY_ENGINEER` (no `member:update` permission) and Alice is `ORG_ADMIN`
- **When** Erin tries to set her own role to `ORG_ADMIN`
- **Then** the request is rejected with `403` (REDOVA hook or native permission check, whichever runs first) and her role is unchanged.
- **When** Alice tries to set her own role to `ORG_OWNER`
- **Then** the request is rejected with `403` and her role is unchanged.
- **When** Alice sets her own role to `VIEWER`
- **Then** it succeeds.

### AC-006-05 — Owners keep full control; the last owner is protected

- **Given** Olivia is the only `ORG_OWNER`
- **When**, before any promotion, Olivia tries to demote herself or leave
- **Then** the native last-owner error is returned.
- **When** she promotes Alice to `ORG_OWNER`
- **Then** it succeeds.

### AC-006-06 — Role values are validated

- **When** an invitation or role update uses `"ORG_ADMIN,VIEWER"`, `"admin"` or `"SUPERUSER"`
- **Then** the API rejects it (`ORG_ROLE_INVALID` or native `ROLE_NOT_FOUND`) and nothing is persisted.

### AC-006-07 — Explicit organization id required for member mutations

- **When** `update-member-role` or `remove-member` is called without `organizationId` in the body
- **Then** the API returns `400 ORGANIZATION_ID_REQUIRED`, even if the session has an active organization.

### AC-006-08 — Cross-organization access is denied as "not found"

- **Given** Bob is a member of organization B only
- **When** he calls `GET /api/v1/organizations/{A}/__test/members-only`
- **Then** the response is `404 ORGANIZATION_NOT_FOUND` in the envelope, identical to a request for a random non-existent organization id.

### AC-006-09 — Missing permission is forbidden and audited

- **Given** Vera is `VIEWER` of organization A
- **When** she calls `GET /api/v1/organizations/{A}/__test/audit` (requires `auditLog:read`)
- **Then** the response is `403 FORBIDDEN_PERMISSION` and one `authz.access_denied` audit event with `organizationId = A` exists. An `AUDITOR` gets `200`.

### AC-006-10 — Membership is re-checked on every request

- **Given** Dave, `VIEWER` of A, has a valid session and just accessed an A endpoint successfully
- **When** an owner removes him from A and he repeats the same request with the same session
- **Then** the response is `404 ORGANIZATION_NOT_FOUND`. A role change is likewise reflected on the very next request.

### AC-006-11 — Active organization does not drive REDOVA authorization

- **Given** Mia is `AUDITOR` in A and `VIEWER` in B, with active organization B
- **When** she calls the A audit test endpoint
- **Then** the decision uses her A role (`200`). Calling the B audit endpoint while the active organization is A returns `403`.

### AC-006-12 — Tenant isolation contract kit

- **Given** the test-only tenant item endpoints wired through `describeTenantIsolation`
- **When** the kit runs
- **Then** all four checks pass: (01) list in A never contains B items, (02) A's item fetched via B's path → 404, (03) a cursor obtained in B used on A's list returns only A items or `400 INVALID_CURSOR`, (04) a body/query `organizationId=B` on an A route is ignored or rejected.

### AC-006-13 — Platform admin guards

- **Given** a `USER`, a `PLATFORM_ADMIN` without MFA, a `PLATFORM_ADMIN` with MFA and an old session (> 1 h), and a `PLATFORM_ADMIN` with MFA and a fresh session
- **When** each calls `GET` and `POST /api/v1/__test/admin` (with `Origin: WEB_ORIGIN`)
- **Then** results are, respectively: `403 FORBIDDEN_PERMISSION` (both); `403 MFA_ENROLLMENT_REQUIRED` (both); `200` for GET and `403 REAUTHENTICATION_REQUIRED` for POST; `200` for both.

### AC-006-14 — Platform admins have no tenant bypass

- **Given** a `PLATFORM_ADMIN` with MFA who is not a member of organization A
- **When** they call any A test endpoint
- **Then** the response is `404 ORGANIZATION_NOT_FOUND`.

### AC-006-15 — Cross-origin mutations rejected

- **Given** a valid session cookie
- **When** a `POST` to a REDOVA endpoint is sent with `Origin: https://evil.example`
- **Then** the response is `403 ORIGIN_NOT_ALLOWED` and the handler is not executed. The same request with `Origin: WEB_ORIGIN` passes the guard.

### AC-006-16 — Global role cannot be self-assigned

- **When** sign-up or `update-user` is called with `role: "PLATFORM_ADMIN"`, `banned: false` or `twoFactorEnabled: true`
- **Then** the stored values are unchanged (`USER`, default ban state, `false`).

## Test cases

### Unit

| ID | Test |
| --- | --- |
| UT-006-01 | `canAssignOrgRole`: full 6×6 table (actor × target). |
| UT-006-02 | `canManageMember`: owner/admin/functional actors × target roles × self/other × promote/demote/remove. 100% branch coverage. |
| UT-006-03 | `isValidOrgRole`: the six roles pass; comma lists, lowercase and unknown values fail. |
| UT-006-04 | Permission matrix: table-driven test generated from a matrix fixture identical to README §9 (AC-006-01). |
| UT-006-05 | `FreshSessionGuard` boundary: age = `freshAge` − 1 s passes, = `freshAge` fails. |
| UT-006-06 | `OriginGuard`: allowed origin, foreign origin, missing origin with `Sec-Fetch-Site` same-origin / cross-site, GET bypass. |

### Integration

| ID | Test | AC |
| --- | --- | --- |
| IT-006-01 | Invitation escalation via `/api/auth/organization/invite-member` | AC-006-02 |
| IT-006-02 | Update role / remove member between admins and viewers | AC-006-03 |
| IT-006-03 | Self-promotion and self-demotion cases | AC-006-04 |
| IT-006-04 | Owner promotion and last-owner protection | AC-006-05 |
| IT-006-05 | Invalid role values | AC-006-06 |
| IT-006-06 | Missing `organizationId` → 400 | AC-006-07 |
| IT-006-07 | Non-member → 404 identical to non-existent org | AC-006-08 |
| IT-006-08 | Viewer → 403 + audit; auditor → 200 | AC-006-09 |
| IT-006-09 | Removal / role change effective on next request | AC-006-10 |
| IT-006-10 | Active-organization independence | AC-006-11 |
| IT-006-11 | `describeTenantIsolation` on the test item endpoints | AC-006-12 |
| IT-006-12 | Admin guard combinations | AC-006-13 |
| IT-006-13 | Admin without membership → 404 | AC-006-14 |
| IT-006-14 | Origin guard | AC-006-15 |
| IT-006-15 | `input: false` fields at sign-up and update-user | AC-006-16 |

### API end-to-end

| ID | Test | AC |
| --- | --- | --- |
| E2E-006-01 | Against the running server (test profile): two users in two organizations; every cross-organization call to the test endpoints returns 404, and an escalation attempt through `update-member-role` returns 403 | AC-006-03, AC-006-08 |

## Definition of Done

- [ ] Global Definition of Done (README §20) satisfied — coverage reporting (§19.3) is added to CI in UM-008.
- [x] All AC-006-xx automated and green; `packages/core` coverage ≥ 95% with 100% of escalation branches.
- [x] README §9 and the matrix fixture are asserted against the same source, so they cannot drift (the test parses the README tables).
- [x] `describeTenantIsolation` documented with a usage example for future modules (`apps/server/test/support/tenant-isolation.kit.ts` and `apps/server/README.md`).
- [x] Test-only controllers and tables cannot be loaded outside `NODE_ENV=test` (they live in `test/`, and a test asserts the production build contains none).
