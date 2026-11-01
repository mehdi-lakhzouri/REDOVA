import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OriginGuard } from '../authz/origin.guard';
import { OrgPermissionGuard } from '../authz/org-permission.guard';
import { MediaModule } from '../media/media.module';
import { OrganizationLogoController } from './organization-logo.controller';
import { OrganizationLogoService } from './organization-logo.service';

@Module({
  imports: [MediaModule, AuditModule],
  controllers: [OrganizationLogoController],
  providers: [OrganizationLogoService, OriginGuard, OrgPermissionGuard],
})
export class OrganizationsModule {}
