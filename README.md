# REDOVA

Multi-tenant SaaS platform for **Agentic AI Security Testing and Automated Red Teaming** (OWASP Agentic AI Top 10).

| Path                 | Content                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server`        | NestJS REST API — Better Auth at `/api/auth`, REDOVA API at `/api/v1`                                                                          |
| `apps/web`           | Next.js frontend (not developed in the current backend-only phase)                                                                             |
| `packages/contracts` | Shared Zod schemas: API envelope, error codes, cursors, roles, audit catalog                                                                   |
| `packages/db`        | Prisma 7 schema, migrations, client and repositories                                                                                           |
| `packages/auth`      | Better Auth configuration, plugins and RBAC                                                                                                    |
| `docs/`              | [User Management module](docs/user-management/README.md), [Sprint 01](docs/user-management/SPRINT-01.md), [Git strategy](docs/GIT-STRATEGY.md) |

## Quick start

Requirements: Node ≥ 22.12 (see `.nvmrc`), pnpm 12, Docker.

```bash
pnpm install                 # also installs the commit-msg hook
cp .env.example .env         # then set BETTER_AUTH_SECRET (command in the file)
pnpm infra:up                # PostgreSQL :5433, Redis :6380, Mailpit :1025/:8025
pnpm db:migrate              # apply migrations
pnpm --filter @redova/server build && node apps/server/dist/main.js
pnpm --filter @redova/worker dev   # email worker (another terminal); emails land in Mailpit
curl http://localhost:3001/api/v1/health
```

- REDOVA API docs (non-production): <http://localhost:3001/api/v1/docs>
- Better Auth API reference (non-production): <http://localhost:3001/api/auth/reference>
- Mailpit inbox (local SMTP sink): <http://localhost:8025>. To send real mail in development, set the
  `SMTP_*` variables to Gmail with an App Password (`.env.example`); Gmail is refused in production.

## Common commands

| Command                                    | Purpose                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `pnpm dev`                                 | Watch mode for every app and package                                         |
| `pnpm turbo run build lint typecheck test` | What CI's `lint-typecheck-unit` job runs                                     |
| `pnpm turbo run test:integration`          | Integration tests (isolated `redova_test` database, Redis db 13-15, Mailpit) |
| `pnpm db:migrate:dev`                      | Create a migration after a schema change                                     |
| `pnpm db:schema:check`                     | Regenerate the Better Auth models and fail on drift                          |
| `pnpm infra:down`                          | Stop local infrastructure                                                    |

## Contributing

All changes follow [docs/GIT-STRATEGY.md](docs/GIT-STRATEGY.md): short-lived `<type>/um-<nnn>-<description>` branches, Conventional Commits, the PR template, squash-and-merge into `master`. `master` is protected: pull request, linear history and the `lint-typecheck-unit`, `integration` and `git-hygiene` checks are required.
