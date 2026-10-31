import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { AuditAction } from '@redova/contracts';
import type { Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, createVerifiedUser, signIn, type TestUser } from './support/factories';
import { mockHibp } from './support/hibp';
import { createTestApp, type TestApp } from './support/test-app';
import { totpFromUri } from './support/totp';

const PERIOD_MS = 30_000;

/** Minimal cookie jar: later `Set-Cookie` values win, expired (empty) cookies are dropped. */
const mergeCookies = (jar: string, res: Response): string => {
  const cookies = new Map(
    jar
      .split('; ')
      .filter(Boolean)
      .map((pair) => [pair.split('=')[0], pair] as const),
  );
  for (const header of ([] as string[]).concat(res.headers['set-cookie'] ?? [])) {
    const pair = header.split(';')[0];
    const [name, value] = [pair.split('=')[0], pair.slice(pair.indexOf('=') + 1)];
    if (value) cookies.set(name, pair);
    else cookies.delete(name);
  }
  return [...cookies.values()].join('; ');
};

interface Enrolled {
  user: TestUser;
  cookie: string;
  totpURI: string;
  backupCodes: string[];
}

describe('UM-004 MFA TOTP and account security', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => {
    t.emails.length = 0;
  });
  afterAll(() => t.close());

  const post = (path: string, body: object, cookie = '') =>
    api(t).post(`/api/auth${path}`, body, cookie);
  const sessionOf = async (cookie: string) =>
    (await api(t).get('/api/auth/get-session', cookie)).body as { user: { id: string } } | null;
  const auditCount = (action: AuditAction, userId: string) =>
    t.prisma.auditEvent.count({ where: { action, targetId: userId } });
  const notices = (to: string) =>
    t.emails
      .filter((e) => e.template === 'security-notification' && e.to === to)
      .map((e) => (e.variables as { eventLabel: string }).eventLabel);
  const mfaEnabled = async (userId: string) =>
    (await t.prisma.user.findUniqueOrThrow({ where: { id: userId } })).twoFactorEnabled;

  const enable = async (user: TestUser) => {
    const cookie = await signIn(t, user);
    const res = await post('/two-factor/enable', { password: user.password }, cookie).expect(200);
    return { cookie, ...(res.body as { totpURI: string; backupCodes: string[] }) };
  };

  /** Enables MFA and confirms it. Confirmation replaces the session, so the new cookie is kept. */
  const enroll = async (): Promise<Enrolled> => {
    const user = await createVerifiedUser(t);
    const enrollment = await enable(user);
    const res = await post(
      '/two-factor/verify-totp',
      { code: totpFromUri(enrollment.totpURI) },
      enrollment.cookie,
    ).expect(200);
    return { user, ...enrollment, cookie: mergeCookies(enrollment.cookie, res) };
  };

  /** Password step of a sign-in; returns the response and the resulting cookie jar. */
  const startSignIn = async (user: TestUser, jar = '') => {
    const res = await post('/sign-in/email', { email: user.email, password: user.password }, jar);
    expect(res.status).toBe(200);
    return { res, jar: mergeCookies(jar, res) };
  };

  /** Full sign-in for an MFA user with the second factor `path` and `code`. */
  const completeSignIn = async (
    user: TestUser,
    path: '/two-factor/verify-totp' | '/two-factor/verify-backup-code',
    code: string,
    options: { jar?: string; trustDevice?: boolean } = {},
  ) => {
    const started = await startSignIn(user, options.jar);
    expect(started.res.body).toEqual({ twoFactorRedirect: true, twoFactorMethods: ['totp'] });
    const res = await post(path, { code, trustDevice: options.trustDevice }, started.jar);
    return { res, jar: mergeCookies(started.jar, res) };
  };

  describe('enrollment', () => {
    it('IT-004-01 enabling requires the password (AC-004-01)', async () => {
      const user = await createVerifiedUser(t);
      const cookie = await signIn(t, user);
      const res = await post('/two-factor/enable', { password: 'wrong-password-123' }, cookie);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PASSWORD');
      expect(await t.prisma.twoFactor.count({ where: { userId: user.id } })).toBe(0);
    });

    it('IT-004-02 MFA stays inactive until a first valid code (AC-004-02)', async () => {
      const user = await createVerifiedUser(t);
      const { totpURI, backupCodes } = await enable(user);
      expect(new URL(totpURI).searchParams.get('issuer')).toBe('REDOVA');
      expect(backupCodes).toHaveLength(10);

      const { res } = await startSignIn(user);
      expect(res.body.twoFactorRedirect).toBeUndefined();
      expect(res.body.user.id).toBe(user.id);
      expect(await mfaEnabled(user.id)).toBe(false);
    });

    it('IT-004-03 a valid code confirms enrollment, audits and notifies (AC-004-03)', async () => {
      const user = await createVerifiedUser(t);
      const { cookie, totpURI } = await enable(user);
      const wrong = await post('/two-factor/verify-totp', { code: '000000' }, cookie);
      expect(wrong.status).toBe(401);
      expect(await mfaEnabled(user.id)).toBe(false);

      await post('/two-factor/verify-totp', { code: totpFromUri(totpURI) }, cookie).expect(200);
      expect(await mfaEnabled(user.id)).toBe(true);
      expect(await auditCount('auth.mfa.enabled', user.id)).toBe(1);
      expect(notices(user.email)).toEqual(['Two-factor authentication enabled']);
    });
  });

  describe('sign-in challenge', () => {
    it('IT-004-04 sign-in stops at the second factor without a session (AC-004-04)', async () => {
      const { user } = await enroll();
      const before = await t.prisma.session.count({ where: { userId: user.id } });
      const { res, jar } = await startSignIn(user);
      expect(res.body).toEqual({ twoFactorRedirect: true, twoFactorMethods: ['totp'] });
      expect(jar).toContain('redova.two_factor=');
      expect(jar).not.toContain('redova.session_token=');
      expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(before);
      expect(await sessionOf(jar)).toBeNull();
    });

    it('IT-004-05 a valid TOTP completes sign-in; an invalid one is audited (AC-004-05)', async () => {
      const { user, totpURI } = await enroll();
      const failed = await completeSignIn(user, '/two-factor/verify-totp', '000000');
      expect(failed.res.status).toBe(401);
      expect(await sessionOf(failed.jar)).toBeNull();
      const [audit] = await t.prisma.auditEvent.findMany({
        where: { action: 'auth.mfa.challenge_failed', targetId: user.id },
      });
      expect(audit).toMatchObject({
        outcome: 'FAILURE',
        metadata: { method: 'totp', reason: 'INVALID_CODE' },
      });
      expect(JSON.stringify(audit.metadata)).not.toContain('000000');

      const ok = await completeSignIn(
        user,
        '/two-factor/verify-totp',
        totpFromUri(totpURI, Date.now() + PERIOD_MS),
      );
      expect(ok.res.status).toBe(200);
      expect(ok.jar).toContain('redova.session_token=');
      expect((await sessionOf(ok.jar))?.user.id).toBe(user.id);
    });

    it('IT-004-06 ten failures lock the account until lockedUntil passes (AC-004-06)', async () => {
      const { user, totpURI } = await enroll();
      // Native limits: 5 attempts per sign-in challenge, account lockout after 10 consecutive failures.
      const failFiveTimes = async (jar: string) => {
        for (let i = 0; i < 5; i++) {
          const res = await post('/two-factor/verify-totp', { code: '000000' }, jar);
          expect(res.status, JSON.stringify(res.body)).toBe(401);
        }
      };
      const first = await startSignIn(user);
      await failFiveTimes(first.jar);
      const exhausted = await post('/two-factor/verify-totp', { code: '000000' }, first.jar);
      expect(exhausted.body.code).toBe('TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE');

      const second = await startSignIn(user);
      await failFiveTimes(second.jar);
      const code = totpFromUri(totpURI, Date.now() + PERIOD_MS);
      const locked = await post('/two-factor/verify-totp', { code }, second.jar);
      expect(locked.status).toBe(429);
      expect(locked.body.code).toBe('ACCOUNT_TEMPORARILY_LOCKED');

      await t.prisma.twoFactor.updateMany({
        where: { userId: user.id },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });
      const { jar } = await startSignIn(user);
      await post('/two-factor/verify-totp', { code }, jar).expect(200);
    });

    it('IT-004-07 backup codes are single-use (AC-004-07)', async () => {
      const { user, backupCodes } = await enroll();
      const first = await completeSignIn(user, '/two-factor/verify-backup-code', backupCodes[0]);
      expect(first.res.status).toBe(200);
      expect(await auditCount('auth.mfa.backup_code_used', user.id)).toBe(1);

      const reused = await completeSignIn(user, '/two-factor/verify-backup-code', backupCodes[0]);
      expect(reused.res.status).toBe(401);
      expect(await sessionOf(reused.jar)).toBeNull();
      const second = await completeSignIn(user, '/two-factor/verify-backup-code', backupCodes[1]);
      expect(second.res.status).toBe(200);
    });

    it('IT-004-08 regenerating backup codes invalidates the old set (AC-004-08)', async () => {
      const { user, cookie, backupCodes } = await enroll();
      const wrong = await post(
        '/two-factor/generate-backup-codes',
        { password: 'wrong-password-123' },
        cookie,
      );
      expect(wrong.status).toBe(400);
      expect(
        (await completeSignIn(user, '/two-factor/verify-backup-code', backupCodes[0])).res.status,
      ).toBe(200);

      t.emails.length = 0;
      const res = await post(
        '/two-factor/generate-backup-codes',
        { password: user.password },
        cookie,
      ).expect(200);
      const fresh = (res.body as { backupCodes: string[] }).backupCodes;
      expect(fresh).toHaveLength(10);
      expect(await auditCount('auth.mfa.backup_codes_regenerated', user.id)).toBe(1);
      expect(notices(user.email)).toEqual(['Backup codes regenerated']);

      const old = await completeSignIn(user, '/two-factor/verify-backup-code', backupCodes[1]);
      expect(old.res.status).toBe(401);
      const renewed = await completeSignIn(user, '/two-factor/verify-backup-code', fresh[0]);
      expect(renewed.res.status).toBe(200);
    });

    it('IT-004-09 a trusted device skips the challenge for that cookie jar only (AC-004-09)', async () => {
      const { user, totpURI } = await enroll();
      const trusted = await completeSignIn(
        user,
        '/two-factor/verify-totp',
        totpFromUri(totpURI, Date.now() + PERIOD_MS),
        { trustDevice: true },
      );
      expect(trusted.res.status).toBe(200);
      expect(trusted.jar).toContain('redova.trust_device=');

      const signedOut = await post('/sign-out', {}, trusted.jar).expect(200);
      const again = await startSignIn(user, mergeCookies(trusted.jar, signedOut));
      expect(again.res.body.twoFactorRedirect).toBeUndefined();
      expect((await sessionOf(again.jar))?.user.id).toBe(user.id);

      const otherDevice = await startSignIn(user);
      expect(otherDevice.res.body.twoFactorRedirect).toBe(true);
    });
  });

  describe('account changes', () => {
    it('IT-004-10 a user disables MFA with the password (AC-004-10)', async () => {
      const { user, cookie } = await enroll();
      t.emails.length = 0;
      await post('/two-factor/disable', { password: user.password }, cookie).expect(200);
      expect(await mfaEnabled(user.id)).toBe(false);
      const { res } = await startSignIn(user);
      expect(res.body.twoFactorRedirect).toBeUndefined();
      expect(await auditCount('auth.mfa.disabled', user.id)).toBe(1);
      expect(notices(user.email)).toEqual(['Two-factor authentication disabled']);
    });

    it('IT-004-11 a platform admin cannot disable MFA (AC-004-11)', async () => {
      const { user, cookie } = await enroll();
      await t.prisma.user.update({ where: { id: user.id }, data: { role: 'PLATFORM_ADMIN' } });
      const res = await post('/two-factor/disable', { password: user.password }, cookie);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MFA_REQUIRED_FOR_ROLE');
      expect(await mfaEnabled(user.id)).toBe(true);
      expect(await auditCount('auth.mfa.disabled', user.id)).toBe(0);
    });

    it('IT-004-12 change password revokes other sessions, audits and notifies (AC-004-12)', async () => {
      const user = await createVerifiedUser(t);
      const a = await signIn(t, user, '10.4.0.1');
      const b = await signIn(t, user, '10.4.0.2');
      const wrong = await post(
        '/change-password',
        { currentPassword: 'wrong-password-123', newPassword: 'brand-new-password-2026' },
        a,
      );
      expect(wrong.status).toBe(400);
      expect(wrong.body.code).toBe('INVALID_PASSWORD');

      const res = await post(
        '/change-password',
        {
          currentPassword: user.password,
          newPassword: 'brand-new-password-2026',
          revokeOtherSessions: true,
        },
        a,
      ).expect(200);
      expect(await sessionOf(b)).toBeNull();
      expect((await sessionOf(mergeCookies(a, res)))?.user.id).toBe(user.id);
      await signIn(t, { email: user.email, password: 'brand-new-password-2026' });
      expect(await auditCount('auth.password.changed', user.id)).toBe(1);
      expect(notices(user.email)).toEqual(['Password changed']);
    });

    it('IT-004-13 a stale session must re-authenticate for sensitive reads (AC-004-13)', async () => {
      const user = await createVerifiedUser(t);
      const stale = await signIn(t, user);
      await t.prisma.session.updateMany({
        where: { userId: user.id },
        data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      });
      const previous = await t.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      const denied = await api(t).get('/api/auth/list-sessions', stale);
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('SESSION_NOT_FRESH');

      // Re-authentication procedure (README §5.5): sign in again, then revoke the superseded session.
      const fresh = await signIn(t, user);
      await post('/revoke-session', { token: previous.token }, fresh).expect(200);
      await api(t).get('/api/auth/list-sessions', fresh).expect(200);
      expect(await t.prisma.session.count({ where: { id: previous.id } })).toBe(0);
    });
  });

  it('IT-004-14 responses and storage never expose the TOTP secret or backup codes (AC-004-14)', async () => {
    const { user, cookie, totpURI, backupCodes } = await enroll();
    const secret = new URL(totpURI).searchParams.get('secret')!;
    const session = JSON.stringify((await api(t).get('/api/auth/get-session', cookie)).body);
    const sessions = JSON.stringify((await api(t).get('/api/auth/list-sessions', cookie)).body);
    for (const body of [session, sessions]) {
      expect(body).not.toContain(secret);
      for (const code of backupCodes) expect(body).not.toContain(code);
    }
    const row = await t.prisma.twoFactor.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.secret).not.toContain(secret);
    for (const code of backupCodes) expect(row.backupCodes).not.toContain(code);
  });

  it('IT-004-15 OTP delivery paths are disabled (AC-004-15)', async () => {
    const { cookie } = await enroll();
    expect((await post('/two-factor/send-otp', {}, cookie)).status).toBe(404);
  });

  describe('operator MFA reset (AC-004-16)', () => {
    const cli = resolve(__dirname, '../dist/cli/mfa-reset.js');
    const run = (email: string, confirmation: string) =>
      spawnSync(
        process.execPath,
        [cli, '--email', email, '--reason', 'lost device, identity verified'],
        {
          input: `${confirmation}\n`,
          env: { ...process.env, DATABASE_URL: t.env.DATABASE_URL },
          encoding: 'utf8',
        },
      );

    it('IT-004-16 resets MFA and revokes sessions only after confirmation', async () => {
      const { user, cookie } = await enroll();
      const other = await signIn(t, { ...user });
      expect(await sessionOf(other)).toBeNull(); // MFA user: the password alone gives no session

      const aborted = run(user.email, 'not-the-email');
      expect(aborted.status).toBe(1);
      expect(await mfaEnabled(user.id).catch(() => null)).toBe(true);
      expect((await sessionOf(cookie))?.user.id).toBe(user.id);

      const done = run(user.email, user.email);
      expect(done.status, done.stderr).toBe(0);
      expect(await mfaEnabled(user.id)).toBe(false);
      expect(await t.prisma.twoFactor.count({ where: { userId: user.id } })).toBe(0);
      expect(await sessionOf(cookie)).toBeNull();
      const [audit] = await t.prisma.auditEvent.findMany({
        where: { action: 'admin.user.mfa_reset', targetId: user.id },
      });
      expect(audit).toMatchObject({
        actorType: 'SYSTEM',
        metadata: { reason: 'lost device, identity verified', sessionsRevoked: 1 },
      });
    });
  });
});

describe('UM-004 breached password on change (AC-004-12)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ env: { HIBP_ENABLED: 'true' } });
  });
  afterAll(() => t.close());

  it('IT-004-12 rejects a compromised new password', async () => {
    const hibp = mockHibp({ compromised: ['breached-password-123'] });
    try {
      const user = await createVerifiedUser(t);
      const cookie = await signIn(t, user);
      const res = await api(t).post(
        '/api/auth/change-password',
        { currentPassword: user.password, newPassword: 'breached-password-123' },
        cookie,
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PASSWORD_COMPROMISED');
    } finally {
      hibp.restore();
    }
  });
});
