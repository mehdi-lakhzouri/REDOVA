import type { ErrorCode } from '@redova/contracts';
import type { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/api-exception';

/** Records `authz.access_denied` for a 403 decision, then returns the exception to throw (README §17.4). */
export const denyAccess = async (
  audit: AuditService,
  code: ErrorCode,
  context: {
    userId: string;
    organizationId?: string;
    metadata?: Record<string, string | number | boolean | null | string[]>;
  },
): Promise<ApiException> => {
  await audit.record({
    action: 'authz.access_denied',
    outcome: 'DENIED',
    actorType: 'USER',
    actorUserId: context.userId,
    organizationId: context.organizationId ?? null,
    metadata: { reason: code, ...context.metadata },
  });
  return new ApiException(code);
};
