import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createVerifiedUser, signIn } from '../support/factories';
import { enrollMfa } from '../support/mfa';
import { addMember, createOrganization } from '../support/organizations';
import { createTestApp, type TestApp, WEB_ORIGIN } from '../support/test-app';

/**
 * Account state is enforced on every request (README §17.2). Earlier tickets cover the native
 * sign-in side (IT-002-04, IT-007-04/05/06, IT-007-09); these specs cover REDOVA's own routes.
 */
describe('SEC-01 / SEC-04 account state on REDOVA routes', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  const auditLog = (organizationId: string, cookie: string) =>
    request(t.app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/audit-events`)
      .set('cookie', cookie);

  it('SEC-01 a session whose user is no longer verified is refused with EMAIL_NOT_VERIFIED (SR-01)', async () => {
    const org = await createOrganization(t);
    await auditLog(org.id, org.owner.cookie).expect(200);
    await t.prisma.user.update({
      where: { id: org.owner.id },
      data: { emailVerified: false },
    });
    const res = await auditLog(org.id, org.owner.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it("SEC-04 a ban removes a member's organization access at once and blocks new sessions (SR-04)", async () => {
    const org = await createOrganization(t);
    const auditor = await addMember(t, org.id, 'AUDITOR');
    await auditLog(org.id, auditor.cookie).expect(200);

    const admin = await createVerifiedUser(t);
    const { cookie } = await enrollMfa(t, admin);
    await t.prisma.user.update({ where: { id: admin.id }, data: { role: 'PLATFORM_ADMIN' } });
    await request(t.app.getHttpServer())
      .put(`/api/v1/admin/users/${auditor.id}/ban`)
      .set('origin', WEB_ORIGIN)
      .set('cookie', cookie)
      .send({ reason: 'Security suite ban check', expiresInDays: 1 })
      .expect(200);

    const denied = await auditLog(org.id, auditor.cookie);
    expect(denied.status).toBe(401);
    expect(denied.body.error.code).toBe('UNAUTHENTICATED');
    const signInAgain = await api(t).post('/api/auth/sign-in/email', {
      email: auditor.email,
      password: auditor.password,
    });
    expect(signInAgain.status).toBe(403);
    expect(signInAgain.body.code).toBe('BANNED_USER');
    // The membership is kept for when the ban is lifted (README §14).
    expect(await t.prisma.member.count({ where: { id: auditor.memberId } })).toBe(1);

    await request(t.app.getHttpServer())
      .delete(`/api/v1/admin/users/${auditor.id}/ban`)
      .set('origin', WEB_ORIGIN)
      .set('cookie', cookie)
      .expect(204);
    await auditLog(org.id, await signIn(t, auditor)).expect(200);
  });
});
