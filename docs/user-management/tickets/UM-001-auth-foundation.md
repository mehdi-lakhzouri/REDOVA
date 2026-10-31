# UM-001 — Better Auth Foundation & Database Integration

| Field | Value |
| --- | --- |
| Ticket ID | UM-001 |
| Title | Better Auth Foundation & Database Integration |
| Priority | **P0** |
| Story points | **8** |
| Dependencies | None |
| Blocks | UM-002, UM-006 (and transitively all others) |
| References | README §3, §4, §11, §12, §18, Appendix C; [GIT-STRATEGY.md](../../GIT-STRATEGY.md) |

## User story

**As a** REDOVA developer,
**I want** a monorepo in which Better Auth (with the Admin, Organization, Two-Factor and Have I Been Pwned plugins) is configured once, persisted with Prisma in PostgreSQL, and mounted in NestJS next to a REDOVA API that follows the `{ data, meta, error }` conventions, with the Git workflow enforced from the first commit,
**so that** every identity feature is built on one secure, consistent and tested foundation.

## Business objective

Remove the main technical risks of the module (ESM/CJS interop, Prisma 7, plugin schema) up front, and establish the API, error, logging, audit and Git conventions that every later ticket and module reuses. This supports BO-2, BO-4 and BO-5.

## Scope

### In scope

- Migration of `backend/` → `apps/server` and `frontend/` → `apps/web` (**moved unchanged**, no frontend work) into a pnpm + Turborepo workspace.
- Local infrastructure: PostgreSQL, Redis, Mailpit (test profile).
- `packages/contracts`, `packages/core` (skeleton), `packages/db`, `packages/auth`.
- Better Auth configuration with **all** plugins, the final access-control statements and roles (README §9), `disabledPaths`, Redis rate limiting.
- Prisma schema: Better Auth–generated models + REDOVA additions + `audit_event` (append-only).
- NestJS integration: `@thallesp/nestjs-better-auth`, envelope interceptor, exception filter, Zod validation, request id, structured logging with redaction, helmet, env validation, health endpoint, OpenAPI.
- `AuditService.record()` (write side only).
- Vitest (replacing Jest), base CI workflow.
- Git tooling from GIT-STRATEGY §12: PR template, commitlint, commit-msg hook, CI `git-hygiene` job.

### Out of scope

- Any change to `apps/web` beyond moving it.
- Email queue and worker (UM-003). Email callbacks call an injected `enqueueEmail` function whose BullMQ implementation arrives in UM-003.
- Organization escalation hooks (UM-006), admin endpoints (UM-007), audit read API (UM-008).

## Implementation tasks

### 0. Spike (timebox: 1 day)

- [x] Minimal NestJS 11 app in CommonJS importing `better-auth@1.7.14` (ESM-only) on Node ≥ 22.12 via `require(esm)`; mount through `@thallesp/nestjs-better-auth`; call `GET /api/auth/ok`.
- [x] Prisma 7 with `prisma.config.ts`, `@prisma/adapter-pg`, explicit generator `output`, used by `@better-auth/prisma-adapter`.
- [x] Record the outcome (works as-is / needs ESM build / other) in the "Spike result" section below before continuing.

### 1. Monorepo migration

- [x] Remove the nested `.git` folders and run `git init` at the repo root, with `master` as the default branch. (Done by the repository owner before the migration; the GitHub remote `origin` already exists.)
- [x] Move `backend/` → `apps/server` (package `@redova/server`) and `frontend/` → `apps/web` (package `@redova/web`, unchanged). Delete the per-project `pnpm-lock.yaml` / `pnpm-workspace.yaml`.
- [x] Root `package.json` (`packageManager` pinned, `engines.node >= 22.12`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`, explicit `allowBuilds`), `turbo.json` tasks: `build`, `dev`, `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`.
- [ ] Root `tsconfig.base.json`, shared ESLint flat config; import-boundary rules enforcing README §3.3.
- [ ] Root `.gitignore` covering `.env` and `.env.*` (except `.env.example`), `node_modules`, `.turbo`, `.next`, `dist`, `coverage`.
- [ ] Server default port `3001`.

### 2. Git tooling (GIT-STRATEGY §12)

- [ ] `.github/pull_request_template.md` with the exact template from GIT-STRATEGY §5.4.
- [ ] `commitlint.config.mjs` (`@commitlint/config-conventional`, scope enum, header length, `trailer-exists: never Co-authored-by:`).
- [ ] `simple-git-hooks` `commit-msg` hook running commitlint **and** the case-insensitive forbidden-attribution pattern (GIT-STRATEGY §4.5).
- [ ] CI job `git-hygiene`: branch-name regex, commitlint over `origin/master..HEAD`, forbidden-pattern scan of commit messages, PR title and PR body, PR title as Conventional Commit.
- [ ] Document the GitHub `master` protection settings (GIT-STRATEGY §8) in the root README and apply them once the remote exists.

### 3. Local infrastructure

- [ ] `docker/docker-compose.yml`: `postgres:17` (5432, volume), `redis:7` (6379), `axllent/mailpit` (1025/8025, profile `test`); healthchecks for all.
- [ ] Root scripts: `infra:up`, `infra:down`, `db:migrate`, `db:generate`, `db:studio`.

### 4. `packages/contracts`

- [ ] `envelope.ts`: `successEnvelope(schema)`, `paginatedEnvelope(schema)`, `errorEnvelope` Zod schemas + TS types.
- [ ] `errors.ts`: REDOVA error code enum + HTTP status map (README §18.2).
- [ ] `pagination.ts`: `limit` schema (1–100, default 20), opaque cursor codec (`encodeCursor`/`decodeCursor`, base64url JSON, Zod-validated).
- [ ] `roles.ts`: `GlobalRole` (`PLATFORM_ADMIN`, `USER`), `OrgRole` (6 values) Zod enums.
- [ ] `audit.ts`: `AuditAction` enum (full catalog README §17.4), `AuditOutcome`, `AuditActorType`, `AuditTargetType`.
- [ ] `email-jobs.ts`: `EmailJob` discriminated union (template + variables per template, README §16.2) and the `EnqueueEmail` function type.

### 5. `packages/db`

- [ ] Prisma 7 setup: `prisma.config.ts`, `schema.prisma` (generator with explicit `output`), client singleton using `@prisma/adapter-pg`.
- [ ] Generate Better Auth models with the Better Auth CLI — package **`auth@1.7.14`** (`pnpm exec auth generate --config <auth config> --output <schema.prisma> --yes`) — from the `packages/auth` config. Bootstrap order: `prisma generate` (empty client) → `auth generate` → `prisma migrate dev`. Commit the result.
- [ ] REDOVA additions (marked `// REDOVA:`): `member @@unique([organizationId, userId])`, `user @@index([createdAt, id])`, `invitation @@index([organizationId, status])`.
- [ ] `AuditEvent` model + enums (README §12.3) with `@default(uuid(7))`, indexes `(organizationId, id)`, `(actorUserId, id)`, `(action, id)`.
- [ ] SQL migration: trigger function + trigger `audit_event_immutable` raising on `UPDATE` / `DELETE`.
- [ ] `AuditEventRepository.create()`.
- [ ] `test/` helpers: `resetDatabase()` (truncate all tables except `_prisma_migrations`).

### 6. `packages/auth`

- [ ] `access-control.ts`: organization statements (`organization`, `member`, `invitation`, `auditLog`, `agent`, `assessment`, `finding`, `report`) and the 6 organization roles exactly as README §9.1. Global statements and the 2 global roles exactly as README §9.2.
- [ ] `create-auth.ts`: `createAuth(deps: { prisma, redis, enqueueEmail, audit, env })` returning `betterAuth({...})` with every option in README §4.1–§4.5 and `disabledPaths` from §4.6. `hooks: {}` minimum (required by the NestJS integration). Audit hooks `databaseHooks.session.create.after` and `user.create.after` are wired here as the reference implementation. Feature-specific hooks are added by later tickets.
- [ ] `redis-rate-limit-storage.ts`: `consume(key, { window, max })` implemented atomically (single Lua script, or `MULTI` with `INCR` + `EXPIRE NX` + `TTL`), returning `{ allowed, retryAfter }`.
- [ ] Development-only `enqueueEmail` implementation that logs the template name and action URL **only when `NODE_ENV=development`**, clearly marked "replaced in UM-003".

### 7. `apps/server`

- [ ] `main.ts`: `NestFactory.create(AppModule, { bodyParser: false })`, `helmet` (README §17.5), `x-powered-by` disabled, global prefix `api` + URI versioning so REDOVA routes live under `/api/v1`. Verify that `/api/auth/*` is **not** double-prefixed.
- [ ] `AuthModule.forRoot({ auth })` from `@thallesp/nestjs-better-auth` (global `AuthGuard`).
- [ ] Env validation (Zod) at boot (README Appendix C.1); fail fast with the list of invalid variables.
- [ ] `RequestIdMiddleware` (`x-request-id` in/out), `nestjs-pino` with the redaction paths from README §17.3; never log `/api/auth/*` bodies.
- [ ] Global `EnvelopeInterceptor` and `ApiExceptionFilter`, mapping `ZodError` → `VALIDATION_FAILED`, `HttpException`s → REDOVA codes, the library's unauthenticated error → `UNAUTHENTICATED`, Better Auth `APIError` (from `auth.api.*` calls) → mapped code, unknown → `INTERNAL_ERROR` without stack.
- [ ] `nestjs-zod` validation pipe + `@nestjs/swagger` at `/api/v1/docs` (non-production); Better Auth `openAPI()` plugin reference at `/api/auth/reference` (non-production).
- [ ] `GET /api/v1/health` (`@AllowAnonymous()`): DB `SELECT 1` + Redis `PING`.
- [ ] `AuditModule` (global) exposing `AuditService.record(input)` that adds `requestId`, `ipAddress` and `userAgent` from the request context and validates `action` against the contracts enum. On write failure it logs at `error` level and does not throw (README §17.4).

### 8. Tooling

- [ ] Replace Jest with Vitest (+ `unplugin-swc` for decorators) in `apps/server`. Add Vitest to the packages.
- [ ] `.github/workflows/ci.yml`: install → lint → typecheck → unit → integration (service containers: postgres, redis) → `git-hygiene`.
- [ ] `.env.example` for `apps/server`.

## Affected monorepo packages/apps

`apps/server`, `apps/web` (moved only), `packages/contracts`, `packages/core` (skeleton), `packages/db`, `packages/auth`, `docker/`, `.github/`, repository root.

## Database changes

| Change | Type |
| --- | --- |
| Tables `user`, `session`, `account`, `verification`, `twoFactor`, `organization`, `member`, `invitation` | Generated by the Better Auth CLI |
| `member` unique `(organizationId, userId)`; `user` index `(createdAt, id)`; `invitation` index `(organizationId, status)` | REDOVA additions |
| Table `audit_event` + enums `AuditOutcome`, `AuditActorType`, `AuditTargetType` | REDOVA |
| Trigger `audit_event_immutable` (BEFORE UPDATE OR DELETE → `RAISE EXCEPTION`) | REDOVA raw SQL migration |

## Frontend requirements

None (backend-only phase). `apps/web` is moved into the monorepo unchanged and must still build.

## Backend requirements

- Better Auth reachable at `/api/auth/*`, REDOVA API at `/api/v1/*`.
- All REDOVA responses use the envelope. Errors never include stack traces.
- Every route is authenticated unless explicitly marked `@AllowAnonymous()`. In Sprint 01, only `health` is.

## Security considerations

- `BETTER_AUTH_SECRET` ≥ 32 bytes, loaded from env only; boot fails if missing or too short.
- `trustedOrigins` = `[WEB_ORIGIN]` only.
- `disabledPaths` complete (README §4.6). Each path is tested to return 404.
- Role fields (`role`, `banned`, `twoFactorEnabled`, …) remain `input: false` (native). Verified in UM-006.
- Logger redaction verified by test. Request bodies of `/api/auth/*` are never logged.
- `audit_event` immutability enforced at the DB level.
- `.env*` git-ignored at the root. Forbidden AI-attribution trailers are blocked by the hook and CI.

## Acceptance criteria

### AC-001-01 — Workspace builds

- **Given** a fresh clone with Node ≥ 22.12 and pnpm
- **When** `pnpm install && pnpm turbo run build lint typecheck` runs
- **Then** every command exits 0 and the workspace lists `@redova/server`, `@redova/web`, `@redova/contracts`, `@redova/core`, `@redova/db`, `@redova/auth`.

### AC-001-02 — Health endpoint uses the envelope

- **Given** PostgreSQL and Redis running and a valid `.env`
- **When** `GET /api/v1/health` is called without a session
- **Then** the response is `200` with body `{ "data": { "status": "ok", "db": "up", "redis": "up" }, "meta": { "requestId": "<non-empty>" }, "error": null }`.

### AC-001-03 — Fail-fast configuration

- **Given** `BETTER_AUTH_SECRET` is unset (or shorter than 32 characters)
- **When** the server starts
- **Then** the process exits with a non-zero code and logs the variable name, without starting the HTTP listener.

### AC-001-04 — Better Auth is mounted once, at the right path

- **When** `GET /api/auth/ok` is called
- **Then** it returns `200 { "ok": true }`, and `GET /api/api/auth/ok` returns 404.

### AC-001-05 — Schema matches the plugin configuration

- **Given** the committed Prisma schema
- **When** the Better Auth CLI `generate` command runs again with the same configuration
- **Then** it produces no change to the Better Auth models.

### AC-001-06 — Migrations apply on an empty database

- **Given** an empty PostgreSQL database
- **When** `pnpm db:migrate` (deploy) runs
- **Then** all 9 tables, the REDOVA indexes/unique constraints and the trigger `audit_event_immutable` exist.

### AC-001-07 — Audit trail is append-only

- **Given** one row in `audit_event`
- **When** an `UPDATE` or a `DELETE` is executed on it through Prisma or raw SQL
- **Then** the statement fails with the trigger's exception and the row is unchanged.

### AC-001-08 — Validation errors use the envelope

- **Given** a REDOVA endpoint with a Zod-validated query (test-only controller)
- **When** it is called with an invalid parameter
- **Then** the response is `400` with `data: null`, `error.code = "VALIDATION_FAILED"`, and `error.details[0].path` naming the parameter.

### AC-001-09 — Unknown errors are masked

- **Given** a test-only endpoint that throws `new Error("db password=secret")`
- **When** it is called
- **Then** the response is `500` with `error.code = "INTERNAL_ERROR"`, a generic message, no stack and no part of the original message, while the server log contains the error with the same `requestId`.

### AC-001-10 — Authenticated by default

- **Given** a test-only REDOVA route without `@AllowAnonymous()`
- **When** it is called without a session cookie
- **Then** the response is `401` with `error.code = "UNAUTHENTICATED"` in the envelope.

### AC-001-11 — Wrapped/excluded Better Auth paths are not reachable over HTTP

- **When** each path listed in README §4.6 is called over HTTP with a valid session
- **Then** each returns `404`, while the corresponding `auth.api.*` function still works when called server-side in a test.

### AC-001-12 — Rate limiting is shared in Redis

- **Given** the rule `/sign-in/email` = 5 requests / 60 s
- **When** 6 sign-in requests are sent from the same IP within 60 s
- **Then** the 6th returns `429` with an `X-Retry-After` header, and a Redis key for that rule exists with a TTL ≤ 60 s.

### AC-001-13 — Secrets are redacted from logs

- **Given** a request carrying `Cookie: redova.session_token=abc` and a JSON body `{ "password": "x" }` to a REDOVA test route
- **When** the request is logged
- **Then** the log line contains neither `abc` nor `"x"` as a password value; the redacted fields show `[Redacted]`.

### AC-001-14 — Request id propagation

- **Given** a request with header `x-request-id: test-123`
- **When** any REDOVA endpoint answers
- **Then** the response header and `meta.requestId` are `test-123`. Without the header, a new id is generated and returned in both.

### AC-001-15 — Audit writer

- **Given** an authenticated request context
- **When** `AuditService.record({ action: "auth.sign_out", outcome: "SUCCESS", actorType: "USER", actorUserId })` is called
- **Then** one row exists with the given fields plus `requestId`, `ipAddress`, `userAgent`. An unknown `action` string is rejected before any DB write.

### AC-001-16 — Security headers

- **When** any `/api/v1` response is returned
- **Then** it has `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and no `X-Powered-By` header.

### AC-001-17 — Git hygiene is enforced

- **Given** the commit-msg hook is installed
- **When** a commit is attempted with the message `feat(auth): add plugin` followed by a `Co-Authored-By: Claude <noreply@anthropic.com>` trailer, or with `🤖 Generated with Claude Code` in the body, or with a non-conventional subject `Added stuff`
- **Then** each commit is rejected locally. The same messages pushed with `--no-verify` make the CI `git-hygiene` job fail, and a PR body containing either attribution text also fails the job. A branch named `feature/UM-1` fails the branch-name check.

## Test cases

### Unit (Vitest)

| ID | Test |
| --- | --- |
| UT-001-01 | `encodeCursor`/`decodeCursor` round-trip; tampered, empty and non-base64 cursors throw a typed `InvalidCursorError`. |
| UT-001-02 | `limit` schema: default 20, rejects 0, 101, non-integers. |
| UT-001-03 | `EnvelopeInterceptor` wraps plain objects and `Paginated<T>` results. |
| UT-001-04 | `ApiExceptionFilter` maps `ZodError`, `NotFoundException`, the library's unauthenticated error, Better Auth `APIError` and unknown errors to the right status and code. |
| UT-001-05 | Env schema rejects missing or short `BETTER_AUTH_SECRET`, invalid URLs and an unknown `EMAIL_TRANSPORT`. |
| UT-001-06 | Access control: each of the 8 roles exists. Spot checks: `VIEWER` cannot `invitation:create`, `AUDITOR` can `auditLog:read`, `PLATFORM_ADMIN` cannot `user:impersonate`. (The full matrix test is in UM-006.) |
| UT-001-07 | `AuditAction` enum contains every action of README §17.4 (snapshot). |
| UT-001-08 | Forbidden-attribution pattern matches `Co-Authored-By:`, `co-authored-by:`, `Generated with Claude Code`, `🤖`, and does not match ordinary messages. |

### Integration (Vitest + Supertest + PostgreSQL + Redis)

| ID | Test | AC |
| --- | --- | --- |
| IT-001-01 | Health envelope with db/redis up | AC-001-02 |
| IT-001-02 | `/api/auth/ok` reachable, no double prefix | AC-001-04 |
| IT-001-03 | Migrations on a fresh schema + trigger blocks update/delete | AC-001-06, AC-001-07 |
| IT-001-04 | Validation error envelope; masked 500 | AC-001-08, AC-001-09 |
| IT-001-05 | Default-protected route returns 401 envelope | AC-001-10 |
| IT-001-06 | Each `disabledPaths` entry → 404 over HTTP; `auth.api.listUsers` works server-side | AC-001-11 |
| IT-001-07 | 6th sign-in from one IP → 429; Redis key TTL; concurrent burst of 10 parallel requests lets exactly 5 through (atomicity) | AC-001-12 |
| IT-001-08 | Log redaction (capture pino output) | AC-001-13 |
| IT-001-09 | Request id in/out | AC-001-14 |
| IT-001-10 | `AuditService.record` persists the row; invalid action rejected | AC-001-15 |
| IT-001-11 | Boot with invalid env exits non-zero (child process) | AC-001-03 |
| IT-001-12 | Security headers on a `/api/v1` response | AC-001-16 |

### API end-to-end

| ID | Test | AC |
| --- | --- | --- |
| E2E-001-01 | `pnpm infra:up` + built server started as a separate process: `GET /api/v1/health` and `GET /api/auth/ok` succeed over real HTTP; `/api/v1/docs` and `/api/auth/reference` are served in development | AC-001-02, AC-001-04 |

### Tooling checks (CI)

| ID | Test | AC |
| --- | --- | --- |
| CHK-001-01 | Re-run the Better Auth CLI `generate` into a temp file and diff it against the committed schema → empty diff | AC-001-05 |
| CHK-001-02 | `git-hygiene` job fixture repo: forbidden trailer, attribution line, bad subject and bad branch name each fail; a clean branch passes | AC-001-17 |

## Definition of Done

- [ ] Global Definition of Done (README §20) satisfied.
- [x] Spike result recorded below.
- [ ] All AC-001-xx covered by the listed automated tests, green in CI.
- [ ] `README.md` Appendix C matches the real env variables and compose services.
- [ ] A new developer can go from clone to a running health endpoint by following the root README in under 15 minutes.
- [ ] The first PRs of the repository already use the PR template and pass `git-hygiene`.

## Spike result

**Outcome: GO — works as-is with a CommonJS NestJS build.** Spike run on 2026-10-31 in a throw-away project (not merged), Node 24.18, pnpm 12.4.2.

| Check | Result |
| --- | --- |
| `require("better-auth")` (ESM-only) from CommonJS | Works on Node 24 (`require(esm)`). No ESM build of the server needed. |
| TypeScript 5.9.3, `module: nodenext`, CJS package importing `better-auth` and `better-auth/plugins` | Compiles without errors. |
| `@thallesp/nestjs-better-auth@2.8.0` + NestJS 11.1.6 (`bodyParser: false`) | `GET /api/auth/ok` → `{ ok: true }`; `@AllowAnonymous()` route → 200; protected route → 401 without session, 200 with the session cookie from sign-up. |
| Prisma 7.10.1 + `@prisma/adapter-pg` + `@better-auth/prisma-adapter@1.7.14` | Sign-up persisted the user with `role = "user"` default (admin plugin). Generator `prisma-client` with `moduleFormat = "cjs"` and explicit `output`; datasource URL lives in `prisma.config.ts`. |
| Better Auth CLI | The CLI for 1.7.x is the package **`auth`** (`auth@1.7.14`); `@better-auth/cli` is frozen at 1.4.x. `auth generate` produced the 8 expected models (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `twoFactor`). |

Consequences for this ticket:

1. Keep the server in **CommonJS** (default NestJS build); keep **NestJS 11** and **TypeScript 5.9.3** (latest majors NestJS 12 / TypeScript 7 / Prisma 8 RC are out of scope for Sprint 01).
2. Schema bootstrap order: `prisma generate` with an empty schema first (the auth config imports the generated client), then `auth generate`, then `prisma migrate dev`.
3. pnpm 12 blocks install scripts unless allowed: `allowBuilds` in `pnpm-workspace.yaml` (`prisma` and `@prisma/engines` → `true`, `@nestjs/core` → `false`).
4. Import plugins from their dedicated paths (`better-auth/plugins/two-factor`, …) as recommended by the Better Auth skills committed in `.agents/`.
