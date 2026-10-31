import { APIError, getSessionFromCtx } from 'better-auth/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthHookContext } from './audit-hooks';
import { createMfaHooks } from './mfa-hooks';
import { SECURITY_EVENT_LABELS } from './security-notifications';

vi.mock('better-auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('better-auth/api')>()),
  getSessionFromCtx: vi.fn(),
}));

const sessionOf = vi.mocked(getSessionFromCtx);
const alice = { id: 'u1', email: 'alice@acme.io', name: 'Alice', role: 'USER' };

const context = (path: string, returned?: unknown) =>
  ({
    path,
    request: new Request('http://localhost/api/auth' + path, { method: 'POST' }),
    getSignedCookie: vi.fn(async () => 'challenge-id'),
    context: {
      returned,
      secret: 'secret',
      createAuthCookie: () => ({ name: 'redova.two_factor' }),
      internalAdapter: { findVerificationValue: vi.fn(async () => ({ value: 'u2' })) },
    },
  }) as unknown as AuthHookContext;

describe('MFA hooks', () => {
  const audit = vi.fn(async () => {});
  const notify = vi.fn(async () => {});
  const hooks = createMfaHooks(audit, notify);

  /** Runs before + after on the same request, as Better Auth does. */
  const run = async (ctx: AuthHookContext, returned: unknown) => {
    await hooks.before(ctx);
    (ctx.context as { returned: unknown }).returned = returned;
    await hooks.after(ctx);
  };

  beforeEach(() => {
    audit.mockClear();
    notify.mockClear();
    sessionOf.mockReset();
  });

  describe('MFA_REQUIRED_FOR_ROLE (UT-004-02)', () => {
    it('rejects disabling MFA for a platform admin', async () => {
      sessionOf.mockResolvedValue({ user: { ...alice, role: 'PLATFORM_ADMIN' } } as never);
      await expect(hooks.before(context('/two-factor/disable'))).rejects.toMatchObject({
        body: { code: 'MFA_REQUIRED_FOR_ROLE' },
      });
    });

    it('lets a regular user disable MFA', async () => {
      sessionOf.mockResolvedValue({ user: alice } as never);
      await expect(hooks.before(context('/two-factor/disable'))).resolves.toBeUndefined();
    });
  });

  describe('verify-totp branch selection (UT-004-03)', () => {
    it('treats a verified code with a session and no MFA yet as enrollment', async () => {
      sessionOf.mockResolvedValue({ user: { ...alice, twoFactorEnabled: false } } as never);
      await run(context('/two-factor/verify-totp'), { token: 't' });
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.mfa.enabled' }));
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1' }),
        'mfa_enabled',
        expect.any(Request),
      );
    });

    it('records nothing for a verified code when MFA is already enabled', async () => {
      sessionOf.mockResolvedValue({ user: { ...alice, twoFactorEnabled: true } } as never);
      await run(context('/two-factor/verify-totp'), { token: 't' });
      expect(audit).not.toHaveBeenCalled();
    });

    it('records a failed sign-in challenge against the challenged user, without the code', async () => {
      sessionOf.mockResolvedValue(null);
      const error = new APIError('UNAUTHORIZED', { code: 'INVALID_CODE', message: 'Invalid code' });
      await run(context('/two-factor/verify-totp'), error);
      expect(audit).toHaveBeenCalledWith({
        action: 'auth.mfa.challenge_failed',
        outcome: 'FAILURE',
        actorType: 'ANONYMOUS',
        targetType: 'USER',
        targetId: 'u2',
        metadata: { method: 'totp', reason: 'INVALID_CODE' },
      });
      expect(notify).not.toHaveBeenCalled();
    });

    it('records a backup code used during a sign-in challenge', async () => {
      sessionOf.mockResolvedValue(null);
      await run(context('/two-factor/verify-backup-code'), { token: 't' });
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.mfa.backup_code_used', actorUserId: 'u2' }),
      );
    });
  });

  it('audits and notifies a password change, never a failed one', async () => {
    sessionOf.mockResolvedValue({ user: alice } as never);
    await run(
      context('/change-password'),
      new APIError('BAD_REQUEST', { code: 'INVALID_PASSWORD' }),
    );
    expect(audit).not.toHaveBeenCalled();
    await run(context('/change-password'), { token: 't' });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.password.changed' }),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      'password_changed',
      expect.any(Request),
    );
  });
});

describe('security notification labels (UT-004-04)', () => {
  it('maps every security event to its email label', () => {
    expect(SECURITY_EVENT_LABELS).toEqual({
      password_reset: 'Password reset',
      password_changed: 'Password changed',
      mfa_enabled: 'Two-factor authentication enabled',
      mfa_disabled: 'Two-factor authentication disabled',
      backup_codes_regenerated: 'Backup codes regenerated',
    });
  });
});
