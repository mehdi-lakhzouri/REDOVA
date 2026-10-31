import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import type { OrgPermissions } from '@redova/auth';
import type { TenantContext } from '@redova/contracts';
import type { AuthenticatedRequest } from './authenticated-request';
import { FreshSessionGuard } from './fresh-session.guard';
import { ORG_PERMISSIONS_KEY, OrgPermissionGuard } from './org-permission.guard';
import { OriginGuard } from './origin.guard';
import { PlatformAdminGuard } from './platform-admin.guard';

/** Tenant-scoped route: `:organizationId` membership + organization permission (README §10). */
export const RequireOrgPermission = (permissions: OrgPermissions) =>
  applyDecorators(
    SetMetadata(ORG_PERMISSIONS_KEY, permissions),
    UseGuards(OriginGuard, OrgPermissionGuard),
  );

/** The tenant resolved by OrgPermissionGuard. Never read the tenant from body or query. */
export const Tenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext => {
    const tenant = context.switchToHttp().getRequest<AuthenticatedRequest>().tenant;
    if (!tenant) throw new Error('@Tenant() requires @RequireOrgPermission() on the route');
    return tenant;
  },
);

/** PLATFORM_ADMIN with MFA (read endpoints). */
export const PlatformAdmin = () => applyDecorators(UseGuards(PlatformAdminGuard));

/** PLATFORM_ADMIN with MFA, recent authentication and a trusted origin (admin mutations). */
export const PlatformAdminMutation = () =>
  applyDecorators(UseGuards(PlatformAdminGuard, FreshSessionGuard, OriginGuard));
