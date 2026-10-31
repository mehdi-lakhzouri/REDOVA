import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasOrgPermission, type OrgPermissions } from '@redova/auth';
import { OrgRole } from '@redova/contracts';
import type { PrismaClient } from '@redova/db';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/api-exception';
import { PRISMA } from '../config/tokens';
import { denyAccess } from './access-denied';
import { type AuthenticatedRequest, requireSession } from './authenticated-request';

export const ORG_PERMISSIONS_KEY = 'redova:org-permissions';

/**
 * Tenant-scoped authorization (README §10.2): the tenant comes from the `:organizationId` path
 * parameter only, membership is read from the database on every request, non-members get 404 and
 * members without the permission get 403 (audited). PLATFORM_ADMIN has no bypass.
 */
@Injectable()
export class OrgPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { user } = requireSession(request);
    const organizationId = request.params.organizationId;
    if (typeof organizationId !== 'string' || organizationId.length === 0) {
      throw new ApiException('ORGANIZATION_NOT_FOUND');
    }

    // Suspended or revoked memberships grant nothing (tenant foundation `member.status`).
    const member = await this.prisma.member.findFirst({
      where: { organizationId, userId: user.id, status: 'ACTIVE' },
      select: { id: true, role: true },
    });
    if (!member) throw new ApiException('ORGANIZATION_NOT_FOUND');

    const required = this.reflector.getAllAndOverride<OrgPermissions | undefined>(
      ORG_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const role = OrgRole.safeParse(member.role);
    if (!role.success || (required && !hasOrgPermission(member.role, required))) {
      throw await denyAccess(this.audit, 'FORBIDDEN_PERMISSION', {
        userId: user.id,
        organizationId,
        metadata: { role: member.role, required: JSON.stringify(required ?? {}) },
      });
    }

    request.tenant = { userId: user.id, organizationId, memberId: member.id, role: role.data };
    return true;
  }
}
