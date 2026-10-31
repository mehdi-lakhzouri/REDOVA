import { createHash } from 'node:crypto';
import type { RecordAuditEvent } from '@redova/contracts';
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';

const REVOCATION_SCOPES: Record<string, 'one' | 'others' | 'all'> = {
  '/revoke-session': 'one',
  '/revoke-other-sessions': 'others',
  '/revoke-sessions': 'all',
};

/** Paths whose actor must be captured before the endpoint runs (the session may be gone afterwards). */
const ACTOR_PATHS = new Set(['/sign-out', ...Object.keys(REVOCATION_SCOPES)]);

/** Failed sign-ins are correlated by a hash: raw emails of unknown accounts are never stored (README §17.3). */
export const hashEmail = (email: string): string =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

/**
 * Endpoint hooks writing the UM-002 audit events (README §17.4). `audit` must never throw.
 * Sign-up and session creation are audited by database hooks in `createAuth`.
 */
export const createAuditHooks = (audit: RecordAuditEvent) => {
  const actors = new WeakMap<Request, string>();

  const before = createAuthMiddleware(async (ctx) => {
    if (!ctx.request || !ACTOR_PATHS.has(ctx.path)) return;
    const session = await getSessionFromCtx(ctx).catch(() => null);
    if (session) actors.set(ctx.request, session.user.id);
  });

  const after = createAuthMiddleware(async (ctx) => {
    const returned: unknown = ctx.context.returned;
    const failed = isAPIError(returned);

    if (ctx.path === '/sign-in/email' && failed) {
      const email = typeof ctx.body?.email === 'string' ? ctx.body.email : '';
      const existing = email ? await ctx.context.internalAdapter.findUserByEmail(email) : null;
      await audit({
        action: 'auth.sign_in.failed',
        outcome: 'FAILURE',
        actorType: 'ANONYMOUS',
        targetType: existing ? 'USER' : null,
        targetId: existing?.user.id ?? null,
        metadata: {
          reason: (returned.body as { code?: string } | undefined)?.code ?? 'UNKNOWN',
          emailHash: hashEmail(email),
        },
      });
      return;
    }

    const actorUserId = ctx.request ? actors.get(ctx.request) : undefined;
    if (!actorUserId || failed) return;

    if (ctx.path === '/sign-out') {
      await audit({
        action: 'auth.sign_out',
        outcome: 'SUCCESS',
        actorType: 'USER',
        actorUserId,
        targetType: 'USER',
        targetId: actorUserId,
      });
      return;
    }

    const scope = REVOCATION_SCOPES[ctx.path];
    if (scope) {
      await audit({
        action: 'auth.session.revoked',
        outcome: 'SUCCESS',
        actorType: 'USER',
        actorUserId,
        targetType: 'USER',
        targetId: actorUserId,
        metadata: { scope },
      });
    }
  });

  return { before, after };
};
