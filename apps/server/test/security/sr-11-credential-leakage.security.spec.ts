import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createVerifiedUser, signIn, type TestUser } from '../support/factories';
import { enrollMfa } from '../support/mfa';
import { addMember, createOrganization } from '../support/organizations';
import { createTestApp, type TestApp } from '../support/test-app';

/** Keys that must never appear in a REDOVA response (README §17.2 SR-11). */
const FORBIDDEN_KEYS = [
  'password',
  'passwordHash',
  'hash',
  'token',
  'sessionToken',
  'secret',
  'backupCodes',
  'totpURI',
  'accessToken',
  'refreshToken',
];

/** Native responses may carry the caller's own session token by design (README §5.3). */
const NATIVE_FORBIDDEN_KEYS = FORBIDDEN_KEYS.filter((key) => key !== 'token');

const keysOf = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
  }
  return [];
};

describe('SEC-11 no credential leakage in API responses (SR-11)', () => {
  let t: TestApp;
  let user: TestUser;
  let userCookie: string;
  let adminCookie: string;
  let organizationId: string;
  beforeAll(async () => {
    t = await createTestApp();
    const org = await createOrganization(t);
    organizationId = org.id;
    const member = await addMember(t, org.id, 'AUDITOR');
    user = member;
    userCookie = member.cookie;
    const admin = await createVerifiedUser(t);
    adminCookie = (await enrollMfa(t, admin)).cookie;
    await t.prisma.user.update({ where: { id: admin.id }, data: { role: 'PLATFORM_ADMIN' } });
  });
  afterAll(() => t.close());

  const get = (path: string, cookie: string) =>
    request(t.app.getHttpServer()).get(path).set('cookie', cookie);

  it('REDOVA endpoints return no credential fields', async () => {
    const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { organizationId } });
    const responses = [
      await get('/api/v1/health', ''),
      await get('/api/v1/admin/users?limit=50', adminCookie),
      await get(`/api/v1/admin/users/${user.id}`, adminCookie),
      await get(`/api/v1/admin/users/${user.id}/sessions`, adminCookie),
      await get('/api/v1/admin/audit-events?limit=100', adminCookie),
      await get(`/api/v1/admin/audit-events/${event.id}`, adminCookie),
      await get(`/api/v1/organizations/${organizationId}/audit-events?limit=100`, userCookie),
      await get(`/api/v1/organizations/${organizationId}/audit-events/${event.id}`, userCookie),
    ];
    for (const [index, res] of responses.entries()) {
      const label = `response #${index}`;
      expect(res.status, label).toBe(200);
      expect(
        keysOf(res.body).filter((key) => FORBIDDEN_KEYS.includes(key)),
        label,
      ).toEqual([]);
      expect(JSON.stringify(res.body)).not.toContain(user.password);
    }
  });

  it('native session, organization and sign-in responses expose no secrets', async () => {
    const signedIn = await api(t)
      .post('/api/auth/sign-in/email', { email: user.email, password: user.password })
      .expect(200);
    const responses = [
      signedIn,
      await get('/api/auth/get-session', userCookie),
      await get(
        `/api/auth/organization/get-full-organization?organizationId=${organizationId}`,
        userCookie,
      ),
      await get(`/api/auth/organization/list-members?organizationId=${organizationId}`, userCookie),
      await get('/api/auth/organization/list', userCookie),
    ];
    for (const [index, res] of responses.entries()) {
      const label = `response #${index}`;
      expect(res.status, label).toBe(200);
      expect(
        keysOf(res.body).filter((key) => NATIVE_FORBIDDEN_KEYS.includes(key)),
        label,
      ).toEqual([]);
      expect(JSON.stringify(res.body)).not.toContain(user.password);
    }
  });

  it('error responses never echo credentials', async () => {
    const wrong = await api(t).post('/api/auth/sign-in/email', {
      email: user.email,
      password: 'leaked-password-attempt',
    });
    expect(wrong.status).toBe(401);
    expect(JSON.stringify(wrong.body)).not.toContain('leaked-password-attempt');

    const invalid = await get('/api/v1/admin/users?limit=500', adminCookie);
    expect(invalid.status).toBe(400);
    expect(keysOf(invalid.body).filter((key) => FORBIDDEN_KEYS.includes(key))).toEqual([]);
  });

  it('a fresh sign-in leaves no plain password anywhere in the stored rows', async () => {
    await signIn(t, user);
    const rows = JSON.stringify(
      await t.prisma
        .$queryRaw`SELECT a.password FROM account a JOIN "user" u ON u.id = a."userId" WHERE u.id = ${user.id}`,
    );
    expect(rows).not.toContain(user.password);
  });
});
