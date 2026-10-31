import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import type { TestApp } from '../../support/test-app';
import { api, createVerifiedUser, signIn, uniqueEmail } from '../../support/factories';
import { enrollMfa } from '../../support/mfa';
import { createOrganization } from '../../support/organizations';
import { createJestApp } from '../support/app';

describe('HTTP security regression tests with PostgreSQL and Redis', () => {
  let t: TestApp;
  let adminCookie: string;
  let userCookie: string;
  let userId: string;
  let orgId: string;
  let otherOrgId: string;
  let ownerCookie: string;

  beforeAll(async () => {
    t = await createJestApp();
    const user = await createVerifiedUser(t);
    userId = user.id;
    userCookie = await signIn(t, user);
    const admin = await createVerifiedUser(t);
    adminCookie = (await enrollMfa(t, admin)).cookie;
    await t.prisma.user.update({ where: { id: admin.id }, data: { role: 'PLATFORM_ADMIN' } });
    const org = await createOrganization(t, 'Jest organization');
    orgId = org.id;
    ownerCookie = org.owner.cookie;
    otherOrgId = (await createOrganization(t, 'Other organization')).id;
  });
  afterAll(async () => {
    await t?.close();
  });

  it.each([
    "' OR 1=1 --",
    "'; DROP TABLE user; --",
    "' UNION SELECT password FROM account --",
    "Robert'); DELETE FROM audit_event; --",
  ])('treats a SQL payload as literal user-search data: %s', async (q) => {
    const before = await t.prisma.user.count();
    const auditsBefore = await t.prisma.auditEvent.count();
    const response = await request(t.app.getHttpServer())
      .get('/api/v1/admin/users')
      .query({ q })
      .set('cookie', adminCookie)
      .expect(200);
    expect(response.body.data).toEqual([]);
    expect(await t.prisma.user.count()).toBe(before);
    expect(await t.prisma.auditEvent.count()).toBeGreaterThanOrEqual(auditsBefore);
    expect(await t.prisma.account.count()).toBeGreaterThan(0);
  });

  it.each(["' OR 1=1 --", 'not-a-user', '00000000-0000-0000-0000-000000000000'])(
    'does not interpret a user identifier as SQL: %s',
    async (id) => {
      await request(t.app.getHttpServer())
        .get(`/api/v1/admin/users/${encodeURIComponent(id)}`)
        .set('cookie', adminCookie)
        .expect(404);
    },
  );

  it.each([
    '',
    'not-base64!',
    Buffer.from(JSON.stringify({ id: "' OR 1=1 --" })).toString('base64url'),
  ])('rejects an invalid audit cursor safely: %s', async (cursor) => {
    const response = await request(t.app.getHttpServer())
      .get(`/api/v1/organizations/${orgId}/audit-events`)
      .query({ cursor })
      .set('cookie', ownerCookie);
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toMatch(/SELECT |PrismaClient|stack":/);
  });

  it('prevents a profile update from elevating the global role', async () => {
    const response = await api(t).post(
      '/api/auth/update-user',
      { role: 'PLATFORM_ADMIN' },
      userCookie,
    );
    expect(response.status).toBe(400);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: userId } })).role).toBe('USER');
  });

  it.each(['lastLoginAt', 'lastActiveAt', 'onboardingCompletedAt', 'twoFactorEnabled', 'banned'])(
    'protects the server-owned user field %s',
    async (field) => {
      const value = field.endsWith('At') ? '2099-01-01T00:00:00Z' : true;
      await api(t)
        .post('/api/auth/update-user', { [field]: value }, userCookie)
        .expect(400);
      const user = await t.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user).toMatchObject({
        role: 'USER',
        banned: false,
        twoFactorEnabled: false,
        lastLoginAt: null,
        lastActiveAt: null,
        onboardingCompletedAt: null,
      });
    },
  );

  it('does not let a query-string tenant override the tenant in the URL', async () => {
    const response = await request(t.app.getHttpServer())
      .get(`/api/v1/organizations/${orgId}/audit-events`)
      .query({ organizationId: otherOrgId })
      .set('cookie', ownerCookie)
      .expect(200);
    expect(
      response.body.data.every(
        (entry: { organizationId: string }) => entry.organizationId === orgId,
      ),
    ).toBe(true);
    await request(t.app.getHttpServer())
      .get(`/api/v1/organizations/${otherOrgId}/audit-events`)
      .set('cookie', ownerCookie)
      .expect(404);
  });

  it('treats a forged session cookie as unauthenticated', async () => {
    await request(t.app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('cookie', 'redova.session_token=forged-token.invalid-signature')
      .expect(401);
  });

  it('never accepts a signed-out session again', async () => {
    const user = await createVerifiedUser(t);
    const cookie = await signIn(t, user);
    await api(t).post('/api/auth/sign-out', {}, cookie).expect(200);
    expect((await api(t).get('/api/auth/get-session', cookie).expect(200)).body).toBeNull();
  });

  it('blocks a valid session after its database expiry', async () => {
    const user = await createVerifiedUser(t);
    const cookie = await signIn(t, user);
    await t.prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await api(t).get('/api/auth/get-session', cookie).expect(200)).body).toBeNull();
  });

  it.each(['https://evil.example', 'null', 'http://localhost:3000.evil.example'])(
    'blocks an authenticated cross-origin admin mutation: %s',
    async (origin) => {
      await request(t.app.getHttpServer())
        .put(`/api/v1/admin/users/${userId}/ban`)
        .set('cookie', adminCookie)
        .set('origin', origin)
        .send({ reason: 'Unauthorized mutation attempt', expiresInDays: 1 })
        .expect(403);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: userId } })).banned).toBe(false);
    },
  );

  it.each([0, -1, 101, 'NaN'])('rejects an invalid page size %s', async (limit) => {
    await request(t.app.getHttpServer())
      .get('/api/v1/admin/users')
      .query({ limit })
      .set('cookie', adminCookie)
      .expect(400);
  });

  it('returns JSON rather than executing user-supplied HTML', async () => {
    const name = '<img src=x onerror=alert(1)>';
    const signup = await api(t)
      .post('/api/auth/sign-up/email', {
        name,
        email: uniqueEmail('xss'),
        password: 'correct-horse-battery-staple',
      })
      .expect(200);
    expect(signup.headers['content-type']).toMatch(/application\/json/);
    expect(signup.headers['x-content-type-options']).toBe('nosniff');
    expect(signup.headers['content-security-policy']).toContain("default-src 'none'");
    // Stored text must still be escaped by any future HTML UI.
    expect(signup.body.user.name).toBe(name);
  });
});
