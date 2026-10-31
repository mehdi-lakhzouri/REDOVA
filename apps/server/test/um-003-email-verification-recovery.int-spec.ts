import type { EmailJob } from '@redova/contracts';
import { createEmailVerificationToken } from 'better-auth/api';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  cookieFrom,
  createUser,
  createVerifiedUser,
  signIn,
  uniqueEmail,
} from './support/factories';
import { mockHibp } from './support/hibp';
import { createTestApp, type TestApp, WEB_ORIGIN } from './support/test-app';

const pathOf = (url: string) => {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
};

const lastEmail = <T extends EmailJob['template']>(t: TestApp, template: T, to: string) => {
  const job = [...t.emails].reverse().find((e) => e.template === template && e.to === to);
  if (!job) throw new Error(`no ${template} email to ${to}`);
  return job as Extract<EmailJob, { template: T }>;
};

const requestReset = (t: TestApp, email: string, redirectTo = `${WEB_ORIGIN}/reset-password`) =>
  api(t).post('/api/auth/request-password-reset', { email, redirectTo });

/** Requests a reset and returns the token carried by the emailed link (as the client would). */
const resetTokenFor = async (t: TestApp, email: string): Promise<string> => {
  await requestReset(t, email).expect(200);
  const link = lastEmail(t, 'reset-password', email).variables.resetUrl;
  const res = await request(t.app.getHttpServer()).get(pathOf(link));
  expect(res.status).toBe(302);
  const location = new URL(res.headers.location);
  expect(`${location.origin}${location.pathname}`).toBe(`${WEB_ORIGIN}/reset-password`);
  return location.searchParams.get('token') ?? '';
};

describe('UM-003 email verification and password recovery', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => {
    t.emails.length = 0;
  });
  afterAll(() => t.close());

  it('IT-003-01/02 the verification link verifies, signs in and redirects (AC-003-01, AC-003-02)', async () => {
    const email = uniqueEmail('verify');
    await api(t)
      .post('/api/auth/sign-up/email', {
        name: 'Vera',
        email,
        password: 'correct-horse-battery-staple',
        callbackURL: `${WEB_ORIGIN}/welcome`,
      })
      .expect(200);
    const job = lastEmail(t, 'verify-email', email);
    expect(
      job.variables.verifyUrl.startsWith(`${t.env.BETTER_AUTH_URL}/api/auth/verify-email?token=`),
    ).toBe(true);

    const res = await request(t.app.getHttpServer()).get(pathOf(job.variables.verifyUrl));
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${WEB_ORIGIN}/welcome`);
    expect(cookieFrom(res)).toContain('redova.session_token=');
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerified).toBe(true);
    const audit = await t.prisma.auditEvent.findFirst({
      where: { action: 'auth.email.verified', actorUserId: user.id },
    });
    expect(audit).not.toBeNull();
  });

  it('IT-003-03 rejects expired and tampered verification tokens (AC-003-03)', async () => {
    const user = await createUser(t);
    const callbackURL = encodeURIComponent(`${WEB_ORIGIN}/welcome`);
    const expired = await createEmailVerificationToken(
      t.env.BETTER_AUTH_SECRET,
      user.email,
      undefined,
      -60,
    );
    const valid = await createEmailVerificationToken(t.env.BETTER_AUTH_SECRET, user.email);
    const tampered = `${valid.slice(0, -2)}${valid.endsWith('a') ? 'bb' : 'aa'}`;

    for (const token of [expired, tampered]) {
      const res = await request(t.app.getHttpServer()).get(
        `/api/auth/verify-email?token=${token}&callbackURL=${callbackURL}`,
      );
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/error=/);
      expect(cookieFrom(res)).not.toContain('redova.session_token=');
    }
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBe(
      false,
    );
  });

  it('IT-003-05 reset requests do not reveal account existence (AC-003-05)', async () => {
    const user = await createVerifiedUser(t);
    const known = await requestReset(t, user.email);
    const unknown = await requestReset(t, uniqueEmail('nobody'));
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(t.emails.filter((e) => e.template === 'reset-password')).toHaveLength(1);
    const audits = await t.prisma.auditEvent.findMany({
      where: { action: 'auth.password.reset_requested' },
    });
    expect(audits.filter((a) => a.targetId === user.id)).toHaveLength(1);
  });

  it('IT-003-06/07 a reset revokes every session and notifies the owner (AC-003-06, AC-003-07)', async () => {
    const user = await createVerifiedUser(t);
    const a = await signIn(t, user, '10.3.0.1');
    const b = await signIn(t, user, '10.3.0.2');
    const token = await resetTokenFor(t, user.email);

    await api(t)
      .post('/api/auth/reset-password', { token, newPassword: 'brand-new-password-2026' })
      .expect(200);

    expect((await api(t).get('/api/auth/get-session', a)).body).toBeNull();
    expect((await api(t).get('/api/auth/get-session', b)).body).toBeNull();
    await signIn(t, { email: user.email, password: 'brand-new-password-2026' });
    const notice = lastEmail(t, 'security-notification', user.email);
    expect(notice.variables.eventLabel).toBe('Password reset');
    expect(notice.variables.secureAccountUrl).toBe(`${WEB_ORIGIN}/account/security`);
    const audit = await t.prisma.auditEvent.findFirst({
      where: { action: 'auth.password.reset_completed', actorUserId: user.id },
    });
    expect(audit).not.toBeNull();
  });

  it('IT-003-08 reset tokens are single-use and expire (AC-003-08, AC-003-09)', async () => {
    const user = await createVerifiedUser(t);
    const token = await resetTokenFor(t, user.email);
    await api(t)
      .post('/api/auth/reset-password', { token, newPassword: 'first-new-password-01' })
      .expect(200);
    const reused = await api(t).post('/api/auth/reset-password', {
      token,
      newPassword: 'second-new-password-02',
    });
    expect(reused.status).toBe(400);
    expect(reused.body.code).toBe('INVALID_TOKEN');

    const other = await createVerifiedUser(t);
    const expiring = await resetTokenFor(t, other.email);
    await t.prisma.verification.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await api(t).post('/api/auth/reset-password', {
      token: expiring,
      newPassword: 'third-new-password-03',
    });
    expect(expired.status).toBe(400);
    expect(expired.body.code).toBe('INVALID_TOKEN');
  });

  it('IT-003-09 reset tokens are not stored in clear (AC-003-10)', async () => {
    const user = await createVerifiedUser(t);
    const token = await resetTokenFor(t, user.email);
    expect(token.length).toBeGreaterThan(10);
    const rows = await t.prisma.verification.findMany();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.identifier).not.toContain(token);
      expect(row.value).not.toContain(token);
    }
  });

  it('IT-003-11 duplicate sign-up notifies the existing owner (AC-003-12)', async () => {
    const user = await createVerifiedUser(t);
    t.emails.length = 0;
    await api(t)
      .post('/api/auth/sign-up/email', {
        name: 'Someone',
        email: user.email,
        password: 'correct-horse-battery-staple',
      })
      .expect(200);
    expect(t.emails.map((e) => e.template)).toEqual(['existing-account']);
    const job = lastEmail(t, 'existing-account', user.email);
    expect(job.variables.signInUrl).toBe(`${WEB_ORIGIN}/sign-in`);
  });

  it('IT-003-12 rejects an external redirectTo without sending an email (AC-003-13)', async () => {
    const user = await createVerifiedUser(t);
    const res = await requestReset(t, user.email, 'https://evil.example/reset');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(t.emails.filter((e) => e.template === 'reset-password')).toHaveLength(0);
  });
});

describe('UM-003 resend rate limit (AC-003-04)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ env: { RATE_LIMIT_ENABLED: 'true' } });
  });
  afterAll(() => t.close());

  it('IT-003-04 allows 3 verification resends per 5 minutes per IP', async () => {
    const user = await createUser(t);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await api(t)
        .post('/api/auth/send-verification-email', {
          email: user.email,
          callbackURL: `${WEB_ORIGIN}/welcome`,
        })
        .set('x-forwarded-for', '10.3.3.3');
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe('UM-003 breached password on reset (AC-003-11)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ env: { HIBP_ENABLED: 'true' } });
  });
  afterAll(() => t.close());

  it('IT-003-10 rejects a breached new password and keeps the old one', async () => {
    const hibp = mockHibp({ compromised: ['breached-password-123'] });
    try {
      const user = await createVerifiedUser(t);
      const token = await resetTokenFor(t, user.email);
      const res = await api(t).post('/api/auth/reset-password', {
        token,
        newPassword: 'breached-password-123',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PASSWORD_COMPROMISED');
      await signIn(t, user);
    } finally {
      hibp.restore();
    }
  });
});
