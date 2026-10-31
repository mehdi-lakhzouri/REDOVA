import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { denyAccess } from './access-denied';
import { type AuthenticatedRequest, requireSession } from './authenticated-request';

/** `PLATFORM_ADMIN` with enrolled MFA (README §7.1, §9.3). */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly audit: AuditService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = requireSession(context.switchToHttp().getRequest<AuthenticatedRequest>());
    if (user.role !== 'PLATFORM_ADMIN') {
      throw await denyAccess(this.audit, 'FORBIDDEN_PERMISSION', { userId: user.id });
    }
    if (user.twoFactorEnabled !== true) {
      throw await denyAccess(this.audit, 'MFA_ENROLLMENT_REQUIRED', { userId: user.id });
    }
    return true;
  }
}
