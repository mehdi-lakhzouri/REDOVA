import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createVerifiedUser } from '../support/factories';
import { enrollMfa } from '../support/mfa';
import { createOrganization } from '../support/organizations';
import { ProbeController } from '../support/probe.controller';
import { createTestApp, type TestApp, WEB_ORIGIN } from '../support/test-app';

const EVIL = 'https://evil.example';

/**
 * SR-10 / T3 / T4 (README §17.1, §17.2): session cookies and CSRF defenses, checked in the
 * production profile (IT-008-08, IT-008-09, IT-008-10).
 */
describe('SEC-10 secure cookies, headers and CSRF (production profile)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({
      env: { NODE_ENV: 'production', BETTER_AUTH_URL: 'https://api.redova.test' },
      extra: { controllers: [ProbeController] },
    });
  });
  afterAll(() => t.close());

  const http = () => request(t.app.getHttpServer());

  it('IT-008-09 issues a __Secure- session cookie with Secure, HttpOnly and SameSite=Lax (AC-008-09)', async () => {
    const user = await createVerifiedUser(t);
    const res = await api(t)
      .post('/api/auth/sign-in/email', { email: user.email, password: user.password })
      .expect(200);
    const cookie = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('__Secure-redova.session_token='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
  });

  it('IT-008-09 hides the API documentation in production (AC-008-09)', async () => {
    for (const path of ['/api/v1/docs', '/api/v1/docs-json', '/api/auth/reference']) {
      expect((await http().get(path)).status, path).toBe(404);
    }
  });

  it('IT-008-08 sends the security headers and HSTS, without x-powered-by (AC-008-08)', async () => {
    const res = await http().get('/api/v1/health').expect(200);
    expect(res.headers).toMatchObject({
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      'content-security-policy': "default-src 'none';frame-ancestors 'none'",
    });
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('IT-008-08 never answers with CORS headers, even to a foreign origin (AC-008-08)', async () => {
    const responses = [
      await http().get('/api/v1/health').set('origin', WEB_ORIGIN),
      await http().get('/api/v1/health').set('origin', EVIL),
      await http().get('/api/auth/get-session').set('origin', EVIL),
      await http()
        .options('/api/v1/admin/users')
        .set('origin', EVIL)
        .set('access-control-request-method', 'PUT'),
      await http()
        .options('/api/auth/sign-in/email')
        .set('origin', EVIL)
        .set('access-control-request-method', 'POST'),
    ];
    for (const res of responses) {
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    }
  });

  it('masks unexpected errors in production (SR-11)', async () => {
    const res = await http().get('/api/v1/__test/boom').expect(500);
    expect(res.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    });
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  describe('CSRF (AC-008-10)', () => {
    it('IT-008-10 rejects a foreign Origin on both API surfaces', async () => {
      const org = await createOrganization(t);
      const update = await http()
        .post('/api/auth/organization/update')
        .set('origin', EVIL)
        .set('cookie', org.owner.cookie)
        .send({ organizationId: org.id, data: { name: 'Hijacked' } });
      expect(update.status).toBe(403);

      const admin = await createVerifiedUser(t);
      const { cookie } = await enrollMfa(t, admin);
      await t.prisma.user.update({ where: { id: admin.id }, data: { role: 'PLATFORM_ADMIN' } });
      const victim = await createVerifiedUser(t);
      const ban = await http()
        .put(`/api/v1/admin/users/${victim.id}/ban`)
        .set('origin', EVIL)
        .set('cookie', cookie)
        .send({ reason: 'Cross-site request forgery', expiresInDays: 1 });
      expect(ban.status).toBe(403);
      expect(ban.body.error.code).toBe('ORIGIN_NOT_ALLOWED');

      const stored = await t.prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
      expect(stored.name).not.toBe('Hijacked');
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: victim.id } })).banned).toBe(
        false,
      );
    });

    it('IT-008-10 rejects text/plain and form-encoded bodies on both API surfaces', async () => {
      const org = await createOrganization(t);
      const admin = await createVerifiedUser(t);
      const { cookie } = await enrollMfa(t, admin);
      await t.prisma.user.update({ where: { id: admin.id }, data: { role: 'PLATFORM_ADMIN' } });
      const victim = await createVerifiedUser(t);

      const bodies = [
        {
          type: 'text/plain',
          body: JSON.stringify({ organizationId: org.id, data: { name: 'Plain Text' } }),
        },
        {
          type: 'application/x-www-form-urlencoded',
          body: `organizationId=${org.id}&data[name]=Form`,
        },
      ];
      for (const { type, body } of bodies) {
        const res = await http()
          .post('/api/auth/organization/update')
          .set('origin', WEB_ORIGIN)
          .set('cookie', org.owner.cookie)
          .set('content-type', type)
          .send(body);
        expect(res.status, type).toBeGreaterThanOrEqual(400);

        const ban = await http()
          .put(`/api/v1/admin/users/${victim.id}/ban`)
          .set('origin', WEB_ORIGIN)
          .set('cookie', cookie)
          .set('content-type', type)
          .send(
            type === 'text/plain'
              ? JSON.stringify({ reason: 'Cross-site request forgery', expiresInDays: 1 })
              : 'reason=Cross-site+request+forgery&expiresInDays=1',
          );
        expect(ban.status, type).toBe(400);
      }
      const stored = await t.prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
      expect(['Plain Text', 'Form']).not.toContain(stored.name);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: victim.id } })).banned).toBe(
        false,
      );
    });
  });
});
