import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  auditEventSchema,
  orgAuditEventQuerySchema,
  paginatedEnvelope,
  platformAuditEventQuerySchema,
  successEnvelope,
  type TenantContext,
} from '@redova/contracts';
import { createZodDto } from 'nestjs-zod';
import { PlatformAdmin, RequireOrgPermission, Tenant } from '../authz/decorators';
import { AuditQueryService } from './audit-query.service';

class OrgAuditEventQueryDto extends createZodDto(orgAuditEventQuerySchema) {}
class PlatformAuditEventQueryDto extends createZodDto(platformAuditEventQuerySchema) {}
class AuditEventPageDto extends createZodDto(paginatedEnvelope(auditEventSchema)) {}
class AuditEventEnvelopeDto extends createZodDto(successEnvelope(auditEventSchema)) {}

/** Platform audit log: every event, all scopes (README §14). PLATFORM_ADMIN with MFA. */
@ApiTags('audit')
@ApiCookieAuth()
@Controller('admin/audit-events')
export class PlatformAuditEventsController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @PlatformAdmin()
  @ApiOperation({ summary: 'Platform audit log (newest first, cursor pagination)' })
  @ApiOkResponse({ type: AuditEventPageDto })
  list(@Query() query: PlatformAuditEventQueryDto) {
    return this.audit.list({ kind: 'platform' }, query);
  }

  @Get(':eventId')
  @PlatformAdmin()
  @ApiOperation({ summary: 'One audit event (404 NOT_FOUND)' })
  @ApiOkResponse({ type: AuditEventEnvelopeDto })
  get(@Param('eventId') eventId: string) {
    return this.audit.get({ kind: 'platform' }, eventId);
  }
}

/**
 * Organization audit log (README §10, §17.4): ORG_OWNER, ORG_ADMIN and AUDITOR of that organization.
 * The organization always comes from the tenant context, never from the query.
 */
@ApiTags('audit')
@ApiCookieAuth()
@Controller('organizations/:organizationId/audit-events')
export class OrganizationAuditEventsController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @RequireOrgPermission({ auditLog: ['read'] })
  @ApiOperation({ summary: 'Organization audit log (newest first, cursor pagination)' })
  @ApiOkResponse({ type: AuditEventPageDto })
  list(@Tenant() tenant: TenantContext, @Query() query: OrgAuditEventQueryDto) {
    return this.audit.list({ kind: 'organization', organizationId: tenant.organizationId }, query);
  }

  @Get(':eventId')
  @RequireOrgPermission({ auditLog: ['read'] })
  @ApiOperation({ summary: 'One audit event of the organization (404 NOT_FOUND)' })
  @ApiOkResponse({ type: AuditEventEnvelopeDto })
  get(@Tenant() tenant: TenantContext, @Param('eventId') eventId: string) {
    return this.audit.get({ kind: 'organization', organizationId: tenant.organizationId }, eventId);
  }
}
