import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/api-exception';
import type { Env } from '../config/env';
import { ENV } from '../config/tokens';
import { denyAccess } from './access-denied';
import type { AuthenticatedRequest } from './authenticated-request';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Accepts state-changing requests only from the trusted web origin (README §17.1 T4). */
export const isTrustedOrigin = (
  method: string,
  headers: { origin?: string; secFetchSite?: string },
  webOrigin: string,
): boolean => {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  if (headers.origin) return headers.origin === new URL(webOrigin).origin;
  return headers.secFetchSite === 'same-origin';
};

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const headers = { origin: request.get('origin'), secFetchSite: request.get('sec-fetch-site') };
    if (isTrustedOrigin(request.method, headers, this.env.WEB_ORIGIN)) return true;
    const userId = request.session?.user?.id;
    if (!userId) throw new ApiException('ORIGIN_NOT_ALLOWED');
    throw await denyAccess(this.audit, 'ORIGIN_NOT_ALLOWED', { userId });
  }
}
