import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OriginGuard } from '../authz/origin.guard';
import { OrgPermissionGuard } from '../authz/org-permission.guard';
import { AvatarMutationGuard } from '../profile/avatar-mutation.guard';
import { StorageModule } from '../storage/storage.module';
import { OrganizationLogoController } from './organization-logo.controller';
import { OrganizationLogoService } from './organization-logo.service';

@Module({
  imports: [StorageModule, AuditModule],
  controllers: [OrganizationLogoController],
  providers: [OrganizationLogoService, OriginGuard, OrgPermissionGuard, AvatarMutationGuard],
})
export class OrganizationsModule {}
