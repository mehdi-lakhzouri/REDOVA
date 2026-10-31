# REDOVA — User Management Module

| Item | Value |
| --- | --- |
| Module | User Management (Identity, Authentication, Organizations, RBAC) |
| Phase | **Backend only.** The frontend (`apps/web`) is deferred to a later phase. |
| Status | Design approved for implementation — Sprint 01 |
| Better Auth version | `better-auth@1.7.14` (verified against installed source, not assumed) |
| NestJS integration | `@thallesp/nestjs-better-auth@2.8.0` |
| Sprint backlog | [SPRINT-01.md](SPRINT-01.md) |
| Tickets | [tickets/](tickets/) — UM-001 … UM-008 |
| Git workflow | [../GIT-STRATEGY.md](../GIT-STRATEGY.md) |

> **Reading guide.** Throughout this document, **[Native]** marks behavior provided by Better Auth or its plugins and only *configured* by REDOVA. **[Custom]** marks behavior REDOVA must implement and test itself. If a statement carries neither label, it is a REDOVA convention.

---

## Table of contents

1. [Module overview and business objectives](#1-module-overview-and-business-objectives)
2. [Functional scope and out-of-scope features](#2-functional-scope-and-out-of-scope-features)
3. [Architecture and module responsibilities](#3-architecture-and-module-responsibilities)
4. [Better Auth plugins and their purposes](#4-better-auth-plugins-and-their-purposes)
5. [Authentication and session lifecycle](#5-authentication-and-session-lifecycle)
6. [Email verification and password recovery](#6-email-verification-and-password-recovery)
7. [MFA / TOTP lifecycle](#7-mfa--totp-lifecycle)
8. [Global vs organization-level roles](#8-global-vs-organization-level-roles)
9. [RBAC permission matrix](#9-rbac-permission-matrix)
10. [Multi-tenant authorization rules](#10-multi-tenant-authorization-rules)
11. [Database model: Better Auth tables vs REDOVA tables](#11-database-model-better-auth-tables-vs-redova-tables)
12. [Important fields, relationships and constraints](#12-important-fields-relationships-and-constraints)
13. [User workflows: registration to organization access](#13-user-workflows-registration-to-organization-access)
14. [Admin workflows](#14-admin-workflows)
15. [API client contract](#15-api-client-contract)
16. [Transactional email requirements](#16-transactional-email-requirements)
17. [Security requirements and threat considerations](#17-security-requirements-and-threat-considerations)
18. [API ownership and integration boundaries](#18-api-ownership-and-integration-boundaries)
19. [Testing strategy](#19-testing-strategy)
20. [Definition of Done](#20-definition-of-done)
21. [Implementation sprint roadmap](#21-implementation-sprint-roadmap)
- [Appendix A — Glossary](#appendix-a--glossary)
- [Appendix B — Decision log](#appendix-b--decision-log)
- [Appendix C — Configuration reference](#appendix-c--configuration-reference)

---

## 1. Module overview and business objectives

REDOVA is a multi-tenant SaaS platform for **Agentic AI Security Testing and Automated Red Teaming**. Organizations register their AI agents, run automated attack simulations against them, and collect findings, evidence and reports aligned with the **OWASP Agentic AI Top 10**.

Every later capability (Agent Registry, Scenario Catalog, Assessments, Findings, Reports) relies on answering three questions correctly on every request:

1. **Who is calling?** (authentication)
2. **Which organization (tenant) is the request acting on?** (tenant context)
3. **Is this caller allowed to perform this action on this tenant's data?** (authorization)

The User Management module answers these questions. It holds the most sensitive data in the system, so it must be secure from the start. In this phase the module is delivered as a **backend**: HTTP APIs, configuration, persistence, background jobs and tests. It is exercised through automated tests and the OpenAPI references, and a later frontend phase will consume the same APIs.

### Business objectives

| # | Objective | Measured by |
| --- | --- | --- |
| BO-1 | A security team can self-onboard through the API: register, verify email, create an organization and invite colleagues without operator help. | API journeys `E2E-JOURNEY-01` and `E2E-JOURNEY-02` pass. |
| BO-2 | Customer data is strictly isolated per organization. | Cross-tenant test suite (UM-006, UM-008) passes with 0 leaks. |
| BO-3 | Accounts with the highest privileges are protected beyond passwords. | 100% of `PLATFORM_ADMIN` API calls require enrolled MFA (UM-007 tests). |
| BO-4 | Privileged actions are traceable. | Every action in the [audit catalog](#174-security-audit-events) produces exactly one audit event (UM-008 tests). |
| BO-5 | The platform can stop a compromised or abusive account immediately. | A ban or session revocation is enforced on the very next request (UM-007 tests). |

### Design principles

- **Native first.** Use Better Auth's built-in features before writing custom auth code. Custom code is limited to REDOVA-specific rules: role-rank escalation rules, the MFA requirement for admins, the audit trail and tenant-scoped REDOVA APIs.
- **Server-side authorization only.** Every authorization decision is enforced by `apps/server` or by Better Auth on the server. Clients are never trusted to filter or hide data.
- **No speculative infrastructure.** A port/adapter, cache, queue or idempotency store is introduced only when a Sprint 01 feature needs it (see [§3.4](#34-pragmatic-hexagonal-rules) and [§18.4](#184-idempotency)).
- **Secure defaults, explicit exceptions.** Routes are authenticated by default (global guard); public routes are opted out explicitly and listed.

---

## 2. Functional scope and out-of-scope features

### 2.1 In scope (backend, Sprint 01)

| Area | Feature | Source |
| --- | --- | --- |
| Authentication | Email + password registration and sign-in | [Native] core `emailAndPassword` |
| | Sign-out; list / revoke own sessions; revoke all other sessions | [Native] core session endpoints |
| | Mandatory email verification before any session exists | [Native] `requireEmailVerification` |
| | Forgot / reset password (single-use, expiring token) | [Native] core |
| | Change password (current password required, other sessions revoked) | [Native] core |
| | Profile management: display name | [Native] `updateUser` |
| | Password breach check | [Native] `haveIBeenPwned` plugin |
| | Per-account sign-in throttling (in addition to per-IP rate limiting) | [Custom] Redis |
| MFA | TOTP enrollment (authenticator app URI + backup codes) | [Native] `twoFactor` plugin |
| | TOTP challenge at sign-in, optional trusted device | [Native] |
| | Backup recovery codes (single use, regenerable) | [Native] |
| | Disable MFA (password required) | [Native] |
| | MFA mandatory for `PLATFORM_ADMIN` | [Custom] guard + hook |
| | Recent-authentication requirement for sensitive operations | [Native] `freshAge` + [Custom] guard |
| Administration | List / search users (cursor pagination) | [Custom] REDOVA API over [Native] data |
| | Ban (with reason and optional expiry) / unban | [Native] `admin` plugin via REDOVA API |
| | List and revoke a user's sessions (one or all) | [Native] via REDOVA API |
| | Change global role (`USER` ⇄ `PLATFORM_ADMIN`) with safeguards | [Native] + [Custom] rules |
| | Bootstrap the first `PLATFORM_ADMIN` | [Custom] CLI script |
| | Security audit log API (platform scope) | [Custom] |
| Organizations | Self-service organization creation (verified users) | [Native] `organization` plugin |
| | Organization settings: name, logo URL | [Native] |
| | Invitations: create, resend, cancel, accept, reject | [Native] |
| | Members: list, change role, remove, leave | [Native] + [Custom] rank rules |
| | Organization switching (active organization) | [Native] `setActive` |
| | Organization-level RBAC (6 roles) | [Native] access control + [Custom] rules |
| | Organization audit log API (organization scope) | [Custom] |
| | Multi-tenant isolation primitives for future modules | [Custom] |

### 2.2 Out of scope (explicitly deferred)

| Feature | Reason / future phase |
| --- | --- |
| **Frontend (`apps/web`)**: every page, form, dialog, client-side SDK integration and browser test | Deferred to the frontend phase. The backend APIs are exercised through automated tests and the OpenAPI references (`/api/v1/docs`, `/api/auth/reference`). The existing Next.js scaffold is moved into the monorepo **unchanged**. |
| Passkeys, Magic Link, Email OTP, SMS OTP | Future enhancement. The `twoFactor` OTP method is not configured, so its HTTP paths are disabled. |
| Social login, SSO (SAML/OIDC), SCIM | Future enterprise tier. |
| Custom roles per organization (`dynamicAccessControl`) | Future. The 6 fixed roles cover Sprint 01. |
| Teams inside organizations | Future (`teams.enabled = false`). |
| Organization deletion / archiving | Disabled in Sprint 01 (`disableOrganizationDeletion: true`) to prevent data loss of future assessments/findings. Archival with retention = future. |
| Ownership transfer endpoint | Future. Multiple `ORG_OWNER`s are allowed, which provides a workaround. |
| Change email address | Future: requires a confirmation sent to both addresses. |
| Account self-deletion (GDPR erasure) | Future: must be designed together with audit retention. |
| Avatar upload | Future. `user.image` remains unused. |
| Admin impersonation | Excluded for security. The permission is not granted and the HTTP paths are disabled. |
| Admin-assisted MFA reset endpoint | Future. In Sprint 01, a documented operator CLI procedure covers it (§7.6). |
| Organization-enforced MFA policy | Future. |
| Platform-wide "log everyone out" kill switch | Future. Per-user global revocation is in scope. |
| Agent Registry, Scenario Catalog, Assessments, Findings, Reports | Other modules. This module only declares their **permission statements** (§9) and provides the tenant-isolation building blocks they will reuse. |

---

## 3. Architecture and module responsibilities

### 3.1 Repository layout (target)

The repository currently contains two independent projects (`backend/` — NestJS 11 scaffold; `frontend/` — Next.js 16 scaffold) with separate `.git` folders, and an empty `docker/`. **UM-001 migrates them into the target pnpm + Turborepo monorepo** below. This only moves the existing projects into the agreed structure; it does not redesign anything.

```text
redova/
├─ apps/
│  ├─ server/         NestJS 11 (Express) — mounts Better Auth at /api/auth, REDOVA API at /api/v1, guards, OpenAPI
│  ├─ worker/         BullMQ consumers — transactional email rendering & delivery
│  └─ web/            Existing Next.js scaffold, moved as-is (out of scope in this phase)
├─ packages/
│  ├─ auth/           betterAuth() factory, plugin config, access-control statements & roles
│  ├─ contracts/      Zod schemas & types: API envelope, error codes, cursor, role enums, REDOVA API DTOs, job payloads
│  ├─ core/           Pure business policies: role ranks, assignable roles, admin safeguards (no I/O)
│  ├─ db/             Prisma schema, migrations, Prisma client (adapter-pg), repositories
│  ├─ integrations/   EmailSender port + adapters (SMTP via nodemailer, provider HTTP API), Handlebars templates
│  └─ queue/          Queue names, producer helpers, Redis connection factory
├─ docker/            docker-compose: postgres, redis, mailpit (test profile)
└─ docs/
   ├─ GIT-STRATEGY.md
   └─ user-management/
```

### 3.2 Component diagram

```mermaid
flowchart LR
    C["API clients<br/>(automated tests, OpenAPI/Scalar,<br/>future web app)"]
    subgraph Server["apps/server (NestJS)"]
        BA["Better Auth handler<br/>/api/auth/*"]
        API["REDOVA API<br/>/api/v1/*"]
        G["Guards: AuthGuard (global),<br/>Roles, MfaRequired, FreshSession,<br/>OrgPermission, Origin"]
        AUD["AuditService"]
    end
    subgraph Worker["apps/worker"]
        EW["Email processor<br/>(Handlebars + EmailSender)"]
    end
    PG[("PostgreSQL")]
    R[("Redis")]
    SMTP["SMTP (Gmail, dev)<br/>Mailpit (test/CI)<br/>Provider API (prod)"]
    HIBP["api.pwnedpasswords.com"]

    C -- "HTTPS + session cookie" --> BA
    C -- "HTTPS + session cookie" --> API
    API --> G
    API -- "auth.api.* (server-side calls)" --> BA
    BA --> PG
    API --> PG
    BA -- "rate-limit counters" --> R
    BA -- "enqueue email jobs" --> R
    BA -- "hooks → audit" --> AUD
    API --> AUD
    AUD --> PG
    R --> EW
    EW --> SMTP
    BA -- "k-anonymity range query" --> HIBP
```

### 3.3 Module responsibilities and dependency rules

| Unit | Owns | May depend on | Must not |
| --- | --- | --- | --- |
| `apps/server` | HTTP surface, guards, controllers, OpenAPI, request id, envelope, audit writing, CLI scripts | all packages | Re-implement Better Auth flows |
| `apps/worker` | Email job processing, retries | `queue`, `integrations`, `contracts` | Expose HTTP endpoints |
| `packages/auth` | Single `createAuth()` configuration; access-control statements/roles; hook wiring | `db`, `contracts`, `core`, `queue` | Contain business rules beyond Better Auth hook wiring |
| `packages/contracts` | Zod schemas shared by server and worker (and the future web app) | `zod` only | Import runtime server code |
| `packages/core` | Pure policies (`canAssignOrgRole`, `canManageMember`, `canBanUser`, …) | `contracts` | Perform I/O |
| `packages/db` | Prisma schema, migrations, client, repositories (`AuditEventRepository`, `UserQueryRepository`) | Prisma | Contain authorization decisions |
| `packages/integrations` | `EmailSender` port + adapters, template rendering | `contracts` | Know about BullMQ |
| `packages/queue` | Queue/job definitions and producers | `bullmq`, `contracts` | Send emails |

The dependency direction is enforced with ESLint import-boundary rules in UM-001.

### 3.4 Pragmatic hexagonal rules

REDOVA applies hexagonal architecture **only where it pays off**:

- **Ports exist only when there are at least two adapters, or when a pure-domain test seam is needed.** In Sprint 01 there is exactly one port: `EmailSender` (SMTP adapter for dev/test, provider-API adapter for prod).
- **Business policies are pure functions in `packages/core`**, unit-tested without mocks. Guards and Better Auth hooks call them.
- **Repositories are concrete Prisma classes in `packages/db`**, with no repository interfaces. Integration tests run them against a real PostgreSQL.
- **Better Auth is treated as infrastructure we configure, not wrap.** REDOVA does not hide it behind an abstraction layer.

### 3.5 Network topology (backend phase)

- The server is exposed directly at `BETTER_AUTH_URL` (dev: `http://localhost:3001`). Native auth endpoints live under `/api/auth/*` and REDOVA endpoints under `/api/v1/*`, on the same origin.
- `trustedOrigins` contains only `WEB_ORIGIN`, the origin of the future frontend (dev: `http://localhost:3000`). API clients must send `Origin: WEB_ORIGIN` on state-changing requests, and every `callbackURL` / `redirectTo` they pass must belong to that origin (§15).
- How the future frontend reaches the API (same-origin proxy or sibling subdomain) is decided in the frontend phase (D-08). The backend already supports both: only `BETTER_AUTH_URL`, `WEB_ORIGIN` and cookie attributes would change.

---

## 4. Better Auth plugins and their purposes

All values below were verified against the installed `better-auth@1.7.14` source. Values marked *(default)* are Better Auth defaults that REDOVA keeps on purpose. All other values are REDOVA choices.

### 4.1 Core (`betterAuth({...})`)

| Option | REDOVA value | Purpose |
| --- | --- | --- |
| `database` | `prismaAdapter(prisma, { provider: "postgresql" })` from `@better-auth/prisma-adapter` | Persistence in PostgreSQL. |
| `basePath` | `/api/auth` *(default)* | Native endpoints. |
| `baseURL` | `BETTER_AUTH_URL` (public server origin in this phase) | Correct links in emails, cookie scoping. |
| `secret` | `BETTER_AUTH_SECRET` (≥ 32 random bytes, env only) | Signs cookies, encrypts 2FA secrets and backup codes. |
| `trustedOrigins` | `[WEB_ORIGIN]` | Origin check + `callbackURL` / `redirectTo` validation (open-redirect defense). |
| `emailAndPassword.enabled` | `true` | |
| `emailAndPassword.requireEmailVerification` | `true` | No session before the email is verified. Also makes duplicate sign-up return a **generic** response (anti-enumeration, verified in source). |
| `emailAndPassword.minPasswordLength` / `maxPasswordLength` | `12` / `128` *(default max)* | NIST 800-63B length-based policy; no composition rules. |
| `emailAndPassword.resetPasswordTokenExpiresIn` | `1800` (30 min) | Short-lived reset tokens (default is 1 h). |
| `emailAndPassword.revokeSessionsOnPasswordReset` | `true` | A reset logs out every device. |
| `emailAndPassword.sendResetPassword` | enqueue `reset-password` email job | Async delivery (timing-attack safe). |
| `emailAndPassword.onPasswordReset` | enqueue `security-notification` + audit | User is told their password changed. |
| `emailAndPassword.onExistingUserSignUp` | enqueue `existing-account` email | The legitimate owner gets an email; the API response stays generic. |
| `emailVerification.sendVerificationEmail` | enqueue `verify-email` job | |
| `emailVerification.sendOnSignUp` | `true` | |
| `emailVerification.sendOnSignIn` | `true` | Unverified user trying to sign in gets a fresh link. |
| `emailVerification.autoSignInAfterVerification` | `true` | Following the verification link creates a session. |
| `emailVerification.expiresIn` | `86400` (24 h) | Verification links are lower risk than reset links. |
| `emailVerification.afterEmailVerification` | audit `auth.email.verified` | |
| `session.expiresIn` / `updateAge` | 7 days / 1 day *(defaults)* | Sliding session. |
| `session.freshAge` | `3600` (1 h) | "Recent authentication" window for sensitive operations (§5.5). Also governs native `/list-sessions`. |
| `session.cookieCache.enabled` | `false` *(default)* | Ban, revocation and role changes take effect on the **next request**. |
| `verification.storeIdentifier` | `"hashed"` | Reset/verification identifiers are stored hashed: a DB leak does not leak usable tokens. UM-003 verifies this. |
| `rateLimit.enabled` | `true` in every environment except unit tests | Default is production-only. |
| `rateLimit.customStorage` | Redis implementation of `consume(key, {window, max})` | Atomic, shared across instances (1.7.x requires atomic `consume`; `get/set` is no longer accepted). |
| `rateLimit.customRules` | see [Appendix C](#appendix-c--configuration-reference) | Tight limits on credential endpoints. |
| `advanced.cookiePrefix` | `redova` | Cookie: `redova.session_token` (`__Secure-` prefix added on HTTPS). |
| `advanced.disableOriginCheck` | `false` (explicit) | Better Auth skips origin/CSRF checks when `NODE_ENV=test` unless this is set; setting it keeps the protections, and the security tests, real in every environment (verified in source). |
| `advanced.useSecureCookies` | `true` in production | |
| `advanced.ipAddress.ipAddressHeaders` | `["x-forwarded-for"]` (only behind a trusted proxy) | Correct IP for rate limit + audit. |
| `disabledPaths` | see §4.6 | Disable HTTP exposure of endpoints REDOVA wraps or excludes. |
| `hooks.after` / `hooks.before` | audit + REDOVA rules (§10.4, §17.4) | `hooks: {}` minimum is required by `@thallesp/nestjs-better-auth`. |
| `databaseHooks.session.create.after` | audit `auth.session.created` | Single, reliable "sign-in succeeded" point (covers password, 2FA completion and auto sign-in after verification). |

### 4.2 Admin plugin — global user administration

| Option | Value | Notes |
| --- | --- | --- |
| `ac` / `roles` | `{ PLATFORM_ADMIN, USER }` built with `createAccessControl` | §8.1 |
| `defaultRole` | `"USER"` | Applied by the plugin's `user.create.before` hook. |
| `adminRoles` | `["PLATFORM_ADMIN"]` | |
| `bannedUserMessage` | Generic: "Your account has been suspended. Contact support." | No ban reason leaked to the client. |

Native behavior REDOVA relies on (verified):

- Schema: `user.role`, `user.banned`, `user.banReason`, `user.banExpires`, `session.impersonatedBy` — all `input: false`, so a client **cannot** set them through sign-up or `update-user`.
- `ban-user` sets the ban **and deletes all sessions** of the target. The plugin's `session.create.before` hook rejects new sessions for banned users with `BANNED_USER`, and lifts expired bans automatically.
- `ban-user` refuses to let an admin ban themselves (`YOU_CANNOT_BAN_YOURSELF`).

### 4.3 Organization plugin — tenants, members, invitations

| Option | Value | Notes |
| --- | --- | --- |
| `ac` / `roles` | 6 REDOVA roles (§8.2) | Must include the default statements Better Auth checks internally (`organization`, `member`, `invitation`). |
| `creatorRole` | `"ORG_OWNER"` | Native owner protections apply to this role. |
| `allowUserToCreateOrganization` | `(user) => user.emailVerified === true` | Self-service for verified users. |
| `organizationLimit` | `3` | Per user; abuse control. |
| `membershipLimit` | `100` *(default)* | Keeps member lists bounded (§18.3). |
| `invitationLimit` | `100` *(default)* | |
| `invitationExpiresIn` | `604800` (7 days) | Default is 48 h. |
| `cancelPendingInvitationsOnReInvite` | `true` | Re-inviting replaces the pending invitation (natural idempotency). |
| `requireEmailVerificationOnInvitation` | `true` | Recipient must have a verified email to accept/reject. |
| `sendInvitationEmail` | enqueue `organization-invitation` job | |
| `disableOrganizationDeletion` | `true` | §2.2 |
| `teams.enabled` / `dynamicAccessControl.enabled` | `false` | Out of scope. |
| `organizationHooks` | invitation escalation rules, slug immutability, audit (§10.4, §17.4) | Member role/removal rules use `hooks.before` (§10.4). |

Native behavior REDOVA relies on (verified):

- Accepting/rejecting an invitation requires the signed-in user's email to equal the invitation email (`YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION`).
- Only a member holding `creatorRole` can grant `ORG_OWNER` or modify an `ORG_OWNER` (`YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER` / `…_INVITE_USER_WITH_THIS_ROLE`).
- The last `ORG_OWNER` can neither leave nor be demoted (`YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER`, `…_WITHOUT_AN_OWNER`).
- Organization read endpoints, including `list-invitations` and `get-full-organization`, reject non-members (`USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION` / `FORBIDDEN`). They check membership only, not a specific permission.
- **Gap closed by REDOVA:** Better Auth does **not** prevent an `ORG_ADMIN` from granting `ORG_ADMIN` or modifying another `ORG_ADMIN`. REDOVA adds rank rules (§10.4).

### 4.4 Two-Factor plugin — TOTP and backup codes

| Option | Value | Notes |
| --- | --- | --- |
| `issuer` | `"REDOVA"` | Label in authenticator apps. |
| `totpOptions` | `digits: 6`, `period: 30` *(defaults)* | RFC 6238. |
| `backupCodeOptions` | `amount: 10`, `length: 10` *(defaults)*, `storeBackupCodes: "encrypted"` *(plugin default)* | Format `xxxxx-xxxxx`. Each code is single-use (removed after use). |
| `skipVerificationOnEnable` | `false` *(default)* | MFA becomes active only after the first valid TOTP code (verified: `twoFactorEnabled` is set by `verify-totp`). |
| `trustDeviceMaxAge` | `604800` (7 days) | Shorter than the 30-day default. |
| `twoFactorCookieMaxAge` | `600` *(default)* | 10 min to complete the challenge. |
| `accountLockout` | enabled, 10 attempts, 900 s *(defaults)* | Locks second-factor verification per account. |
| `otpOptions` | not configured | Email/SMS OTP out of scope; OTP paths disabled. |

Native table `twoFactor`: `secret` and `backupCodes` are `returned: false` and encrypted with `BETTER_AUTH_SECRET`. `user.twoFactorEnabled` is `input: false`.

### 4.5 Have I Been Pwned plugin — breached-password rejection

- Applies **natively** to `/sign-up/email`, `/change-password`, `/reset-password`, `/admin/create-user`, `/admin/set-user-password` (default `paths`).
- Uses k-anonymity: only the first 5 hex characters of the SHA-1 hash leave the server, with `Add-Padding: true`.
- **Fails closed:** if the HIBP API is unreachable, the operation fails with `INTERNAL_SERVER_ERROR`. REDOVA keeps this (secure default) and documents it for API clients (§15).
- `customPasswordCompromisedMessage`: "This password appears in a known data breach. Choose a different one."
- Disabled in unit tests (`enabled: false`). Integration tests mock the HIBP HTTP call (undici `MockAgent`).

### 4.6 Disabled HTTP paths

`disabledPaths` takes exact paths. It blocks **HTTP** access only, and server-side `auth.api.*` calls still work (verified in the router's `onRequest`). REDOVA uses it to:

| Paths | Why |
| --- | --- |
| `/admin/list-users`, `/admin/get-user`, `/admin/ban-user`, `/admin/unban-user`, `/admin/set-role`, `/admin/list-user-sessions`, `/admin/revoke-user-session`, `/admin/revoke-user-sessions` | Exposed **only** through REDOVA `/api/v1/admin/*` so that MFA, recent authentication, safeguards, audit and envelope/cursor conventions always apply. |
| `/admin/create-user`, `/admin/update-user`, `/admin/remove-user`, `/admin/set-user-password`, `/admin/impersonate-user`, `/admin/stop-impersonating`, `/admin/has-permission` | Out of scope / excluded. |
| `/organization/delete` | Deletion disabled (belt and braces with `disableOrganizationDeletion`). |
| `/two-factor/send-otp`, `/two-factor/verify-otp` | OTP method not configured. |
| `/delete-user`, `/change-email` | Out of scope. |

---

## 5. Authentication and session lifecycle

### 5.1 Authentication flow

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant C as API client
    participant BA as Better Auth (/api/auth)
    participant Q as Redis / BullMQ
    participant WK as apps/worker
    participant DB as PostgreSQL

    C->>BA: POST /sign-up/email (name, email, password, callbackURL)
    BA->>BA: Rate limit (Redis) + HIBP check
    BA->>DB: Create user (emailVerified=false, role=USER) + credential account
    BA->>Q: enqueue verify-email job
    BA-->>C: 200 generic response (no session)
    Q->>WK: job
    WK->>U: Email "Verify your email" (link, 24 h)
    U->>BA: GET /verify-email?token&callbackURL
    BA->>DB: emailVerified=true
    BA->>DB: Create session (autoSignInAfterVerification)
    BA-->>U: Set-Cookie redova.session_token + 302 to callbackURL

    Note over C,BA: Later sign-in
    C->>BA: POST /sign-in/email
    alt invalid credentials
        BA-->>C: 401 INVALID_EMAIL_OR_PASSWORD (generic)
    else email not verified
        BA->>Q: enqueue verify-email (sendOnSignIn)
        BA-->>C: 403 EMAIL_NOT_VERIFIED
    else banned
        BA-->>C: 403 BANNED_USER (generic message)
    else MFA enabled and device not trusted
        BA-->>C: 200 twoFactorRedirect=true + two-factor cookie (10 min)
        C->>BA: POST /two-factor/verify-totp (see §7)
    else success
        BA->>DB: Create session
        BA-->>C: 200 + Set-Cookie
    end
```

### 5.2 Session model

| Property | Value |
| --- | --- |
| Storage | PostgreSQL `session` table (single source of truth). No Redis session storage (§18.5). |
| Cookie | `redova.session_token` — `HttpOnly`, `Secure` (prod, with `__Secure-` prefix), `SameSite=Lax`, `Path=/`, signed |
| Lifetime | 7 days, sliding: refreshed at most once per day of activity (`updateAge`) |
| Validation | Every request: `auth.api.getSession` reads the session and user from the DB (cookie cache disabled) |
| Active organization | `session.activeOrganizationId` — convenience only; REDOVA APIs take the tenant from the URL (§10.2) |
| Metadata | `ipAddress`, `userAgent` recorded natively and returned by session listings |

### 5.3 Session operations

| Operation | Endpoint | Who | Notes |
| --- | --- | --- | --- |
| Sign out | `POST /api/auth/sign-out` [Native] | self | Deletes the session row and clears the cookie. |
| List own sessions | `GET /api/auth/list-sessions` [Native] | self | Requires a **fresh** session (§5.5). |
| Revoke one own session | `POST /api/auth/revoke-session` [Native] | self | |
| Revoke all other sessions | `POST /api/auth/revoke-other-sessions` [Native] | self | |
| Revoke all own sessions | `POST /api/auth/revoke-sessions` [Native] | self | |
| Revoke a user's session / all sessions | `DELETE /api/v1/admin/users/{userId}/sessions[/{sessionId}]` [Custom → Native] | `PLATFORM_ADMIN` | §14 |
| Implicit revocation | password reset, ban [Native]; password change with `revokeOtherSessions: true` | — | |

> **Accepted native behavior.** Better Auth's `/list-sessions` returns session tokens to the session owner, because `/revoke-session` takes a token. This is acceptable: only the owner's own tokens are exposed, and clients must keep them in memory only (§15). REDOVA's **admin** API never returns other users' session tokens: it exposes session `id`s and resolves the token server-side.

### 5.4 Route protection layers

| Layer | Mechanism | Purpose |
| --- | --- | --- |
| `apps/server` global `AuthGuard` (`@thallesp/nestjs-better-auth`) | Valid session required unless `@AllowAnonymous()` | **Security boundary** for REDOVA API. |
| `apps/server` specific guards | `@Roles(["PLATFORM_ADMIN"])`, `EmailVerifiedGuard`, `MfaRequiredGuard`, `FreshSessionGuard`, `OrgPermissionGuard`, `OriginGuard` | Authorization (§10). |
| Better Auth internals | Session, permission and membership checks inside native endpoints | Security boundary for `/api/auth/*`. |

### 5.5 Recent authentication (step-up) for sensitive operations

"Recent authentication" means the current session was **created** less than `freshAge` (1 h) ago.

| Sensitive operation | Protection | Source |
| --- | --- | --- |
| Change password | Current password in body | [Native] |
| Enable / disable MFA, regenerate backup codes | Password in body | [Native] |
| List own sessions | Fresh session | [Native] `freshSessionMiddleware` |
| All `/api/v1/admin/*` **mutations** | Fresh session + MFA enrolled | [Custom] `FreshSessionGuard` (reuses `freshAge`) + `MfaRequiredGuard` |

When a fresh session is required and missing, the API returns `403 SESSION_NOT_FRESH` (native) or `403 REAUTHENTICATION_REQUIRED` (REDOVA API). The client re-authenticates with the normal sign-in endpoints (`/sign-in/email`, then `/two-factor/verify-*` when MFA is enabled). This creates a new fresh session, and the client then revokes the superseded session with `POST /revoke-session { token }`. No custom re-auth endpoint is needed.

---

## 6. Email verification and password recovery

### 6.1 Email verification rules

| Rule | Source |
| --- | --- |
| A user without a verified email **never** obtains a session (sign-up returns no session; sign-in returns `403 EMAIL_NOT_VERIFIED`). | [Native] `requireEmailVerification` |
| Every unverified sign-in attempt sends a new verification link. | [Native] `sendOnSignIn` |
| Resending is available through `POST /send-verification-email` and is rate-limited (3 per 5 min per IP). | [Native] + custom rule |
| Links expire after 24 h. An expired or invalid link redirects to the `callbackURL` with an `error` query parameter, or returns an error when no `callbackURL` was given. | [Native] |
| After verification, the user is signed in and redirected to the `callbackURL`, which must belong to `trustedOrigins`. | [Native] |
| REDOVA guards also check `user.emailVerified` (defense in depth) → `403 EMAIL_NOT_VERIFIED`. | [Custom] |

### 6.2 Password recovery rules

| Rule | Source |
| --- | --- |
| `POST /request-password-reset` always answers the same generic message, whether or not the email exists. | [Native] (verified) |
| The email is enqueued in the background (constant-time response). | [Native] `runInBackgroundOrAwait` + async queue |
| The emailed link targets Better Auth (`/api/auth/reset-password/{token}`), which redirects to the client-supplied `redirectTo` (trusted origin) with `?token=`. The client then calls `POST /reset-password { token, newPassword }`. | [Native] |
| Reset token lifetime 30 min; token is **single-use** (atomically consumed). | [Native] `consumeVerificationValue` |
| Expired/used/invalid token → `400 INVALID_TOKEN`. | [Native] |
| New password must satisfy length + HIBP. | [Native] |
| All sessions are revoked after reset; the user must sign in again. | [Native] `revokeSessionsOnPasswordReset` |
| A security notification email ("Your password was changed") is sent. | [Custom] `onPasswordReset` → queue |

### 6.3 Change password (signed in)

`POST /api/auth/change-password { currentPassword, newPassword, revokeOtherSessions: true }` [Native]. REDOVA adds a security-notification email and the `auth.password.changed` audit event via `hooks.after` on `/change-password` [Custom].

---

## 7. MFA / TOTP lifecycle

### 7.1 Policy

| Population | Policy (Sprint 01) |
| --- | --- |
| `PLATFORM_ADMIN` | **Mandatory.** All `/api/v1/admin/*` routes return `403 MFA_ENROLLMENT_REQUIRED` until `user.twoFactorEnabled = true`. A `PLATFORM_ADMIN` cannot disable MFA (`403 MFA_REQUIRED_FOR_ROLE`, via `hooks.before` on `/two-factor/disable`). |
| `USER` (any organization role) | Optional. |

### 7.2 MFA flow

```mermaid
sequenceDiagram
    autonumber
    participant C as API client
    participant BA as Better Auth
    participant DB as PostgreSQL
    participant Q as Email queue

    rect rgb(235, 245, 255)
    Note over C,Q: Enrollment (signed in)
    C->>BA: POST /two-factor/enable { password }
    BA->>DB: Upsert twoFactor (secret, backup codes encrypted, verified=false)
    BA-->>C: { totpURI, backupCodes }
    Note over C: Client shows the QR code and the codes once
    C->>BA: POST /two-factor/verify-totp { code }
    BA->>DB: user.twoFactorEnabled = true, twoFactor.verified = true
    BA-->>C: 200
    BA->>Q: security-notification "MFA enabled" (hooks.after)
    end

    rect rgb(245, 240, 255)
    Note over C,Q: Sign-in challenge
    C->>BA: POST /sign-in/email (valid password)
    BA-->>C: twoFactorRedirect=true + signed two-factor cookie (10 min)
    alt TOTP
        C->>BA: POST /two-factor/verify-totp { code, trustDevice? }
    else Backup code
        C->>BA: POST /two-factor/verify-backup-code { code }
        BA->>DB: Remove used code (single use)
    end
    alt valid
        BA->>DB: Create session (+ trusted-device record if requested, 7 days)
        BA-->>C: Set-Cookie session
    else invalid (attempt n)
        BA->>DB: failedVerificationCount++
        BA-->>C: 401 (after 10 failures: locked 15 min)
    end
    end
```

### 7.3 Enrollment rules

- The password is required to start enrollment [Native]. MFA is **not** active until a valid TOTP code is submitted (`skipVerificationOnEnable: false`) [Native].
- `totpURI` and the backup codes are returned **once**, in the `enable` response. REDOVA never stores them in clear, never logs them, never emails them, and never renders QR codes server-side.
- Abandoned enrollment (no verification) leaves `twoFactorEnabled = false`. Restarting enrollment regenerates the secret [Native].

### 7.4 Backup codes

- 10 codes, encrypted at rest, each usable **once** [Native].
- Regenerate: `POST /two-factor/generate-backup-codes { password }` invalidates all previous codes [Native]. A notification email and the `auth.mfa.backup_codes_regenerated` audit event are added [Custom].

### 7.5 Disabling MFA

`POST /two-factor/disable { password }` [Native] → security notification + audit [Custom]. Blocked for `PLATFORM_ADMIN` [Custom].

### 7.6 Lost authenticator

1. **Has backup codes:** sign in with a backup code, then disable and re-enroll MFA.
2. **No backup codes:** out-of-band operator procedure (runbook + CLI in UM-004): identity verification by the platform operator, then `mfa:reset`, which clears the `twoFactor` row, sets `twoFactorEnabled = false`, revokes sessions and records `admin.user.mfa_reset` with actor `SYSTEM`. An admin API for this is a future enhancement.

---

## 8. Global vs organization-level roles

REDOVA has **two independent role dimensions**. A user always has exactly one global role and, per organization they belong to, exactly one organization role.

### 8.1 Global roles — `user.role` (admin plugin)

| Role | Meaning |
| --- | --- |
| `USER` | Default for every account. Can create organizations (if verified) and act in organizations they are a member of. |
| `PLATFORM_ADMIN` | REDOVA operator. Administers **accounts** (list, ban/unban, role, sessions) and reads the platform audit log. **No implicit access to any organization's data** (agents, assessments, findings, reports). To see tenant data, an operator must be invited like anyone else. |

### 8.2 Organization roles — `member.role` (organization plugin)

| Role | Rank | Persona | Summary |
| --- | --- | --- | --- |
| `ORG_OWNER` | 100 | Account owner / CISO | Full control of the organization, including owners. |
| `ORG_ADMIN` | 80 | Security team lead | Manages members and invitations **below** their rank; edits settings. |
| `SECURITY_ENGINEER` | 10 | Red-team operator | Creates and runs assessments, triages findings, generates reports. |
| `AI_DEVELOPER` | 10 | Agent builder | Registers and maintains AI agents; reads assessment results and findings to remediate. |
| `AUDITOR` | 10 | Compliance / GRC | Read-only on everything, including the organization audit log; generates compliance reports. |
| `VIEWER` | 10 | Stakeholder | Read-only on agents, assessments, findings and reports. |

**Single role per membership.** Better Auth can store several comma-separated roles, but REDOVA allows one role per membership. Hooks reject a role value that contains a comma or is not one of the six roles (`ORG_ROLE_INVALID`).

**Ranks** are used only for **member-management** decisions (§10.4). The four functional roles share rank 10 because they are peers with different capabilities, not a hierarchy.

### 8.3 Role storage and constants

Role identifiers are exported as Zod enums from `packages/contracts` (`GlobalRole`, `OrgRole`). Access-control statements and role grants live in `packages/auth/src/access-control.ts`. Rank and assignment policies live in `packages/core/src/policies/org-roles.ts`. **Nothing else may hard-code a role string.**

---

## 9. RBAC permission matrix

### 9.1 Organization permissions (organization plugin access control)

Legend: ✅ allowed · ⚖️ allowed with rank rules (§10.4) · — denied. **Enforced in Sprint 01** means the permission protects an endpoint that exists in this sprint. Rows marked *Declared* are defined now so the roles are meaningful, and they are enforced by the future module that owns the resource.

| Resource : action | ORG_OWNER | ORG_ADMIN | SECURITY_ENGINEER | AI_DEVELOPER | AUDITOR | VIEWER | Enforced by |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | --- |
| `organization:update` (name, logo) | ✅ | ✅ | — | — | — | — | Native `/organization/update` |
| `organization:delete` | — | — | — | — | — | — | Disabled in Sprint 01 |
| `member:read` (list members) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Native membership check |
| `member:update` (change role) | ⚖️ | ⚖️ | — | — | — | — | Native + custom hook |
| `member:delete` (remove member) | ⚖️ | ⚖️ | — | — | — | — | Native + custom hook |
| `invitation:read` (list pending invitations) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Native membership check ¹ |
| `invitation:create` | ⚖️ | ⚖️ | — | — | — | — | Native + custom hook |
| `invitation:cancel` | ✅ | ✅ | — | — | — | — | Native |
| `auditLog:read` (organization audit log) | ✅ | ✅ | — | — | ✅ | — | `OrgPermissionGuard` on `/api/v1/organizations/{id}/audit-events` |
| `agent:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | *Declared* (Agent Registry) |
| `agent:create` / `agent:update` | ✅ | ✅ | — | ✅ | — | — | *Declared* |
| `agent:delete` | ✅ | ✅ | — | — | — | — | *Declared* |
| `assessment:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | *Declared* (Assessments) |
| `assessment:create` / `assessment:execute` / `assessment:cancel` | ✅ | ✅ | ✅ | — | — | — | *Declared* |
| `finding:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | *Declared* (Findings) |
| `finding:triage` (status, severity override) | ✅ | ✅ | ✅ | — | — | — | *Declared* |
| `report:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | *Declared* (Reports) |
| `report:generate` | ✅ | ✅ | ✅ | — | ✅ | — | *Declared* |

¹ Better Auth's `list-invitations` and `get-full-organization` check membership only (verified). REDOVA keeps this native behavior rather than filtering native responses: members already see each other's emails, and invitations expose the same kind of data. Restricting it would need a custom facade over two native endpoints, which is not justified in Sprint 01.

`member:create` (direct add without invitation) is a server-only native API. REDOVA does not expose it, and no role is granted it.

### 9.2 Global permissions (admin plugin access control)

| Resource : action | PLATFORM_ADMIN | USER | REDOVA endpoint |
| --- | :-: | :-: | --- |
| `user:list`, `user:get` | ✅ | — | `GET /api/v1/admin/users`, `GET /api/v1/admin/users/{userId}` |
| `user:ban` (ban + unban) | ✅ | — | `PUT` / `DELETE /api/v1/admin/users/{userId}/ban` |
| `user:set-role` | ✅ | — | `PUT /api/v1/admin/users/{userId}/role` |
| `session:list`, `session:revoke` | ✅ | — | `GET` / `DELETE /api/v1/admin/users/{userId}/sessions[/{sessionId}]` |
| `auditLog:read` (platform scope) | ✅ | — | `GET /api/v1/admin/audit-events` |
| `user:create`, `user:delete`, `user:update`, `user:set-password`, `user:set-email`, `user:impersonate`, `user:impersonate-admins`, `session:delete` | — | — | Not granted in Sprint 01 |

### 9.3 Additional REDOVA rules not expressible in the matrix

| Rule | Error code |
| --- | --- |
| A `PLATFORM_ADMIN` must have MFA enabled to use any admin API. | `MFA_ENROLLMENT_REQUIRED` |
| Admin mutations require recent authentication (≤ 1 h). | `REAUTHENTICATION_REQUIRED` |
| A `PLATFORM_ADMIN` cannot change their own global role. | `ADMIN_SELF_ROLE_CHANGE_FORBIDDEN` |
| The last `PLATFORM_ADMIN` cannot be demoted (checked under a PostgreSQL advisory lock). | `LAST_PLATFORM_ADMIN` |
| A `PLATFORM_ADMIN` cannot be banned (demote first). | `ADMIN_TARGET_IS_PLATFORM_ADMIN` |
| Organization member-management rank rules (§10.4). | `ORG_ROLE_ESCALATION_FORBIDDEN` |

---

## 10. Multi-tenant authorization rules

### 10.1 Isolation model

- **Tenant = organization.** All tenant-owned data (future: agents, assessments, findings, evidence, reports, organization audit events) carries a non-null `organizationId`.
- **Shared database, shared schema, row-level scoping by `organizationId`** enforced in the application layer. PostgreSQL Row-Level Security is a documented future hardening option, not a Sprint 01 requirement.

### 10.2 Tenant resolution rules

1. **Tenant-scoped REDOVA routes carry the tenant explicitly in the path:** `/api/v1/organizations/{organizationId}/…`. The server **never** derives the tenant of a REDOVA API call from `session.activeOrganizationId`. The active organization is shared by every client using the session, and deriving the tenant from it would let one client silently act on the organization another client switched to.
2. `OrgPermissionGuard` resolves the **membership** `(session.user.id, organizationId)` from the `member` table **on every request**; only `ACTIVE` memberships count (`member.status`, tenant foundation). No membership → `404 ORGANIZATION_NOT_FOUND` (does not reveal that the organization exists). Membership without the required permission → `403 FORBIDDEN_PERMISSION`.
3. The permission check evaluates the member's role against the shared `packages/auth` access-control definitions (`roles[role].authorize(...)`). The definitions are the same ones Better Auth uses, so there is only one source of truth.
4. The guard attaches a typed `TenantContext { userId, organizationId, memberId, role }` to the request. Controllers and services receive the tenant **only** from this context, never from body or query parameters.
5. Native organization endpoints (`/api/auth/organization/*`) enforce membership and permissions themselves [Native]; REDOVA adds rank rules via hooks [Custom].
6. `PLATFORM_ADMIN` has **no bypass** of these rules.

### 10.3 Tenant-scoped data access rules (for this and all future modules)

| Rule | How it is verified |
| --- | --- |
| Every Prisma query on a tenant-owned model includes `where: { organizationId: ctx.organizationId, … }`. Lookups by id use `findFirst({ where: { id, organizationId } })`, never `findUnique({ where: { id } })` alone. | Code review checklist + cross-tenant contract tests. |
| A resource id belonging to another tenant returns **404**, identical to a non-existent id. | Contract test `TENANT-ISO-02`. |
| List endpoints can never return rows from another tenant, even with a crafted cursor. | Contract test `TENANT-ISO-03` (cursor from tenant B used in tenant A). |
| Tenant id from body/query is ignored or rejected when it differs from the path tenant. | Contract test `TENANT-ISO-04`. |

UM-006 ships a reusable **cross-tenant contract test kit** (`describeTenantIsolation(...)`). The Definition of Done of every future tenant-scoped module requires running it.

### 10.4 Organization role escalation rules [Custom]

Implemented as pure functions in `packages/core` and wired into Better Auth as follows. The wiring depends on which hook receives the **actor** (verified in source):

| Operation | Hook | Actor source |
| --- | --- | --- |
| Invite member | `organizationHooks.beforeCreateInvitation` | `inviter` argument (+ inviter's `member` row looked up in the organization) |
| Update member role | `hooks.before` matching `/organization/update-member-role` | `getSessionFromCtx(ctx)` from `better-auth/api`. The native `beforeUpdateMemberRole` receives the **target** user, not the actor. |
| Remove member | `hooks.before` matching `/organization/remove-member` | `getSessionFromCtx(ctx)`, for the same reason |

For the two `hooks.before` cases, REDOVA requires an explicit `organizationId` in the request body (`400 ORGANIZATION_ID_REQUIRED` otherwise). This keeps the hook and Better Auth from resolving different organizations. Rejections throw a Better Auth `APIError("FORBIDDEN", { code: "ORG_ROLE_ESCALATION_FORBIDDEN" })`.

| # | Rule | Native? |
| --- | --- | --- |
| R1 | Only `ORG_OWNER` can invite as, promote to, demote from, or remove an `ORG_OWNER`. | Native (creatorRole) |
| R2 | The last `ORG_OWNER` cannot leave, be removed, or be demoted. | Native |
| R3 | An `ORG_ADMIN` can invite/assign only roles of **strictly lower rank** (`SECURITY_ENGINEER`, `AI_DEVELOPER`, `AUDITOR`, `VIEWER`). | **Custom** |
| R4 | An `ORG_ADMIN` can change the role of, or remove, only members of strictly lower rank (never another `ORG_ADMIN`). | **Custom** |
| R5 | Nobody can raise their **own** role. Lowering one's own role is allowed (except R2). | Custom for non-owners (native covers owner promotion) |
| R6 | Role value must be exactly one of the six organization roles. | **Custom** (+ native `ROLE_NOT_FOUND`) |
| R7 | Leaving the organization is always allowed for non-last-owners. | Native |

### 10.5 Organization membership and RBAC diagram

```mermaid
flowchart TB
    U["User<br/>global role: USER | PLATFORM_ADMIN"]
    U -- "has 0..n" --> M1["Member<br/>org A · role: ORG_ADMIN"]
    U -- "has 0..n" --> M2["Member<br/>org B · role: VIEWER"]
    M1 --> OA["Organization A"]
    M2 --> OB["Organization B"]

    subgraph Request["REDOVA API request: GET /api/v1/organizations/{orgId}/audit-events"]
        direction TB
        S1["1. AuthGuard: valid session?"] -->|no| E401["401 UNAUTHENTICATED"]
        S1 -->|yes| S2["2. emailVerified?"]
        S2 -->|no| E403v["403 EMAIL_NOT_VERIFIED"]
        S2 -->|yes| S3["3. Membership (userId, orgId) in DB?"]
        S3 -->|no| E404["404 ORGANIZATION_NOT_FOUND"]
        S3 -->|yes| S4["4. roles[member.role].authorize({ auditLog: ['read'] })"]
        S4 -->|no| E403["403 FORBIDDEN_PERMISSION<br/>+ audit authz.access_denied"]
        S4 -->|yes| S5["5. TenantContext → service → Prisma where organizationId = orgId"]
    end
```

---

## 11. Database model: Better Auth tables vs REDOVA tables

### 11.1 Ownership

| Table (model) | Owner | Created by | Notes |
| --- | --- | --- | --- |
| `user` | Better Auth core (+ admin, twoFactor fields) | Better Auth CLI `generate` → Prisma | |
| `session` | Better Auth core (+ admin, organization fields) | CLI | |
| `account` | Better Auth core | CLI | Holds the password hash (`providerId = "credential"`). |
| `verification` | Better Auth core | CLI | Verification/reset identifiers (hashed). |
| `twoFactor` | twoFactor plugin | CLI | |
| `organization` | organization plugin | CLI | |
| `member` | organization plugin | CLI | |
| `invitation` | organization plugin | CLI | |
| `audit_event` | **REDOVA** | Hand-written Prisma model + SQL migration | The only custom table in Sprint 01. |

Rules:

- **Never hand-edit Better Auth–generated columns.** Regenerate with the Better Auth CLI — package `auth`, pinned to the installed version (`auth@1.7.14`; the older `@better-auth/cli` package stops at 1.4.x) — then review the diff before migrating.
- REDOVA may add to generated models only: **indexes** and **composite unique constraints** (listed in §12), marked with a `// REDOVA:` comment.
- The rate-limit table is **not** generated because rate limiting uses Redis (`customStorage`).

### 11.2 Logical relationships

```mermaid
erDiagram
    user ||--o{ session : "has"
    user ||--o{ account : "authenticates with"
    user ||--o| twoFactor : "may enroll"
    user ||--o{ member : "belongs via"
    organization ||--o{ member : "has"
    organization ||--o{ invitation : "issues"
    user ||--o{ invitation : "invites (inviterId)"
    organization ||--o{ audit_event : "scopes (no FK)"
    user ||--o{ audit_event : "acts (no FK)"

    user {
        string id PK
        string email UK
        boolean emailVerified
        string name
        string image
        string firstName
        string lastName
        datetime lastLoginAt
        datetime onboardingCompletedAt
        datetime lastActiveAt
        string role
        boolean banned
        string banReason
        datetime banExpires
        boolean twoFactorEnabled
        datetime createdAt
        datetime updatedAt
    }
    session {
        string id PK
        string token UK
        string userId FK
        datetime expiresAt
        string ipAddress
        string userAgent
        string activeOrganizationId
        string impersonatedBy
        datetime createdAt
        datetime updatedAt
    }
    account {
        string id PK
        string userId FK
        string providerId
        string accountId
        string password
        datetime createdAt
        datetime updatedAt
    }
    verification {
        string id PK
        string identifier
        string value
        datetime expiresAt
    }
    twoFactor {
        string id PK
        string userId FK
        string secret
        string backupCodes
        boolean verified
        int failedVerificationCount
        datetime lockedUntil
    }
    organization {
        string id PK
        string name
        string slug UK
        string logo
        string metadata
        datetime createdAt
    }
    member {
        string id PK
        string organizationId FK
        string userId FK
        string role
        datetime createdAt
    }
    invitation {
        string id PK
        string organizationId FK
        string email
        string role
        string status
        string inviterId FK
        datetime expiresAt
        datetime createdAt
    }
    audit_event {
        uuid id PK
        datetime occurredAt
        string action
        string outcome
        string actorType
        string actorUserId
        string organizationId
        string targetType
        string targetId
        string ipAddress
        string userAgent
        string requestId
        json metadata
    }
```

---

## 12. Important fields, relationships and constraints

### 12.1 Better Auth tables (native fields, verified)

| Model | Field | Constraint / meaning |
| --- | --- | --- |
| `user` | `email` | Unique; lower-cased natively. |
| | `emailVerified` | `false` until verification. Gate for sessions and org creation. |
| | `role` | Admin plugin; `input: false`; REDOVA values `USER` / `PLATFORM_ADMIN`. |
| | `banned`, `banReason`, `banExpires` | Admin plugin; `input: false`. Expired bans are lifted automatically at next sign-in. |
| | `twoFactorEnabled` | twoFactor plugin; `input: false`. |
| `session` | `token` | Unique bearer secret, carried in the signed cookie. Never logged. |
| | `activeOrganizationId` | Organization plugin; `input: false`; convenience only. |
| | `impersonatedBy` | Admin plugin; always null in REDOVA (impersonation disabled). |
| `account` | `password` | Hash; never selected by REDOVA repositories. |
| `twoFactor` | `secret`, `backupCodes` | `returned: false`, encrypted at rest. |
| | `failedVerificationCount`, `lockedUntil` | Native lockout state. |
| `organization` | `slug` | Unique. REDOVA treats it as **immutable** after creation (hook rejects slug changes, `ORG_SLUG_IMMUTABLE`), because future URLs and references use it. |
| `member` | `organizationId`, `userId`, `role` | FK to `organization` / `user`, indexed natively. |
| `invitation` | `status` | `pending` · `accepted` · `rejected` · `canceled`. |
| | `expiresAt` | 7 days (REDOVA config). |

### 12.2 REDOVA additions to generated models

| Model | Addition | Why |
| --- | --- | --- |
| `member` | `@@unique([organizationId, userId])` | Defense in depth against duplicate memberships under concurrent invitation acceptance. |
| `user` | `@@index([createdAt, id])` | Keyset/cursor pagination for admin user list. |
| `user` | `firstName?`, `lastName?` | Optional profile fields accepted by Better Auth sign-up and profile updates; `name` remains the display name. |
| `user` | `lastLoginAt?`, `onboardingCompletedAt?`, `lastActiveAt?` | Optional server-owned timestamps (`input: false`). No automatic tracking is wired yet; application lifecycle handlers must populate them. |
| `invitation` | `@@index([organizationId, status])` | Pending invitations list. |

The dedicated `20261031131000_saas_tenant_foundation` migration adds the SaaS data foundation:

| Model/table | Fields and semantics |
| --- | --- |
| `organization` | Server-owned `status` (`ACTIVE`, `SUSPENDED`, `ARCHIVED`), `suspendedAt?`, `suspensionReason?`, `archivedAt?`, `updatedAt`. |
| `member` | Server-owned `status` (`ACTIVE`, `SUSPENDED`, `REVOKED`), `suspendedAt?`, `lastActiveAt?`. |
| `OrganizationSettings` / `organization_settings` | One row per organization: `requireMfa` (default false), `sessionMaxAgeSeconds?`, `auditRetentionDays?`, creation/update timestamps. NULL durations inherit platform policy. |
| `TenantSubscription` / `tenant_subscription` | One current subscription per organization: nonempty `planId`, `status` (`INCOMPLETE`, `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELED`), `trialEndsAt?`, `currentPeriodEnd?`, timestamps. `planId` is a catalog identifier; no billing provider or plan catalog is configured yet. |
| `TenantQuota` / `tenant_quota` | One row per organization: `maxMembers?`, `maxAgents?`, `maxAssessments?`, `maxStorageBytes?` (BigInt), timestamps. NULL means no configured ceiling; zero permits no allocation. |

Foreign keys and primary keys prevent orphan or duplicate tenant configurations. SQL CHECK constraints
validate status strings, positive policy durations and nonnegative quotas. Existing organizations receive
neutral settings and quota rows; new organizations must be provisioned by the future SaaS service.
No subscription is fabricated during migration. Storage-byte limits need string conversion before JSON
serialization because Prisma returns BigInt.

These fields are metadata only at this stage: suspension checks, MFA/session policy enforcement, billing,
quota consumption and retention processing are not wired. UM-006/UM-008 still own authorization and
tenant-isolation enforcement. Future tenant-owned resources must have a mandatory `organizationId`
foreign key and server-controlled `createdByUserId`, with tenant-scoped queries and relationship checks.

### 12.3 `audit_event` (REDOVA)

| Column | Type | Constraint | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, `@default(uuid(7))` | UUIDv7 is time-ordered, so it serves as the cursor key on its own. |
| `occurredAt` | `timestamptz` | not null, default `now()` | |
| `action` | `text` | not null | From the catalog in §17.4 (e.g. `admin.user.banned`). Validated by a Zod enum in `contracts`. |
| `outcome` | enum `SUCCESS`, `FAILURE`, `DENIED` | not null | |
| `actorType` | enum `USER`, `SYSTEM`, `ANONYMOUS` | not null | |
| `actorUserId` | `text` | nullable, **no FK** | Audit must survive user changes. |
| `organizationId` | `text` | nullable, **no FK** | `null` = platform scope. |
| `targetType` | enum `USER`, `SESSION`, `ORGANIZATION`, `MEMBER`, `INVITATION` | nullable | |
| `targetId` | `text` | nullable | |
| `ipAddress`, `userAgent` | `text` | nullable | |
| `requestId` | `text` | nullable | Correlates with logs. |
| `metadata` | `jsonb` | not null, default `{}` | **Allow-listed keys only**; never secrets, tokens, passwords or raw emails of non-users (§17.3). |

Indexes: `(organizationId, id DESC)`, `(actorUserId, id DESC)`, `(action, id DESC)`.

**Append-only:** a migration adds a trigger `audit_event_immutable` that raises an exception on `UPDATE` or `DELETE`. Retention: indefinite in Sprint 01 (purging policy = future).

### 12.4 Cascades

Native generated relations cascade on user/organization deletion (`session`, `account`, `twoFactor`, `member`, `invitation`). Since neither user deletion nor organization deletion is exposed in Sprint 01, no cascade is reachable through the product. `audit_event` has no FKs on purpose.

---

## 13. User workflows: registration to organization access

All workflows are sequences of API calls. They are the basis of the API end-to-end journeys (§19.4).

### 13.1 Journey A — new user creates an organization (`E2E-JOURNEY-01`)

| Step | Call | Result |
| --- | --- | --- |
| 1 | `POST /api/auth/sign-up/email { name, email, password, callbackURL }` | `200` generic; user unverified; verification email queued |
| 2 | `GET <verification link from the email>` | Email verified; session cookie set; `302` to `callbackURL` |
| 3 | `POST /api/auth/organization/check-slug { slug }` | Slug available |
| 4 | `POST /api/auth/organization/create { name, slug }` | Caller becomes `ORG_OWNER`; organization set active |
| 5 | `GET /api/auth/organization/get-full-organization?organizationId=…` | Organization with one member (`ORG_OWNER`) |
| 6 | `POST /api/auth/organization/invite-member { email, role, organizationId }` | Invitation created and emailed |

### 13.2 Journey B — invited user without an account (`E2E-JOURNEY-02`)

Key rules:

- The invitation email contains a link to the future frontend page `WEB_ORIGIN/invitations/{invitationId}`. In this phase, API clients (and tests) extract the `invitationId` from it.
- Native `GET /organization/get-invitation` requires a session and checks that the caller is the recipient. REDOVA deliberately adds **no** public invitation endpoint, so nothing about an invitation is readable anonymously.
- If the user signs up with a different email, acceptance fails natively (`YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION`).

```mermaid
sequenceDiagram
    autonumber
    actor A as ORG_ADMIN
    actor I as Invitee
    participant BA as Better Auth
    participant H as REDOVA hooks
    participant Q as Email queue

    A->>BA: POST /organization/invite-member { email, role, organizationId }
    BA->>BA: Permission invitation:create (native)
    BA->>H: beforeCreateInvitation → rank rules R1/R3/R6
    alt rule violated
        H-->>A: 403 ORG_ROLE_ESCALATION_FORBIDDEN
    else allowed
        BA->>BA: Cancel previous pending invite for same email (native)
        BA->>Q: organization-invitation email (invitation id, 7 days)
        H->>H: audit org.invitation.created
        BA-->>A: 200 invitation
    end
    Q->>I: Email
    I->>BA: POST /sign-up/email (invited email)
    I->>BA: GET verification link
    I->>BA: GET /organization/get-invitation?id=…
    I->>BA: POST /organization/accept-invitation { invitationId }
    BA->>BA: Checks: pending, not expired, email matches, email verified (native)
    BA->>BA: Create member(role), set active organization
    H->>H: audit org.invitation.accepted
    BA-->>I: 200 member
```

### 13.3 Journey C — user with several organizations (`E2E-JOURNEY-06`)

1. Sign-in (and 2FA when enabled).
2. `GET /api/auth/organization/list` returns the user's organizations (bounded by `organizationLimit`).
3. `POST /api/auth/organization/set-active { organizationId }` changes the convenience active organization [Native]. Switching to an organization the user does not belong to returns `403 USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION` and **clears** the active organization (native fail-closed behavior, verified in IT-005-13).
4. REDOVA tenant-scoped APIs always use the organization in the **path**, independent of the active organization (§10.2).

### 13.4 Journey D — member management

| Operation | Call |
| --- | --- |
| Change role | `POST /api/auth/organization/update-member-role { memberId, role, organizationId }` |
| Remove member | `POST /api/auth/organization/remove-member { memberIdOrEmail, organizationId }` |
| Leave | `POST /api/auth/organization/leave { organizationId }` |
| Cancel invitation | `POST /api/auth/organization/cancel-invitation { invitationId }` |

A removed member's sessions keep working, but every access to that organization is denied on the next request, because membership is checked per request.

---

## 14. Admin workflows

All admin workflows go through REDOVA `/api/v1/admin/*` (envelope, cursor, audit) and require `PLATFORM_ADMIN` + MFA enrolled. Mutations additionally require recent authentication and a trusted `Origin`.

| Workflow | API | Rules |
| --- | --- | --- |
| List / search users | `GET /api/v1/admin/users?q=&status=&role=&limit=&cursor=` | Cursor pagination, newest first. |
| View user | `GET /api/v1/admin/users/{userId}` | Profile, verification, MFA, global role, ban info, membership count, active session count. |
| List a user's sessions | `GET /api/v1/admin/users/{userId}/sessions` | Session ids, IP, user agent, dates. Tokens never returned. |
| Ban user | `PUT /api/v1/admin/users/{userId}/ban { reason, expiresInDays }` | Not self (native), not a `PLATFORM_ADMIN` (custom). Native ban revokes all sessions. Idempotent: an identical repeat is a no-op. |
| Unban user | `DELETE /api/v1/admin/users/{userId}/ban` | Idempotent (unbanning an active user → 204). |
| Revoke one session | `DELETE /api/v1/admin/users/{userId}/sessions/{sessionId}` | Session id resolved to token server-side. Must belong to `{userId}`, otherwise 404. |
| Revoke all sessions (global sign-out of a user) | `DELETE /api/v1/admin/users/{userId}/sessions` | Idempotent. |
| Change global role | `PUT /api/v1/admin/users/{userId}/role { role }` | Not self; not demoting the last admin. The rule is checked under a PostgreSQL advisory lock, so two admins demoting each other concurrently cannot leave zero admins. Promoted admins must enroll MFA before using admin APIs. |
| Platform audit log | `GET /api/v1/admin/audit-events` | Read-only. |
| Bootstrap first admin | CLI: `pnpm --filter @redova/server admin:promote --email <email>` | Requires an existing verified user; writes `admin.bootstrap.promoted` audit (actor `SYSTEM`). Refuses if a `PLATFORM_ADMIN` already exists unless `--force` is given (audited). |

**Ban semantics (native + custom):** ban ⇒ all sessions deleted immediately ⇒ next request with an old cookie gets `401` ⇒ any new sign-in gets `403 BANNED_USER` until `banExpires`. The banned user's memberships and data are kept. Ban reason is **never** returned to the banned user.

---

## 15. API client contract

This section is what any API client (automated tests today, the web app later) must respect. It replaces UI specifications in this backend-only phase.

| Topic | Contract |
| --- | --- |
| Base URLs | Native auth: `{BETTER_AUTH_URL}/api/auth/*`. REDOVA: `{BETTER_AUTH_URL}/api/v1/*`. |
| Authentication | Session cookie `redova.session_token` (`__Secure-` prefix on HTTPS). Clients send it with every request (`credentials: "include"` in browsers; a cookie jar in tests). No bearer tokens in Sprint 01. |
| Request bodies | `Content-Type: application/json` only. Other content types are rejected. |
| Origin | State-changing requests must carry `Origin: {WEB_ORIGIN}`. Better Auth (native origin check) and REDOVA (`OriginGuard`) reject other origins. |
| Redirect URLs | `callbackURL` (sign-up, send-verification-email, sign-in) and `redirectTo` (request-password-reset) must be absolute URLs on `WEB_ORIGIN` or relative paths. Anything else is rejected natively. |
| Error formats | Native endpoints: `{ code, message }`. REDOVA endpoints: the `{ data, meta, error }` envelope (§18.2). Clients branch on `code` / `error.code`, never on message text. |
| Rate limiting | `429` with an `X-Retry-After` header (seconds) on native endpoints. |
| HIBP outage | Password-setting endpoints may return `500` when the breach check is unavailable. Clients should retry later and not treat it as a password error. |
| Two-factor sign-in | `POST /sign-in/email` may return `{ twoFactorRedirect: true }` and a short-lived two-factor cookie instead of a session. The client must then call `/two-factor/verify-totp` or `/two-factor/verify-backup-code` within 10 minutes. |
| Recent authentication | On `SESSION_NOT_FRESH` / `REAUTHENTICATION_REQUIRED`, re-authenticate through sign-in (+ two-factor), then revoke the superseded session (§5.5). |
| MFA enrollment secrets | `totpURI` and backup codes are returned once by `/two-factor/enable` (and backup codes by `/two-factor/generate-backup-codes`). Clients must render the QR code locally, show the codes once, and never send them to third parties or persistent storage. |
| Session tokens | Tokens returned by native `/list-sessions` are bearer secrets. Clients keep them in memory only and never log them. |
| Tenant selection | REDOVA tenant-scoped endpoints take `organizationId` in the path. Native member mutations (`update-member-role`, `remove-member`) must include `organizationId` in the body (`400 ORGANIZATION_ID_REQUIRED` otherwise). |
| Pagination | REDOVA lists: pass `meta.pagination.nextCursor` back as `?cursor=` until `hasMore` is `false` (§18.3). |
| Documentation | REDOVA API: `/api/v1/docs` (OpenAPI). Native API: `/api/auth/reference`. Both are served outside production only. |

---

## 16. Transactional email requirements

### 16.1 Pipeline

```text
Better Auth callback / hook ──► packages/queue producer ──► Redis (BullMQ "email" queue)
                                                          │
                                         apps/worker processor ──► Handlebars render (html + text)
                                                          │
                                         EmailSender port ──► SmtpEmailSender  (dev: Gmail · test/CI: Mailpit)
                                                         └──► ProviderApiEmailSender (prod: provider API key)
```

- **Why a queue:** Better Auth recommends not awaiting email delivery inside auth endpoints (prevents timing-based enumeration). Retries survive SMTP hiccups. The worker scales independently.
- **Job options:** `attempts: 5`, exponential backoff starting at 30 s, `removeOnComplete: true`, `removeOnFail: { age: 86400 }`.
- **Queue-level idempotency:** deterministic `jobId = "{template}-{sha256(dedupe-key)}"` (BullMQ rejects `:` in custom ids) (e.g. the verification URL). A retried HTTP request that re-enqueues the same email is deduplicated by BullMQ.
- **Delivery semantics:** at-least-once. A crash after SMTP accepted but before job completion can send a duplicate email; this is accepted.
- **Sensitive payloads:** jobs carry action URLs containing tokens. Mitigations: Redis on a private network with password (and TLS in prod), jobs removed on completion, payloads never logged, failed jobs kept at most 24 h.

### 16.2 Templates (Handlebars `.hbs`)

Location: `packages/integrations/src/email/templates/`. A shared `layouts/base.hbs` provides the header (REDOVA wordmark as text), the footer ("You received this email because…", support address) and the partials `button.hbs` and `security-footer.hbs`. Every template has an HTML and a plain-text variant (`*.html.hbs`, `*.text.hbs`). Templates are precompiled once at worker start.

| Template | Trigger | Variables | Subject |
| --- | --- | --- | --- |
| `verify-email` | sign-up, unverified sign-in, resend | `name`, `verifyUrl`, `expiresInHours` | Verify your REDOVA email address |
| `reset-password` | `/request-password-reset` (existing users only) | `name`, `resetUrl`, `expiresInMinutes`, `requestIp` | Reset your REDOVA password |
| `existing-account` | sign-up with an already registered email | `name`, `signInUrl`, `resetUrl` | You already have a REDOVA account |
| `organization-invitation` | invite / re-invite | `inviterName`, `organizationName`, `roleLabel`, `acceptUrl` (`WEB_ORIGIN/invitations/{id}`), `expiresAt` | {{inviterName}} invited you to {{organizationName}} on REDOVA |
| `security-notification` | password reset/changed, MFA enabled/disabled, backup codes regenerated | `name`, `eventLabel`, `occurredAt`, `ipAddress`, `secureAccountUrl` | Security alert: {{eventLabel}} |

Links that point to future frontend pages (`signInUrl`, `acceptUrl`, `secureAccountUrl`) are built from `WEB_ORIGIN`. Native action links (`verifyUrl`, `resetUrl`) are generated by Better Auth on `BETTER_AUTH_URL`.

Rules:

- Only `{{ }}` (escaped) interpolation. `{{{ }}}` (raw) is **forbidden**. A unit test scans the templates and fails the build if it finds a raw interpolation.
- User-controlled values (names, organization names) are escaped and truncated to 64 characters.
- No tracking pixels, no external images.
- Subject lines are rendered with Handlebars too and are stripped of CR/LF (header-injection defense).

### 16.3 Transports per environment

| Env | `EMAIL_TRANSPORT` | Details |
| --- | --- | --- |
| Development | `smtp` | Gmail SMTP `smtp.gmail.com:465` (TLS) with a **Google App Password**. The Google account must have 2-Step Verification enabled. `EMAIL_FROM` must be that Gmail address. Gmail limits sending volume (on the order of a few hundred messages/day), which is fine for development only. Credentials live in `apps/worker/.env.local` (git-ignored). |
| Test / CI / E2E | `smtp` | Mailpit container (`localhost:1025`, UI/API `:8025`). Tests read the emails through the Mailpit API to extract links. Same adapter as dev, different config. |
| Production | `api` | Transactional email provider via HTTP API + `EMAIL_API_KEY`. Provider choice pending (see decision D-11). SPF, DKIM and DMARC records configured for the sending domain. |

The worker refuses to start in production when `EMAIL_TRANSPORT=smtp` and `SMTP_HOST` is `smtp.gmail.com` (config validation).

---

## 17. Security requirements and threat considerations

### 17.1 Threat model (STRIDE-oriented)

| ID | Threat | Vector | Controls | Native / Custom | Verified by |
| --- | --- | --- | --- | --- | --- |
| T1 | Credential stuffing / brute force | Automated sign-in attempts | Per-IP rate limit (Redis), per-account throttle (10 failures / 15 min, Redis), HIBP on password set, MFA | Native + Custom | UM-002 / UM-008 tests |
| T2 | Account enumeration | Sign-up, sign-in, reset responses or timing | Generic responses (native), async email enqueue, per-account throttle applied to unknown emails too | Native + Custom | UM-002 / UM-003 tests |
| T3 | Session hijacking | Token theft, network sniffing | `HttpOnly`, `Secure`, `__Secure-` prefix, `SameSite=Lax`, HSTS, no cookie cache, revocation | Native + Custom | UM-008 tests |
| T4 | CSRF | Cross-site request with the victim's cookie | `SameSite=Lax`; Better Auth origin check on `/api/auth`; REDOVA `OriginGuard` on `/api/v1` non-GET; JSON-only bodies | Native + Custom | UM-008 tests |
| T5 | Privilege escalation (global) | Setting `role` via sign-up/update, admin endpoints over HTTP | `input: false` fields (native), admin HTTP paths disabled, REDOVA admin guard + safeguards | Native + Custom | UM-006 / UM-007 tests |
| T6 | Privilege escalation (organization) | ORG_ADMIN promoting self/others | Native owner protections + rank rules R3–R6 | Native + Custom | UM-006 tests |
| T7 | Cross-tenant data access (IDOR) | Guessing ids, forged org id, cursor reuse | Path tenant + per-request membership check + tenant-scoped queries + 404 policy | Custom | UM-006 contract kit |
| T8 | MFA bypass | Skipping challenge, reusing backup codes, guessing TOTP | Native two-factor cookie flow, single-use backup codes, account lockout | Native | UM-004 tests |
| T9 | Token leakage | Logs, DB dump, queue payloads | Hashed verification identifiers, logger redaction, queue payload hygiene | Native + Custom | UM-003 / UM-008 tests |
| T10 | Sensitive data exposure in APIs | Over-fetching entities | Zod output DTOs on every REDOVA response; `account.password` never selected; native `returned: false` | Native + Custom | UM-008 response-shape tests |
| T11 | Open redirect | `callbackURL` / `redirectTo` manipulation | `trustedOrigins` validation (native) | Native | UM-002 / UM-003 tests |
| T12 | Invitation hijacking | Forwarded invitation link | Email must match + verified email (native) | Native | UM-005 test |
| T13 | Audit tampering | App bug or compromised app user | Append-only trigger | Custom | UM-001 / UM-008 test |
| T14 | Email HTML / header injection | Malicious org or user name | Escaped Handlebars only, CR/LF stripping, length caps | Custom | UM-003 tests |
| T15 | Dependency on HIBP availability | HIBP outage | Fail-closed, documented for clients | Native | UM-002 test |
| T16 | Secret leakage | Committed `.env`, logs | `.env*` git-ignored, env validation, gitleaks in CI ([GIT-STRATEGY §11](../GIT-STRATEGY.md#11-secrets-and-sensitive-data)) | Custom | UM-008 CI |

### 17.2 Security requirements (testable)

| ID | Requirement |
| --- | --- |
| SR-01 | No session can exist for a user with `emailVerified = false`. |
| SR-02 | Password reset tokens expire after 30 min and can be used at most once. |
| SR-03 | Revoked sessions are rejected on the next request (no caching window). |
| SR-04 | Banned users cannot use existing sessions nor create new ones until the ban expires. |
| SR-05 | MFA-enabled users cannot obtain a session without a valid second factor; each backup code works once. |
| SR-06 | No user can raise their own global or organization role, or assign a role above what the policy permits. |
| SR-07 | A user can never read or modify data of an organization they are not a member of. Such requests return 404. |
| SR-08 | Organization membership is verified from the database on every tenant-scoped request. |
| SR-09 | Credential endpoints are rate-limited per IP and sign-in is throttled per account. Responses never reveal whether an account exists. |
| SR-10 | Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production. State-changing requests from untrusted origins are rejected. |
| SR-11 | Passwords, password hashes, session tokens, TOTP secrets, backup codes and reset/verification tokens never appear in API responses (except where natively designed, §5.3 and §7.3), logs, audit metadata or error messages. |
| SR-12 | Every privileged operation (§17.4, marked ★) creates exactly one audit event with actor, target, outcome, IP and request id. |

### 17.3 Logging and redaction

- Structured JSON logs via `nestjs-pino`, with a `requestId` (`x-request-id`, generated when absent) propagated to audit events and to the API envelope `meta.requestId`.
- Redacted paths: `req.headers.cookie`, `req.headers.authorization`, `res.headers["set-cookie"]`, `*.password`, `*.currentPassword`, `*.newPassword`, `*.token`, `*.code`, `*.secret`, `*.backupCodes`, `*.totpURI`, query `token`.
- Request bodies of `/api/auth/*` are **never** logged.
- Implementation and dev/production settings: [`apps/server/README.md`](../../apps/server/README.md#logging).

### 17.4 Security audit events

★ = privileged operation (SR-12). All events are written through `AuditService.record()` (UM-001). Each ticket wires the events of its own feature, and UM-008 verifies the catalog is complete.

| Action | Scope | Source (hook) | Ticket |
| --- | --- | --- | --- |
| `auth.sign_up.completed` | platform | `databaseHooks.user.create.after` | UM-002 |
| `auth.email.verified` | platform | `emailVerification.afterEmailVerification` | UM-003 |
| `auth.session.created` (sign-in success) | platform | `databaseHooks.session.create.after` | UM-002 |
| `auth.sign_in.failed` | platform | `hooks.after` `/sign-in/email` when `ctx.context.returned` is an `APIError` | UM-002 |
| `auth.sign_in.throttled` | platform | per-account throttle | UM-008 |
| `auth.sign_out` | platform | `hooks.after` `/sign-out` | UM-002 |
| `auth.session.revoked` | platform | `hooks.after` `/revoke-session`, `/revoke-other-sessions`, `/revoke-sessions` | UM-002 |
| `auth.password.reset_requested` | platform | `sendResetPassword` (existing users only) | UM-003 |
| `auth.password.reset_completed` ★ | platform | `onPasswordReset` | UM-003 |
| `auth.password.changed` ★ | platform | `hooks.after` `/change-password` | UM-004 |
| `auth.mfa.enabled` ★ | platform | `hooks.after` `/two-factor/verify-totp` with an authenticated session (enrollment) | UM-004 |
| `auth.mfa.disabled` ★ | platform | `hooks.after` `/two-factor/disable` | UM-004 |
| `auth.mfa.backup_codes_regenerated` ★ | platform | `hooks.after` `/two-factor/generate-backup-codes` | UM-004 |
| `auth.mfa.challenge_failed` | platform | `hooks.after` `/two-factor/verify-totp` / `verify-backup-code` returning an error (no session) | UM-004 |
| `auth.mfa.backup_code_used` | platform | `hooks.after` `/two-factor/verify-backup-code` success | UM-004 |
| `org.created` ★ | org | `organizationHooks.afterCreateOrganization` | UM-005 |
| `org.updated` ★ | org | `afterUpdateOrganization` | UM-005 |
| `org.invitation.created` ★ / `.canceled` ★ / `.accepted` / `.rejected` | org | `after*Invitation` hooks | UM-005 |
| `org.member.role_changed` ★ | org | `afterUpdateMemberRole` | UM-005 |
| `org.member.removed` ★ / `org.member.left` | org | `afterRemoveMember` / `hooks.after` `/organization/leave` | UM-005 |
| `authz.access_denied` | org or platform | REDOVA guards (403 only; 404 policy hits are not audited, to avoid noise) | UM-006 |
| `admin.user.banned` ★ / `admin.user.unbanned` ★ | platform | REDOVA admin service | UM-007 |
| `admin.user.role_changed` ★ | platform | REDOVA admin service | UM-007 |
| `admin.user.session_revoked` ★ / `admin.user.sessions_revoked` ★ | platform | REDOVA admin service | UM-007 |
| `admin.bootstrap.promoted` ★ | platform | CLI | UM-007 |
| `admin.user.mfa_reset` ★ | platform | Operator CLI | UM-004 |

Hook firing verified in UM-005 (RK-3, IT-005-12/15):

- `leave` does not call `afterRemoveMember`, so it is audited by `hooks.after` `/organization/leave` and never produces `org.member.removed`.
- Re-inviting (`cancelPendingInvitationsOnReInvite`) cancels the previous invitation without calling `afterCancelInvitation`. The replacement is visible as a second `org.invitation.created` for the same email; only explicit cancellations write `org.invitation.canceled`.
- `afterUpdateMemberRole` and `afterRemoveMember` receive the target member, not the actor. The actor is read from the session of the running endpoint (`tryGetCurrentAuthEndpointContext`); server-side calls without a session are recorded with `actorType = SYSTEM`.

Audit writes are **synchronous** in the same request, but they are **not** in the same DB transaction as Better Auth's own writes, because hooks run after the fact. A failed audit write is logged at `error` level and does not roll back the auth operation. This is an accepted trade-off, documented and covered by a test asserting the error log.

### 17.5 HTTP security headers (server)

| Header | Value |
| --- | --- |
| `Strict-Transport-Security` (prod) | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `X-Frame-Options` | `DENY` |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` on API responses (JSON only). The docs routes, which are non-production only, are excluded. |
| `X-Powered-By` | removed |

Set via `helmet` in `apps/server`. CORS is not enabled in this phase. The frontend phase will decide between a same-origin proxy (no CORS) and an explicit CORS allow-list for `WEB_ORIGIN`.

---

## 18. API ownership and integration boundaries

### 18.1 Two API surfaces

| Surface | Base path | Owner | Format | Pagination | Consumers |
| --- | --- | --- | --- | --- | --- |
| **Auth API** | `/api/auth/*` | Better Auth (configured in `packages/auth`, mounted by `apps/server`) | Native Better Auth JSON (`{ ...data }` / `{ code, message }`) | Native (bounded lists only) | API clients: tests now, the official Better Auth client SDK in the future web app |
| **REDOVA API** | `/api/v1/*` | `apps/server` controllers | `{ data, meta, error }` envelope | Cursor | API clients: tests now, the future web app and integrations |

Native endpoints are **not wrapped**. Wrapping them would break the official client SDK and its cookie handling, and it would duplicate security-critical code. REDOVA API controllers that need Better Auth call `auth.api.*` server-side, forwarding the caller's headers so that Better Auth's own permission checks still run.

### 18.2 REDOVA API envelope

```jsonc
// 200 — single resource
{ "data": { "id": "u_123", "email": "a@acme.io" }, "meta": { "requestId": "01J…" }, "error": null }

// 200 — collection
{
  "data": [ { "id": "u_123" } ],
  "meta": { "requestId": "01J…", "pagination": { "limit": 20, "nextCursor": "eyJpZCI6…", "hasMore": true } },
  "error": null
}

// 4xx/5xx
{
  "data": null,
  "meta": { "requestId": "01J…" },
  "error": { "code": "FORBIDDEN_PERMISSION", "message": "You do not have permission to perform this action.", "details": [] }
}
```

- `204 No Content` is used for idempotent `DELETE`s, with no body.
- `error.details` holds validation issues: `[{ "path": "role", "message": "Invalid enum value" }]`.
- `error.message` is human-readable and safe to display. It never contains stack traces or internal ids.
- Implemented by a global interceptor (success) and a global exception filter (errors) in `apps/server`. They apply only to Nest controllers, not to the Better Auth handler.

**Error code catalog** (`packages/contracts/src/errors.ts`):

| HTTP | Code |
| --- | --- |
| 400 | `VALIDATION_FAILED`, `INVALID_CURSOR` |
| 401 | `UNAUTHENTICATED` |
| 403 | `EMAIL_NOT_VERIFIED`, `MFA_ENROLLMENT_REQUIRED`, `REAUTHENTICATION_REQUIRED`, `FORBIDDEN_PERMISSION`, `ORIGIN_NOT_ALLOWED`, `ADMIN_SELF_ROLE_CHANGE_FORBIDDEN`, `ADMIN_TARGET_IS_PLATFORM_ADMIN` |
| 404 | `ORGANIZATION_NOT_FOUND`, `USER_NOT_FOUND`, `SESSION_NOT_FOUND` |
| 409 | `LAST_PLATFORM_ADMIN` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |

Custom codes thrown from Better Auth hooks (native format): `ORG_ROLE_ESCALATION_FORBIDDEN`, `ORG_ROLE_INVALID`, `ORGANIZATION_ID_REQUIRED`, `ORG_SLUG_IMMUTABLE`, `ORG_SLUG_INVALID`, `ORG_SLUG_RESERVED`, `ORG_NAME_INVALID`, `ORG_LOGO_INVALID`, `MFA_REQUIRED_FOR_ROLE`, `TOO_MANY_ATTEMPTS`.

### 18.3 Cursor pagination

- Query: `?limit=20&cursor=<opaque>`. `limit` ∈ [1, 100], default 20.
- Cursor = base64url-encoded JSON of the last item's key (`{ "id": "…" }`), validated with Zod. Tampered or undecodable → `400 INVALID_CURSOR`. Cursors are tenant-bound: the query always re-applies the tenant filter, so a cursor from another tenant yields no foreign rows.
- Implementation uses Prisma native cursor pagination: `take: limit + 1`, `cursor: { id }`, `skip: 1`, deterministic `orderBy` (`[{ createdAt: "desc" }, { id: "desc" }]` for users; `[{ id: "desc" }]` for UUIDv7 audit events). `hasMore` = an extra row was fetched.
- **Bounded collections are not paginated** and are served natively: organization members (≤ `membershipLimit` 100), invitations (≤ `invitationLimit` 100), a user's organizations (≤ `organizationLimit` 3), a user's sessions. If any of these limits is raised beyond 100, the collection moves to a cursor endpoint.

### 18.4 Idempotency

REDOVA uses idempotency **only where a retry could cause a duplicate side effect**:

| Operation | Mechanism | Redis? |
| --- | --- | --- |
| Admin ban / unban / role / revoke sessions | **Idempotent by design**: `PUT` (set state) and `DELETE` (remove state). Repeating the request leaves the same final state. A no-op repeat does **not** write a second audit event (state compared before writing). | No |
| Invitations | Native `cancelPendingInvitationsOnReInvite` — at most one pending invitation per email and organization | No |
| Organization creation | Natural key: unique `slug` → duplicate creation fails with a native error | No |
| Email jobs | BullMQ deterministic `jobId` deduplication | Yes (BullMQ) |
| **Future non-idempotent `POST`s** (e.g. launching an assessment run) | `Idempotency-Key` header convention, defined now and built with the first consumer: key stored in Redis via `SET NX` with a 24 h TTL, bound to `(userId, method, path, sha256(body))`. Same key + same payload → stored response replayed. Same key + different payload → `422 IDEMPOTENCY_KEY_REUSED`. Concurrent in-flight request → `409 IDEMPOTENCY_IN_PROGRESS`. | Yes |

No Sprint 01 REDOVA endpoint needs `Idempotency-Key`. Building the mechanism now would be speculative.

### 18.5 Redis usage (only where necessary)

| Use | Why Redis is needed | Ticket |
| --- | --- | --- |
| Better Auth rate-limit counters (`customStorage.consume`) | Atomic counters shared across server instances, with TTL | UM-001 |
| Per-account sign-in throttle | Same primitive, keyed by `sha256(normalized email)` | UM-008 |
| BullMQ email queue | Required by BullMQ | UM-003 |
| Idempotency keys | Future (§18.4) | — |
| **Not** sessions | PostgreSQL stays the single session store, so revocation is immediate and admin listing is consistent. Redis session caching would add dual-write complexity for no Sprint 01 benefit. | — |

### 18.6 REDOVA API endpoints (Sprint 01)

| Method & path | Guards | Ticket |
| --- | --- | --- |
| `GET /api/v1/health` | `@AllowAnonymous()` | UM-001 |
| `GET /api/v1/admin/users` | Auth, `@Roles(["PLATFORM_ADMIN"])`, MFA | UM-007 |
| `GET /api/v1/admin/users/{userId}` | same | UM-007 |
| `PUT /api/v1/admin/users/{userId}/ban` | same + Fresh + Origin | UM-007 |
| `DELETE /api/v1/admin/users/{userId}/ban` | same + Fresh + Origin | UM-007 |
| `PUT /api/v1/admin/users/{userId}/role` | same + Fresh + Origin | UM-007 |
| `GET /api/v1/admin/users/{userId}/sessions` | Auth, Roles, MFA | UM-007 |
| `DELETE /api/v1/admin/users/{userId}/sessions` | same + Fresh + Origin | UM-007 |
| `DELETE /api/v1/admin/users/{userId}/sessions/{sessionId}` | same + Fresh + Origin | UM-007 |
| `GET /api/v1/admin/audit-events` | Auth, Roles, MFA | UM-008 |
| `GET /api/v1/organizations/{organizationId}/audit-events` | Auth, `OrgPermissionGuard({ auditLog: ["read"] })` | UM-008 |

### 18.7 OpenAPI

- REDOVA API: `@nestjs/swagger` with Zod-derived DTOs (`nestjs-zod`), served at `/api/v1/docs` outside production.
- Auth API: Better Auth `openAPI()` plugin reference served at `/api/auth/reference` outside production.

### 18.8 Integration boundaries with future modules

Future modules (Agent Registry, Scenario Catalog, Assessments, Findings, Reports) **must**:

1. Expose tenant-scoped routes under `/api/v1/organizations/{organizationId}/…` protected by `OrgPermissionGuard` with the statements declared in §9.1.
2. Receive the tenant only through `TenantContext`.
3. Store `organizationId` on every tenant-owned row and index it.
4. Pass the cross-tenant contract test kit.
5. Write their privileged actions through `AuditService`.

---

## 19. Testing strategy

### 19.1 Test pyramid and tooling

| Level | Tool | Scope | Runs |
| --- | --- | --- | --- |
| Unit | Vitest | `packages/core` policies, Zod contracts, cursor codec, envelope interceptor/filter, template rendering, guards with mocked context | every commit |
| Integration | Vitest + Supertest against an in-process NestJS app, with real PostgreSQL and Redis (docker compose `test` profile) and Mailpit | Better Auth flows over HTTP, hooks, guards, REDOVA endpoints, tenant isolation | every PR |
| API end-to-end | Vitest + HTTP client (cookie jar) against the **running** server **and** worker, PostgreSQL, Redis, Mailpit | Critical user journeys across processes, including real email delivery through the queue (§19.4) | every PR |
| Security checks | Dedicated integration suites (`*.security.spec.ts`), `pnpm audit`, gitleaks | §17.2 requirements | every PR |

**Why Vitest instead of the scaffolded Jest:** `better-auth` ships ESM-only (`"type": "module"`). Vitest handles ESM natively; NestJS decorators are supported with `unplugin-swc`. The switch is done once, in UM-001.

### 19.2 Test data and isolation

- Factories in `packages/db/test/factories.ts` create users through **`auth.api.signUpEmail`**, so that fixtures go through the real hashing and plugin hooks. A helper marks the email verified directly in the DB, and another helper returns signed-in cookie headers.
- Each integration test file truncates REDOVA + Better Auth tables (except `_prisma_migrations`) in `beforeAll` and uses unique emails per test.
- HIBP: disabled in unit tests; one integration test enables it with an undici `MockAgent` returning a range that contains the password suffix.
- TOTP: tests compute valid codes from the secret extracted from `totpURI` (RFC 6238 implementation from `@better-auth/utils` or `otpauth`).
- Clock-dependent tests (token expiry, ban expiry, fresh session) use DB-level timestamp manipulation, not sleeping.

### 19.3 Coverage targets

| Package | Target |
| --- | --- |
| `packages/core` | ≥ 95% lines, 100% of escalation rules |
| `packages/contracts`, `packages/integrations` | ≥ 85% |
| `apps/server` | ≥ 80% lines; every guard and admin rule has a positive and a negative test |
| Security requirements SR-01…SR-12 | 100% mapped to at least one automated test (traceability column added in UM-008) |

### 19.4 API end-to-end journeys

| ID | Journey | Ticket |
| --- | --- | --- |
| E2E-JOURNEY-01 | Sign-up → verification link from Mailpit → create organization → full organization shows `ORG_OWNER` | UM-005 |
| E2E-JOURNEY-02 | Invite → invitee signs up → verifies → accepts → is a member with the invited role | UM-005 |
| E2E-JOURNEY-03 | Request reset → link from Mailpit → reset → old sessions rejected → sign in with new password | UM-003 |
| E2E-JOURNEY-04 | Enable MFA → sign in with TOTP → sign in with a backup code → reuse of that code rejected | UM-004 |
| E2E-JOURNEY-05 | Admin bans user → user's existing cookie rejected → sign-in refused → unban → sign-in works | UM-007 |
| E2E-JOURNEY-06 | User in two organizations: active-organization switch; tenant-scoped REDOVA calls follow the path organization | UM-005 |

---

## 20. Definition of Done

A ticket of this module is **Done** only when **all** of the following are true:

1. All acceptance criteria (Given/When/Then) pass as **automated tests**: unit, integration or API end-to-end as specified in the ticket.
2. `pnpm turbo run lint typecheck test` is green locally and in CI. No skipped tests without a linked follow-up.
3. Coverage targets of §19.3 are met for the touched packages.
4. Security considerations listed in the ticket are implemented and each has at least one negative test.
5. Every REDOVA API endpoint returns the `{ data, meta, error }` envelope, list endpoints use cursors, and the endpoints are documented in OpenAPI with their error codes.
6. No secret, token or password appears in logs, responses (outside native design) or audit metadata. This is checked by the redaction tests.
7. Every privileged operation introduced by the ticket writes its audit event, with a test.
8. Prisma migrations (if any) are committed, apply cleanly to an empty DB, and the generated Better Auth schema matches the plugin configuration (Better Auth CLI diff is empty).
9. The API client contract (§15) and the error catalog (§18.2) are updated if the ticket changes client-visible behavior.
10. This README (and `.env.example`) is updated if behavior or configuration changed. Terminology stays consistent with [Appendix A](#appendix-a--glossary).
11. Work was delivered following [GIT-STRATEGY.md](../GIT-STRATEGY.md): branch naming, Conventional Commits, the PR template fully filled in, no AI attribution, merge method per §6.
12. Self-review completed (solo development): security checklist §17.2 + tenant rules §10.3.

---

## 21. Implementation sprint roadmap

Full planning, capacity analysis and the solo-developer forecast are in [SPRINT-01.md](SPRINT-01.md).

| Ticket | Title | Priority | SP | Depends on |
| --- | --- | --- | --- | --- |
| [UM-001](tickets/UM-001-auth-foundation.md) | Better Auth Foundation & Database Integration | P0 | 8 | — |
| [UM-002](tickets/UM-002-authentication-sessions.md) | Registration, Login & Session Management | P0 | 3 | UM-001 |
| [UM-006](tickets/UM-006-rbac-multitenancy.md) | RBAC & Multi-Tenant Authorization | P0 | 5 | UM-001 |
| [UM-003](tickets/UM-003-email-verification-recovery.md) | Email Verification & Password Recovery | P0 | 5 | UM-002 |
| [UM-005](tickets/UM-005-organizations-invitations.md) | Organizations, Members & Invitations | P0 | 5 | UM-003, UM-006 |
| [UM-004](tickets/UM-004-mfa-security.md) | MFA TOTP & Account Security | P0 | 5 | UM-002 (UM-003 for notifications) |
| [UM-007](tickets/UM-007-admin-management.md) | Admin User Management | P1 | 5 | UM-004, UM-006 |
| [UM-008](tickets/UM-008-security-testing.md) | Security Audit, Integration Tests & Hardening | P0 | 8 | UM-005, UM-007 |

> Ticket IDs are stable identifiers, **not** an execution order. UM-006 runs **before** UM-005 so that organization role management never ships without the escalation rules.

```mermaid
flowchart LR
    UM001[UM-001 Foundation] --> UM002[UM-002 Auth & Sessions]
    UM001 --> UM006[UM-006 RBAC & Tenancy]
    UM002 --> UM003[UM-003 Email & Recovery]
    UM002 --> UM004[UM-004 MFA & Security]
    UM003 -.notifications.-> UM004
    UM003 --> UM005[UM-005 Orgs & Invitations]
    UM006 --> UM005
    UM004 --> UM007[UM-007 Admin]
    UM006 --> UM007
    UM005 --> UM008[UM-008 Audit, Tests & Hardening]
    UM007 --> UM008
```

---

## Appendix A — Glossary

| Term | Definition |
| --- | --- |
| **Tenant** | An organization. The unit of data isolation. |
| **Active organization** | `session.activeOrganizationId` — convenience for "current organization". Never used to authorize REDOVA API calls. |
| **Global role** | `user.role`: `USER` or `PLATFORM_ADMIN`. |
| **Organization role** | `member.role`: one of `ORG_OWNER`, `ORG_ADMIN`, `SECURITY_ENGINEER`, `AI_DEVELOPER`, `AUDITOR`, `VIEWER`. |
| **Rank** | Number used only for member-management rules (§8.2). |
| **Membership** | A `member` row linking a user to an organization with one organization role. |
| **Auth API** | Better Auth native endpoints under `/api/auth/*`. |
| **REDOVA API** | Custom NestJS endpoints under `/api/v1/*` with the `{ data, meta, error }` envelope. |
| **API client** | Any consumer of the two APIs: automated tests and OpenAPI tools now, the web app later. |
| **Tenant context** | `{ userId, organizationId, memberId, role }` resolved by `OrgPermissionGuard` for a request. |
| **Recent authentication / fresh session** | Session created less than `freshAge` (1 h) ago. |
| **Privileged operation** | An operation that changes authentication or authorization state of an account or organization (★ in §17.4). |
| **Native / Custom** | Provided by Better Auth vs implemented by REDOVA. |
| **Bounded collection** | A list whose maximum size is enforced by configuration (≤ 100), served without cursor pagination. |
| **API end-to-end journey** | A black-box test across running server, worker and infrastructure, driven only through HTTP and Mailpit. |

---

## Appendix B — Decision log

| ID | Decision | Status |
| --- | --- | --- |
| D-01 | Migrate `backend/` + `frontend/` into the pnpm + Turborepo monorepo as the first task of UM-001 (frontend moved unchanged). | Confirmed |
| D-02 | Hybrid API boundary: native `/api/auth/*` for auth flows; REDOVA `/api/v1/*` with envelope + cursors; admin HTTP paths of Better Auth disabled. | Confirmed |
| D-03 | Self-service organization creation for verified users, limit 3 per user. | Confirmed (limit value proposed) |
| D-04 | Documentation language: English. | Confirmed |
| D-05 | MFA mandatory for `PLATFORM_ADMIN` only. | Confirmed |
| D-06 | Handlebars templates; Gmail App Password SMTP in dev; provider API in prod; Mailpit for test/CI. | Confirmed (Mailpit for CI proposed) |
| D-07 | Organization deletion disabled in Sprint 01. | Confirmed |
| D-08 | Frontend-to-API topology (same-origin proxy vs subdomain + CORS). | **Deferred** to the frontend phase |
| D-09 | `freshAge` = 1 h, which also applies to native `/list-sessions`. | Proposed |
| D-10 | Sessions stored only in PostgreSQL (no Redis secondary storage); `cookieCache` disabled. | Proposed |
| D-11 | Production email provider (e.g. Brevo, Resend, Postmark). | **Open** |
| D-12 | Vitest replaces Jest (ESM-only `better-auth`). | Proposed |
| D-13 | `PLATFORM_ADMIN` has no implicit access to tenant data; no impersonation. | Proposed |
| D-14 | Tenant taken from the URL path on REDOVA APIs; non-member → 404. | Proposed |
| D-15 | No `Idempotency-Key` endpoint in Sprint 01; convention defined for future POSTs. | Proposed |
| D-16 | Organization slug immutable after creation. | Proposed |
| D-17 | Backend-only phase: no UI work, no browser tests; journeys tested at API level. | Confirmed |
| D-18 | `invitation:read` follows native behavior (any member can list pending invitations). | Proposed |
| D-19 | Git workflow per [GIT-STRATEGY.md](../GIT-STRATEGY.md): GitHub Flow, Conventional Commits, squash-and-merge by default, no AI attribution. | Confirmed |

---

## Appendix C — Configuration reference

### C.1 Environment variables

| Variable | App | Example (dev) | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | all | `development` | |
| `PORT` | server | `3001` | |
| `DATABASE_URL` | server, worker | `postgresql://redova:redova@localhost:5433/redova` | |
| `REDIS_URL` | server, worker | `redis://localhost:6380` | Password required outside dev. |
| `BETTER_AUTH_SECRET` | server | 32+ random bytes (base64) | Never committed. Rotating it invalidates 2FA secrets → rotation procedure = future. |
| `BETTER_AUTH_URL` | server, worker | `http://localhost:3001` | Public server origin in this phase. |
| `WEB_ORIGIN` | server, worker | `http://localhost:3000` | The only trusted origin: `Origin` checks, `callbackURL` / `redirectTo` validation, links to future frontend pages in emails. |
| `EMAIL_TRANSPORT` | worker | `smtp` | `smtp` \| `api` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | worker | `smtp.gmail.com` / `465` / `true` | Mailpit in test: `localhost` / `1025` / `false`. |
| `SMTP_USER` / `SMTP_PASS` | worker | Gmail address / App Password | `.env.local` only. |
| `EMAIL_API_KEY` | worker | — | Production provider. |
| `EMAIL_FROM` | worker | `REDOVA <you@gmail.com>` | |
| `HIBP_ENABLED` | server | `true` | `false` only in unit tests. |
| `RATE_LIMIT_ENABLED` | server | `true` | Disabled by the integration tests except where rate limiting is under test. |
| `TEST_DATABASE_URL` | tests | — | Optional. Defaults to `DATABASE_URL` with the `_test` suffix (`redova_test`), created and migrated automatically. |
| `LOG_LEVEL` | all | `info` | |

All variables are validated at boot with a Zod schema. The app fails fast with a list of missing or invalid variables.

In local development every app and package reads the **repository-root `.env`** (template: `.env.example`). CI and production inject the variables directly; Turborepo passes `DATABASE_URL`, `TEST_DATABASE_URL`, `REDIS_URL`, `NODE_ENV` and `CI` through to tasks (`globalPassThroughEnv`).

### C.2 Rate-limit rules (`rateLimit.customRules`, per IP)

| Path | Window | Max |
| --- | --- | --- |
| `/sign-in/email` | 60 s | 5 |
| `/sign-up/email` | 300 s | 5 |
| `/request-password-reset` | 300 s | 3 |
| `/reset-password` | 300 s | 5 |
| `/send-verification-email` | 300 s | 3 |
| `/two-factor/verify-totp` | 60 s | 5 |
| `/two-factor/verify-backup-code` | 60 s | 5 |
| `/organization/invite-member` | 60 s | 10 |
| default (all other auth paths) | 60 s | 100 |

Per-account sign-in throttle (custom): 10 failed attempts per normalized email per 15 min → `429 TOO_MANY_ATTEMPTS` with a generic message, applied identically to existing and non-existing emails.

### C.3 Local infrastructure (`docker/docker-compose.yml`)

| Service | Image | Ports | Profile |
| --- | --- | --- | --- |
| `postgres` | `postgres:17` | 5433 (host) → 5432 | default |
| `redis` | `redis:7` | 6380 (host) → 6379 | default |
| `mailpit` | `axllent/mailpit` | 1025 (SMTP), 8025 (UI/API) | `test` (also usable in dev) |

Host ports 5433/6380 avoid clashes with other local PostgreSQL/Redis instances; all ports are bound to `127.0.0.1` only. Override them with `POSTGRES_PORT`, `REDIS_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT`.
