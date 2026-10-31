import type { TenantContext } from '@redova/contracts';
import type { Request } from 'express';
import { ApiException } from '../common/api-exception';

export interface SessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
  role?: string | null;
  twoFactorEnabled?: boolean | null;
}

export interface AuthenticatedRequest extends Request {
  /** Attached by the global AuthGuard of @thallesp/nestjs-better-auth. */
  session?: { session: { id: string; createdAt: Date | string }; user: SessionUser } | null;
  tenant?: TenantContext;
}

/** Returns the authenticated session; REDOVA guards run after the global AuthGuard. */
export const requireSession = (request: AuthenticatedRequest) => {
  const session = request.session;
  if (!session?.user) throw new ApiException('UNAUTHENTICATED');
  // Defense in depth: unverified users never obtain a session natively (README §6.1).
  if (!session.user.emailVerified) throw new ApiException('EMAIL_NOT_VERIFIED');
  return session;
};
