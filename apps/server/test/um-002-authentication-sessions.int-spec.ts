import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashEmail } from '@redova/auth';
import {
  api,
  cookieFrom,
  createUser,
  createVerifiedUser,
  DEFAULT_PASSWORD,
  signIn,
  uniqueEmail,
} from './support/factories';
import { mockHibp } from './support/hibp';
import { createTestApp, type TestApp, WEB_ORIGIN } from './support/test-app';

const signUpBody = (email: string, password = DEFAULT_PASSWORD) => ({
  name: 'Alice',
  email,
  password,
  callbackURL: `${WEB_ORIGIN}/welcome`,
});

describe('UM-002 registration, login and sessions', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => {
    t.emails.length = 0;
  });
  afterAll(() => t.close());

  const auditRows = (action: string) => t.prisma.auditEvent.findMany({ where: { action } });

  it('IT-002-01 sign-up creates an unverified USER without a session (AC-002-01)', async () => {
    const email = uniqueEmail('alice');
    const res = await api(t).post('/api/auth/sign-up/email', signUpBody(email)).expect(200);

    expect(res.body.token).toBeNull();
    expect(cookieFrom(res)).not.toContain('session_token');
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ emailVerified: false, role: 'USER' });
    expect(t.emails).toEqual([expect.objectContaining({ template: 'verify-email', to: email })]);
    const audit = await t.prisma.auditEvent.findFirst({
      where: { action: 'auth.sign_up.completed', targetId: user.id },
    });
    expect(audit).not.toBeNull();
  });

  it('IT-002-02 duplicate sign-up is indistinguishable from a new one (AC-002-02)', async () => {
    const email = uniqueEmail('dup');
    const first = await api(t).post('/api/auth/sign-up/email', signUpBody(email)).expect(200);
    const second = await api(t).post('/api/auth/sign-up/email', signUpBody(email));

    expect(second.status).toBe(first.status);
    expect(Object.keys(second.body).sort()).toEqual(Object.keys(first.body).sort());
    expect(Object.keys(second.body.user).sort()).toEqual(Object.keys(first.body.user).sort());
    expect(await t.prisma.user.count({ where: { email } })).toBe(1);
  });

  it('IT-002-03 enforces the minimum password length (AC-002-03)', async () => {
    const email = uniqueEmail('short');
    const res = await api(t).post('/api/auth/sign-up/email', signUpBody(email, 'short-pass1'));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_TOO_SHORT');
    expect(await t.prisma.user.count({ where: { email } })).toBe(0);
  });

  it('IT-002-04 unverified users cannot sign in and get a new link (AC-002-04)', async () => {
    const user = await createUser(t);
    t.emails.length = 0;
    const res = await api(t).post('/api/auth/sign-in/email', {
      email: user.email,
      password: user.password,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(cookieFrom(res)).not.toContain('session_token');
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(t.emails.map((e) => e.template)).toEqual(['verify-email']);
  });

  it('IT-002-05 unknown email and wrong password get the same response (AC-002-05)', async () => {
    const user = await createVerifiedUser(t);
    const unknownEmail = uniqueEmail('ghost');
    const unknown = await api(t).post('/api/auth/sign-in/email', {
      email: unknownEmail,
      password: 'wrong-password-123',
    });
    const wrong = await api(t).post('/api/auth/sign-in/email', {
      email: user.email,
      password: 'wrong-password-123',
    });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.body.code).toBe('INVALID_EMAIL_OR_PASSWORD');

    const rows = await auditRows('auth.sign_in.failed');
    const forUser = rows.find((r) => r.targetId === user.id);
    const forUnknown = rows.find(
      (r) => (r.metadata as { emailHash?: string }).emailHash === hashEmail(unknownEmail),
    );
    expect(forUser).toMatchObject({ outcome: 'FAILURE', actorType: 'ANONYMOUS' });
    expect(forUnknown?.targetId).toBeNull();
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain('wrong-password-123');
    expect(serialized).not.toContain(unknownEmail);
  });

  it('IT-002-06 successful sign-in sets a hardened cookie and audits the session (AC-002-06)', async () => {
    const user = await createVerifiedUser(t);
    const res = await api(t)
      .post('/api/auth/sign-in/email', { email: user.email, password: user.password })
      .set('user-agent', 'vitest-agent')
      .expect(200);

    const cookie = ([] as string[])
      .concat(res.headers['set-cookie'])
      .find((c) => c.startsWith('redova.session_token='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);

    const session = await t.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.userAgent).toBe('vitest-agent');
    const audit = await t.prisma.auditEvent.findFirst({
      where: { action: 'auth.session.created', targetId: session.id },
    });
    expect(audit).toMatchObject({ actorUserId: user.id, userAgent: 'vitest-agent' });
  });

  it('IT-002-07 rejects an untrusted callback URL (AC-002-07)', async () => {
    const email = uniqueEmail('cb');
    const res = await api(t).post('/api/auth/sign-up/email', {
      ...signUpBody(email),
      callbackURL: 'https://evil.example/x',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await t.prisma.user.count({ where: { email } })).toBe(0);

    const user = await createVerifiedUser(t);
    const signInRes = await api(t).post('/api/auth/sign-in/email', {
      email: user.email,
      password: user.password,
      callbackURL: 'https://evil.example/x',
    });
    expect(signInRes.status).toBeGreaterThanOrEqual(400);
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('IT-002-08 sign-out invalidates the session and is audited (AC-002-08)', async () => {
    const user = await createVerifiedUser(t);
    const cookie = await signIn(t, user);
    await api(t).post('/api/auth/sign-out', {}, cookie).expect(200);

    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const session = await api(t).get('/api/auth/get-session', cookie).expect(200);
    expect(session.body).toBeNull();
    const audit = await t.prisma.auditEvent.findFirst({
      where: { action: 'auth.sign_out', actorUserId: user.id },
    });
    expect(audit).not.toBeNull();
  });

  it('IT-002-09 revoke-other-sessions keeps only the current session (AC-002-09)', async () => {
    const user = await createVerifiedUser(t);
    const a = await signIn(t, user, '10.0.1.1');
    const b = await signIn(t, user, '10.0.1.2');

    await api(t).post('/api/auth/revoke-other-sessions', {}, a).expect(200);

    expect((await api(t).get('/api/auth/get-session', b)).body).toBeNull();
    expect((await api(t).get('/api/auth/get-session', a)).body?.user.id).toBe(user.id);
    const audit = await t.prisma.auditEvent.findFirst({
      where: { action: 'auth.session.revoked', actorUserId: user.id },
    });
    expect(audit?.metadata).toEqual({ scope: 'others' });
  });

  it('IT-002-10 revoking one session leaves the others working (AC-002-10)', async () => {
    const user = await createVerifiedUser(t);
    const a = await signIn(t, user, '10.0.2.1');
    const b = await signIn(t, user, '10.0.2.2');
    const c = await signIn(t, user, '10.0.2.3');

    const sessions = await api(t).get('/api/auth/list-sessions', a).expect(200);
    const bToken = decodeURIComponent(b.split('=')[1]).split('.')[0];
    expect(sessions.body.map((s: { token: string }) => s.token)).toContain(bToken);

    await api(t).post('/api/auth/revoke-session', { token: bToken }, a).expect(200);

    expect((await api(t).get('/api/auth/get-session', b)).body).toBeNull();
    expect((await api(t).get('/api/auth/get-session', a)).body?.user.id).toBe(user.id);
    expect((await api(t).get('/api/auth/get-session', c)).body?.user.id).toBe(user.id);
  });

  it('IT-002-11 banned users get the generic suspension message (AC-002-11)', async () => {
    const admin = await createVerifiedUser(t);
    await t.prisma.user.update({ where: { id: admin.id }, data: { role: 'PLATFORM_ADMIN' } });
    const adminCookie = await signIn(t, admin);
    const user = await createVerifiedUser(t);
    await t.auth.api.banUser({
      headers: new Headers({ cookie: adminCookie }),
      body: { userId: user.id, banReason: 'internal reason' },
    });

    const res = await api(t).post('/api/auth/sign-in/email', {
      email: user.email,
      password: user.password,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BANNED_USER');
    expect(res.body.message).toBe('Your account has been suspended. Contact support.');
    expect(JSON.stringify(res.body)).not.toContain('internal reason');
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('IT-002-12 profile updates cannot change the global role (AC-002-13)', async () => {
    const user = await createVerifiedUser(t);
    const cookie = await signIn(t, user);

    const escalation = await api(t).post(
      '/api/auth/update-user',
      { name: 'Alice B', role: 'PLATFORM_ADMIN' },
      cookie,
    );
    expect([200, 400]).toContain(escalation.status);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('USER');

    await api(t).post('/api/auth/update-user', { name: 'Alice Renamed' }, cookie).expect(200);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe(
      'Alice Renamed',
    );
  });

  it('end-to-end flow: sign in, read session, update profile, list sessions, sign out', async () => {
    const user = await createVerifiedUser(t);
    const cookie = await signIn(t, user);
    const session = await api(t).get('/api/auth/get-session', cookie).expect(200);
    expect(session.body.user.email).toBe(user.email);
    await api(t).post('/api/auth/update-user', { name: 'Flow User' }, cookie).expect(200);
    const list = await api(t).get('/api/auth/list-sessions', cookie).expect(200);
    expect(list.body).toHaveLength(1);
    await api(t).post('/api/auth/sign-out', {}, cookie).expect(200);
    await request(t.app.getHttpServer()).get('/api/v1/health').expect(200);
    expect((await api(t).get('/api/auth/get-session', cookie)).body).toBeNull();
  });
});

describe('UM-002 breached passwords (AC-002-03)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ env: { HIBP_ENABLED: 'true' } });
  });
  afterAll(() => t.close());

  it('rejects a password found in the HIBP range', async () => {
    const hibp = mockHibp({ compromised: ['password-in-a-breach-1'] });
    try {
      const email = uniqueEmail('pwned');
      const res = await api(t).post(
        '/api/auth/sign-up/email',
        signUpBody(email, 'password-in-a-breach-1'),
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PASSWORD_COMPROMISED');
      expect(await t.prisma.user.count({ where: { email } })).toBe(0);

      await api(t)
        .post('/api/auth/sign-up/email', signUpBody(uniqueEmail('safe')))
        .expect(200);
    } finally {
      hibp.restore();
    }
  });

  it('fails closed when HIBP is unavailable', async () => {
    const hibp = mockHibp({ unavailable: true });
    try {
      const email = uniqueEmail('down');
      const res = await api(t).post('/api/auth/sign-up/email', signUpBody(email));
      expect(res.status).toBe(500);
      expect(await t.prisma.user.count({ where: { email } })).toBe(0);
    } finally {
      hibp.restore();
    }
  });
});

describe('UM-002 sign-in rate limit (AC-002-12)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ env: { RATE_LIMIT_ENABLED: 'true' } });
  });
  afterAll(() => t.close());

  it('returns 429 with X-Retry-After on the 6th attempt from one IP', async () => {
    let last: request.Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await api(t)
        .post('/api/auth/sign-in/email', { email: uniqueEmail(), password: 'wrong-password-123' })
        .set('x-forwarded-for', '10.9.9.9');
    }
    expect(last?.status).toBe(429);
    expect(Number(last?.headers['x-retry-after'])).toBeGreaterThan(0);
  });
});
