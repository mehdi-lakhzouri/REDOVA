import { Global, Module } from '@nestjs/common';
import { AuditQueryService } from './audit-query.service';
import {
  OrganizationAuditEventsController,
  PlatformAuditEventsController,
} from './audit-events.controller';
import { AuditService } from './audit.service';

/** Audit writer (global) and the read-only audit log API (UM-008). */
@Global()
@Module({
  controllers: [PlatformAuditEventsController, OrganizationAuditEventsController],
  providers: [AuditService, AuditQueryService],
  exports: [AuditService],
})
export class AuditModule {}
