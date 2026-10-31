import type { AuditEventInput, RecordAuditEvent } from '@redova/contracts';
import { APIError, getSessionFromCtx, isAPIError } from 'better-auth/api';
import type { AuthHookContext, AuthHookHandler } from './audit-hooks';
import type { NotifySecurityEvent, SecurityEvent } from './security-notifications';

export const MFA_HOOK_ERROR = {
  MFA_REQUIRED_FOR_ROLE: {
    code: 'MFA_REQUIRED_FOR_ROLE',
    message: 'Two-factor authentication is mandatory for platform administrators.',
  },
} as const;

const VERIFY_TOTP = '/two-factor/verify-totp';
const VERIFY_BACKUP_CODE = '/two-factor/verify-backup-code';

/** Session-bound account changes: audit action and owner notification on success. */
const ACCOUNT_CHANGES: Record<string, { action: AuditEventInput['action']; event: SecurityEvent }> =
  {
    '/two-factor/disable': { action: 'auth.mfa.disabled', event: 'mfa_disabled' },
    '/two-factor/generate-backup-codes': {
      action: 'auth.mfa.backup_codes_regenerated',
      event: 'backup_codes_regenerated',
    },
    '/change-password': { action: 'auth.password.changed', event: 'password_changed' },
  };

const TRACKED_PATHS = new Set([VERIFY_TOTP, VERIFY_BACKUP_CODE, ...Object.keys(ACCOUNT_CHANGES)]);

interface SessionUser {
  id: string;
  email: string;
  name: string;
  role?: string | null;
  twoFactorEnabled?: boolean | null;
}

/** Who called a tracked endpoint, resolved before it runs (a challenge has no session yet). */
type Caller = { kind: 'session'; user: SessionUser } | { kind: 'challenge'; userId: string | null };

const isPlatformAdmin = (role?: string | null) =>
  (role ?? '').split(',').some((value) => value.trim() === 'PLATFORM_ADMIN');

/** The pending sign-in's user, from the signed two-factor cookie (as the plugin itself resolves it). */
const challengedUserId = async (ctx: AuthHookContext): Promise<string | null> => {
  const cookie = ctx.context.createAuthCookie('two_factor');
  const identifier = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!identifier) return null;
  const verification = await ctx.context.internalAdapter.findVerificationValue(identifier);
  return verification?.value ?? null;
};

/**
 * MFA and password-change rules, audit events and notifications (UM-004, README §7, §17.4).
 * Native responses are never altered, except the `MFA_REQUIRED_FOR_ROLE` rejection.
 */
export const createMfaHooks = (audit: RecordAuditEvent, notify: NotifySecurityEvent) => {
  const callers = new WeakMap<Request, Caller>();

  const before: AuthHookHandler = async (ctx) => {
    if (!TRACKED_PATHS.has(ctx.path)) return;
    const session = await getSessionFromCtx(ctx).catch(() => null);
    const user = session?.user as SessionUser | undefined;
    if (ctx.path === '/two-factor/disable' && isPlatformAdmin(user?.role)) {
      throw new APIError('FORBIDDEN', MFA_HOOK_ERROR.MFA_REQUIRED_FOR_ROLE);
    }
    if (!ctx.request) return;
    callers.set(
      ctx.request,
      user
        ? { kind: 'session', user }
        : { kind: 'challenge', userId: await challengedUserId(ctx).catch(() => null) },
    );
  };

  const userEvent = (action: AuditEventInput['action'], userId: string) =>
    audit({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorUserId: userId,
      targetType: 'USER',
      targetId: userId,
    });

  const after: AuthHookHandler = async (ctx) => {
    const caller = ctx.request ? callers.get(ctx.request) : undefined;
    if (!caller) return;
    const returned: unknown = ctx.context.returned;
    const failed = isAPIError(returned);
    const isChallenge = ctx.path === VERIFY_TOTP || ctx.path === VERIFY_BACKUP_CODE;

    if (isChallenge && caller.kind === 'challenge') {
      const method = ctx.path === VERIFY_TOTP ? 'totp' : 'backup_code';
      if (failed) {
        // Codes are never recorded, only the method and the native error code.
        await audit({
          action: 'auth.mfa.challenge_failed',
          outcome: 'FAILURE',
          actorType: 'ANONYMOUS',
          targetType: caller.userId ? 'USER' : null,
          targetId: caller.userId,
          metadata: {
            method,
            reason: (returned.body as { code?: string } | undefined)?.code ?? 'UNKNOWN',
          },
        });
      } else if (method === 'backup_code' && caller.userId) {
        await userEvent('auth.mfa.backup_code_used', caller.userId);
      }
      return;
    }

    if (failed || caller.kind !== 'session') return;
    const { user } = caller;

    // A verified TOTP code while signed in and not yet enrolled confirms enrollment.
    if (ctx.path === VERIFY_TOTP) {
      if (user.twoFactorEnabled) return;
      await userEvent('auth.mfa.enabled', user.id);
      await notify(user, 'mfa_enabled', ctx.request);
      return;
    }
    if (ctx.path === VERIFY_BACKUP_CODE) {
      await userEvent('auth.mfa.backup_code_used', user.id);
      return;
    }

    const change = ACCOUNT_CHANGES[ctx.path];
    if (change) {
      await userEvent(change.action, user.id);
      await notify(user, change.event, ctx.request);
    }
  };

  return { before, after };
};
