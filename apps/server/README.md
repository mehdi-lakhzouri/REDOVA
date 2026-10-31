# @redova/server

NestJS REST API. See the [root README](../../README.md) and the [User Management docs](../../docs/user-management/README.md).

## Logging

Pino is configured once through `LoggingModule.forRoot(env)` in `AppModule`. Nest's own logs and
application `Logger` calls use the same configuration. No additional logger package or feature-module
registration is needed.

| File in `src/logging/`    | Responsibility                                                          |
| ------------------------- | ----------------------------------------------------------------------- |
| `logging.module.ts`       | Nest module registration and exported HTTP logging service              |
| `pino.config.ts`          | Environment, levels, timestamps, development transport and HTTP policy  |
| `http-logging.service.ts` | Early HTTP logging and context, including Better Auth's Express handler |
| `log-serializers.ts`      | Allowlisted HTTP/error fields and URL sanitization                      |
| `log-redaction.ts`        | Central list of sensitive structured fields                             |

### Environment

Configuration is validated at startup in `src/config/env.ts`. Local development loads the root `.env`;
production should inject variables directly. Turborepo forwards the logging variables to server tasks.

| Variable           | Default       | Behavior                                                                                             |
| ------------------ | ------------- | ---------------------------------------------------------------------------------------------------- |
| `NODE_ENV`         | `development` | `development`: readable `pino-pretty`; `production`: JSON; `test`: automatic HTTP logs disabled      |
| `LOG_LEVEL`        | `info`        | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`                                         |
| `LOG_SERVICE_NAME` | `redova-api`  | Service identity attached to every entry                                                             |
| `LOG_AUTO_LOGGING` | `true`        | Set `false` to suppress HTTP access logs while keeping server failures and explicit application logs |

Development:

```dotenv
NODE_ENV=development
LOG_LEVEL=debug
LOG_SERVICE_NAME=redova-api
LOG_AUTO_LOGGING=true
```

```bash
pnpm --filter @redova/server dev
```

Production:

```dotenv
NODE_ENV=production
LOG_LEVEL=info
LOG_SERVICE_NAME=redova-api
LOG_AUTO_LOGGING=true
```

```bash
pnpm turbo run build --filter=@redova/server
pnpm --filter @redova/server start
```

Production entries are JSON lines on stdout, with an ISO 8601 UTC timestamp, numeric `level`, textual
`severity`, `service` and `environment`. `pino-pretty` is used only in development; production does not
require development dependencies. Startup failures use a synchronous JSON fallback on stderr and exit
with code 1. Invalid environment configuration names the invalid variables on stderr before Nest starts.

Collect stdout/stderr with the container platform or a log collector; configure retention, rotation
and access there. The API does not create local log files or call a remote logging service per request.

### Request context and HTTP levels

The `x-request-id` header accepts 1–128 letters, digits, underscores, dots, colons or hyphens. An absent
or invalid value is replaced with a UUID. The same identifier appears in the response header, the
REDOVA API envelope's `meta.requestId`, request logs and security audit events. Better Auth retains its
native response format and receives the response header and logging context.

HTTP logging is mounted before Helmet and Better Auth's early Express handler. `nestjs-pino` uses
`useExisting: true` to bind the existing request logger for Nest controllers. Both paths share one root
Pino instance/transport; each HTTP request produces at most one completion entry.

- Successful HTTP requests: `info`.
- Successful `/api/v1/health` probes: `debug`, hidden at the default `info` threshold.
- Client errors (`4xx`, including `401`, `404` and `429`): `warn`, without a server error stack.
- Server errors (`5xx`) and transport failures: `error`, with duration and status.
- Unexpected API exceptions: the exception filter attaches the original error to `res.err`; Pino writes
  its type, message and stack on completion. The client receives the existing masked error envelope.
- Application startup failures: `fatal`.

`LOG_LEVEL=silent` suppresses all Pino logs, including failures. Security audit events remain separate
database records written by `AuditService`.

### Logging from a service

Use Nest's standard logger, a stable message, and a small object of useful metadata:

```typescript
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  recordCompletion(reportId: string): void {
    this.logger.log({ event: 'report.completed', reportId }, 'Report completed');
  }
```

Nest's `log()` maps to Pino's `info()`, and `verbose()` maps to `trace()`. The class context and current
request identifier are added automatically. For structured errors use
`this.logger.error({ err: error, reportId }, 'Report generation failed')`.

For metadata that must follow all later logs in a controller request, inject `PinoLogger` from
`nestjs-pino` and call `logger.assign({ operation: 'report.generate' })`. `assignResponse: true` also
adds these fields to the HTTP completion entry. Use `assign()` inside an active request context.
Do not import the bare `LoggerModule` in feature modules: it is already global.

### Sensitive data

HTTP logs allow only method and sanitized URL path for requests, and status code for responses.
Headers, bodies, query strings and URL fragments are omitted. Reset tokens in
`/api/auth/reset-password/:token` are masked. The error serializer omits arbitrary properties such as
HTTP-client request configuration, response payloads or ORM metadata.

Structured credential fields are also masked at the root and through three nested object/array
containers; see `log-redaction.ts`. This is defense in depth, not recursive payload sanitization.
Never log entire DTOs, users, configuration objects, email jobs or auth payloads. Never interpolate
passwords, tokens or personal data into messages or error text: field redaction does not sanitize
free-text messages/stacks or arbitrary deeply nested objects. The temporary email sink logs only the
template, omitting recipient addresses, action URLs and deduplication keys in every environment.

### Verification

```bash
pnpm --filter @redova/server test
pnpm --filter @redova/server typecheck
pnpm --filter @redova/server lint
pnpm --filter @redova/server test:integration
```

Unit/HTTP tests capture real JSON output and cover redaction, request context isolation, early auth
handlers, error stacks, duplicate prevention and health-check severity. Integration tests require the
local Docker services and a built server; they use the isolated test database and Redis db 14.

References: [nestjs-pino](https://github.com/iamolegga/nestjs-pino),
[pino-http](https://github.com/pinojs/pino-http),
[Pino redaction](https://github.com/pinojs/pino/blob/main/docs/redaction.md).

## Authorization (UM-006)

Every REDOVA route is authenticated by the global Better Auth guard. Add one decorator from
`src/authz` per route:

| Decorator | Use for | Checks |
| --- | --- | --- |
| `@RequireOrgPermission({ resource: ['action'] })` | Tenant-scoped routes under `organizations/:organizationId/…` | trusted `Origin` on mutations, `ACTIVE` membership read from the database (non-member → 404), permission from the shared RBAC matrix (missing → 403, audited) |
| `@Tenant()` (parameter) | Reading the resolved tenant | `{ userId, organizationId, memberId, role }` — never read the tenant from body or query |
| `@PlatformAdmin()` | Admin reads | `PLATFORM_ADMIN` + MFA enrolled |
| `@PlatformAdminMutation()` | Admin writes | the above + session younger than 1 h + trusted `Origin` |

```typescript
@Controller('organizations/:organizationId/agents')
export class AgentsController {
  @Get(':agentId')
  @RequireOrgPermission({ agent: ['read'] })
  get(@Tenant() tenant: TenantContext, @Param('agentId') agentId: string) {
    // Always scope by tenant: findFirst({ where: tenantScoped(tenant.organizationId, { id: agentId }) })
    return this.agents.get(tenant, agentId);
  }
}
```

Every tenant-scoped module must also run the cross-tenant contract kit in its integration tests:

```typescript
describeTenantIsolation({
  name: 'agents',
  setup: async () => ({ t, a: { organizationId: orgA.id, cookie: ownerA }, b: { organizationId: orgB.id, cookie: ownerB } }),
  create: async (t, side) => createAgentVia(t, side),
  listPath: (orgId) => `/api/v1/organizations/${orgId}/agents`,
  itemPath: (orgId, id) => `/api/v1/organizations/${orgId}/agents/${id}`,
});
```

Organization role changes, removals and invitations go through Better Auth's native endpoints; the
role-rank rules (an `ORG_ADMIN` cannot grant or manage `ORG_ADMIN`/`ORG_OWNER`, nobody raises their own
role, one role per membership) are enforced by hooks in `packages/auth/src/org-escalation-hooks.ts`.
