import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { SESSION_FRESH_AGE_SECONDS } from '@redova/auth';
import { AuditService } from '../audit/audit.service';
import { denyAccess } from './access-denied';
import { type AuthenticatedRequest, requireSession } from './authenticated-request';

/** Recent authentication: the session was created less than `freshAge` ago (README §5.5). */
export const isFreshSession = (createdAt: Date | string, now = Date.now()): boolean =>
  now - new Date(createdAt).getTime() < SESSION_FRESH_AGE_SECONDS * 1000;

@Injectable()
export class FreshSessionGuard implements CanActivate {
  constructor(private readonly audit: AuditService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { session, user } = requireSession(
      context.switchToHttp().getRequest<AuthenticatedRequest>(),
    );
    if (!isFreshSession(session.createdAt)) {
      throw await denyAccess(this.audit, 'REAUTHENTICATION_REQUIRED', { userId: user.id });
    }
    return true;
  }
}
