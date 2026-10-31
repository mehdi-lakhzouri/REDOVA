import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthzTestController, ensureTestItemTable } from './support/authz-test.controller';
import {
  api,
  createVerifiedUser,
  DEFAULT_PASSWORD,
  signIn,
  uniqueEmail,
} from './support/factories';
import { addMember, createOrganization, type TestOrganization } from './support/organizations';
import { describeTenantIsolation } from './support/tenant-isolation.kit';
import { createTestApp, type TestApp, WEB_ORIGIN } from './support/test-app';

let t: TestApp;

const ready = (async () => {
  t = await createTestApp({ extra: { controllers: [AuthzTestController] } });
  await ensureTestItemTable(t.prisma);
  return t;
})();

afterAll(async () => {
  await (await ready).close();
});

const invite = (org: TestOrganization, cookie: string, role: string, email = uniqueEmail('inv')) =>
  api(t).post(
    '/api/auth/organization/invite-member',
    { email, role, organizationId: org.id },
    cookie,
  );

const updateRole = (orgId: string, cookie: string, memberId: string, role: string) =>
  api(t).post(
    '/api/auth/organization/update-member-role',
    { memberId, role, organizationId: orgId },
    cookie,
  );

const removeMember = (orgId: string, cookie: string, memberIdOrEmail: string) =>
  api(t).post(
    '/api/auth/organization/remove-member',
    { memberIdOrEmail, organizationId: orgId },
    cookie,
  );

const roleOf = async (memberId: string) =>
  (await t.prisma.member.findUnique({ where: { id: memberId } }))?.role;

describe('UM-006 organization role escalation (README §10.4)', () => {
  let org: TestOrganization;

  beforeAll(async () => {
    await ready;
    org = await createOrganization(t);
  });

  it('IT-006-01 ORG_ADMIN cannot invite at or above their rank (AC-006-02)', async () => {
    const admin = await addMember(t, org.id, 'ORG_ADMIN');
    for (const role of ['ORG_ADMIN', 'ORG_OWNER']) {
      const email = uniqueEmail('esc');
      const res = await invite(org, admin.cookie, role, email);
      expect(res.status, role).toBe(403);
      expect(await t.prisma.invitation.count({ where: { email } })).toBe(0);
    }
    const res = await invite(org, admin.cookie, 'SECURITY_ENGINEER');
    expect(res.status).toBe(200);
  });

  it('IT-006-02 ORG_ADMIN cannot promote or manage peer admins (AC-006-03)', async () => {
    const alice = await addMember(t, org.id, 'ORG_ADMIN');
    const carol = await addMember(t, org.id, 'ORG_ADMIN');
    const dave = await addMember(t, org.id, 'VIEWER');

    const promote = await updateRole(org.id, alice.cookie, dave.memberId, 'ORG_ADMIN');
    expect(promote.status).toBe(403);
    expect(promote.body.code).toBe('ORG_ROLE_ESCALATION_FORBIDDEN');
    expect((await updateRole(org.id, alice.cookie, carol.memberId, 'VIEWER')).status).toBe(403);
    expect((await removeMember(org.id, alice.cookie, carol.memberId)).status).toBe(403);
    expect((await removeMember(org.id, alice.cookie, carol.email)).status).toBe(403);
    expect(await roleOf(dave.memberId)).toBe('VIEWER');
    expect(await roleOf(carol.memberId)).toBe('ORG_ADMIN');

    expect((await updateRole(org.id, alice.cookie, dave.memberId, 'AUDITOR')).status).toBe(200);
    expect(await roleOf(dave.memberId)).toBe('AUDITOR');
    expect((await removeMember(org.id, alice.cookie, dave.memberId)).status).toBe(200);
    expect(await roleOf(dave.memberId)).toBeUndefined();
  });

  it('IT-006-03 nobody can raise their own role; lowering it is allowed (AC-006-04)', async () => {
    const erin = await addMember(t, org.id, 'SECURITY_ENGINEER');
    const alice = await addMember(t, org.id, 'ORG_ADMIN');

    expect((await updateRole(org.id, erin.cookie, erin.memberId, 'ORG_ADMIN')).status).toBe(403);
    expect(await roleOf(erin.memberId)).toBe('SECURITY_ENGINEER');
    expect((await updateRole(org.id, alice.cookie, alice.memberId, 'ORG_OWNER')).status).toBe(403);
    expect(await roleOf(alice.memberId)).toBe('ORG_ADMIN');
    expect((await updateRole(org.id, alice.cookie, alice.memberId, 'VIEWER')).status).toBe(200);
    expect(await roleOf(alice.memberId)).toBe('VIEWER');
  });

  it('IT-006-04 owners keep full control and the last owner is protected (AC-006-05)', async () => {
    const solo = await createOrganization(t);
    const demote = await updateRole(solo.id, solo.owner.cookie, solo.owner.memberId, 'VIEWER');
    expect(demote.status).toBeGreaterThanOrEqual(400);
    expect(await roleOf(solo.owner.memberId)).toBe('ORG_OWNER');
    const leave = await api(t).post(
      '/api/auth/organization/leave',
      { organizationId: solo.id },
      solo.owner.cookie,
    );
    expect(leave.status).toBeGreaterThanOrEqual(400);

    const alice = await addMember(t, solo.id, 'ORG_ADMIN');
    expect((await updateRole(solo.id, solo.owner.cookie, alice.memberId, 'ORG_OWNER')).status).toBe(
      200,
    );
    expect(await roleOf(alice.memberId)).toBe('ORG_OWNER');
  });

  it('IT-006-05 rejects invalid role values (AC-006-06)', async () => {
    const viewer = await addMember(t, org.id, 'VIEWER');
    for (const role of ['ORG_ADMIN,VIEWER', 'admin', 'SUPERUSER']) {
      const email = uniqueEmail('bad');
      expect((await invite(org, org.owner.cookie, role, email)).status, role).toBe(400);
      expect(await t.prisma.invitation.count({ where: { email } })).toBe(0);
      expect((await updateRole(org.id, org.owner.cookie, viewer.memberId, role)).status, role).toBe(
        400,
      );
    }
    expect(await roleOf(viewer.memberId)).toBe('VIEWER');
  });

  it('IT-006-06 member mutations require an explicit organizationId (AC-006-07)', async () => {
    const viewer = await addMember(t, org.id, 'VIEWER');
    await t.auth.api.setActiveOrganization({
      headers: new Headers({ cookie: org.owner.cookie }),
      body: { organizationId: org.id },
    });
    const update = await api(t).post(
      '/api/auth/organization/update-member-role',
      { memberId: viewer.memberId, role: 'AUDITOR' },
      org.owner.cookie,
    );
    expect(update.status).toBe(400);
    expect(update.body.code).toBe('ORGANIZATION_ID_REQUIRED');
    const remove = await api(t).post(
      '/api/auth/organization/remove-member',
      { memberIdOrEmail: viewer.memberId },
      org.owner.cookie,
    );
    expect(remove.status).toBe(400);
    expect(await roleOf(viewer.memberId)).toBe('VIEWER');
  });
});

describe('UM-006 tenant-scoped REDOVA API guards', () => {
  let orgA: TestOrganization;
  let orgB: TestOrganization;

  beforeAll(async () => {
    await ready;
    orgA = await createOrganization(t, 'A');
    orgB = await createOrganization(t, 'B');
  });

  it('IT-006-07 non-members get 404, identical to a non-existent organization (AC-006-08)', async () => {
    const bob = await addMember(t, orgB.id, 'VIEWER');
    const foreign = await api(t).get(
      `/api/v1/organizations/${orgA.id}/__test/members-only`,
      bob.cookie,
    );
    const missing = await api(t).get(
      '/api/v1/organizations/does-not-exist/__test/members-only',
      bob.cookie,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body.error).toEqual(missing.body.error);
    expect(foreign.body.error.code).toBe('ORGANIZATION_NOT_FOUND');
  });

  it('IT-006-08 missing permission is 403 and audited; AUDITOR is allowed (AC-006-09)', async () => {
    const vera = await addMember(t, orgA.id, 'VIEWER');
    const res = await api(t).get(`/api/v1/organizations/${orgA.id}/__test/audit`, vera.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    const audit = await t.prisma.auditEvent.findFirst({
      where: { action: 'authz.access_denied', actorUserId: vera.id, organizationId: orgA.id },
    });
    expect(audit).toMatchObject({ outcome: 'DENIED' });

    const auditor = await addMember(t, orgA.id, 'AUDITOR');
    const ok = await api(t).get(`/api/v1/organizations/${orgA.id}/__test/audit`, auditor.cookie);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({ role: 'AUDITOR' });
  });

  it('IT-006-09 membership changes apply on the very next request (AC-006-10)', async () => {
    const dave = await addMember(t, orgA.id, 'AUDITOR');
    const path = `/api/v1/organizations/${orgA.id}/__test/audit`;
    expect((await api(t).get(path, dave.cookie)).status).toBe(200);
    await t.prisma.member.update({ where: { id: dave.memberId }, data: { role: 'VIEWER' } });
    expect((await api(t).get(path, dave.cookie)).status).toBe(403);
    await removeMember(orgA.id, orgA.owner.cookie, dave.memberId).expect(200);
    expect((await api(t).get(path, dave.cookie)).status).toBe(404);
  });

  it('IT-006-10 authorization follows the path tenant, not the active organization (AC-006-11)', async () => {
    const mia = await createVerifiedUser(t);
    await addMember(t, orgA.id, 'AUDITOR', mia);
    const { cookie } = await addMember(t, orgB.id, 'VIEWER', mia);
    const headers = new Headers({ cookie });
    await t.auth.api.setActiveOrganization({ headers, body: { organizationId: orgB.id } });
    expect((await api(t).get(`/api/v1/organizations/${orgA.id}/__test/audit`, cookie)).status).toBe(
      200,
    );
    await t.auth.api.setActiveOrganization({ headers, body: { organizationId: orgA.id } });
    expect((await api(t).get(`/api/v1/organizations/${orgB.id}/__test/audit`, cookie)).status).toBe(
      403,
    );
  });

  it('IT-006-15 cross-origin mutations are rejected before the handler (AC-006-15)', async () => {
    const owner = orgA.owner;
    const path = `/api/v1/organizations/${orgA.id}/__test/items`;
    const http = request(t.app.getHttpServer());
    const evil = await http
      .post(path)
      .set('origin', 'https://evil.example')
      .set('cookie', owner.cookie)
      .send({ name: 'evil' });
    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    const [{ count }] = await t.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) FROM test_tenant_item WHERE name = 'evil'`;
    expect(Number(count)).toBe(0);
    await http
      .post(path)
      .set('origin', WEB_ORIGIN)
      .set('cookie', owner.cookie)
      .send({})
      .expect(201);
  });
});

describeTenantIsolation({
  name: 'test tenant items (IT-006-11, AC-006-12)',
  setup: async () => {
    await ready;
    const a = await createOrganization(t, 'Iso A');
    const b = await createOrganization(t, 'Iso B');
    return {
      t,
      a: { organizationId: a.id, cookie: a.owner.cookie },
      b: { organizationId: b.id, cookie: b.owner.cookie },
    };
  },
  create: async (app, side) => {
    const res = await request(app.app.getHttpServer())
      .post(`/api/v1/organizations/${side.organizationId}/__test/items`)
      .set('origin', WEB_ORIGIN)
      .set('cookie', side.cookie)
      .send({ name: 'item' })
      .expect(201);
    return res.body.data.id as string;
  },
  listPath: (orgId) => `/api/v1/organizations/${orgId}/__test/items`,
  itemPath: (orgId, id) => `/api/v1/organizations/${orgId}/__test/items/${id}`,
  createPath: (orgId) => `/api/v1/organizations/${orgId}/__test/items`,
});

describe('UM-006 platform admin guards (AC-006-13, AC-006-14, AC-006-16)', () => {
  const adminRequest = (method: 'get' | 'post', cookie: string) => {
    const http = request(t.app.getHttpServer());
    return method === 'get'
      ? http.get('/api/v1/__test/admin').set('cookie', cookie)
      : http.post('/api/v1/__test/admin').set('origin', WEB_ORIGIN).set('cookie', cookie).send({});
  };

  const makeAdmin = async (options: { mfa: boolean; staleSession?: boolean }) => {
    const user = await createVerifiedUser(t);
    // Sign in before flagging MFA: with MFA enabled, sign-in would require the second factor (UM-004).
    const cookie = await signIn(t, user);
    await t.prisma.user.update({
      where: { id: user.id },
      data: { role: 'PLATFORM_ADMIN', twoFactorEnabled: options.mfa },
    });
    if (options.staleSession) {
      await t.prisma.session.updateMany({
        where: { userId: user.id },
        data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      });
    }
    return { user, cookie };
  };

  beforeAll(async () => {
    await ready;
  });

  it('IT-006-12 enforces role, MFA and recent authentication', async () => {
    const plain = await createVerifiedUser(t);
    const userCookie = await signIn(t, plain);
    const noMfa = await makeAdmin({ mfa: false });
    const stale = await makeAdmin({ mfa: true, staleSession: true });
    const fresh = await makeAdmin({ mfa: true });

    const code = async (method: 'get' | 'post', cookie: string) => {
      const res = await adminRequest(method, cookie);
      return res.status === 200 || res.status === 201 ? 'OK' : res.body.error.code;
    };

    expect(await code('get', userCookie)).toBe('FORBIDDEN_PERMISSION');
    expect(await code('post', userCookie)).toBe('FORBIDDEN_PERMISSION');
    expect(await code('get', noMfa.cookie)).toBe('MFA_ENROLLMENT_REQUIRED');
    expect(await code('post', noMfa.cookie)).toBe('MFA_ENROLLMENT_REQUIRED');
    expect(await code('get', stale.cookie)).toBe('OK');
    expect(await code('post', stale.cookie)).toBe('REAUTHENTICATION_REQUIRED');
    expect(await code('get', fresh.cookie)).toBe('OK');
    expect(await code('post', fresh.cookie)).toBe('OK');
  });

  it('IT-006-13 platform admins have no tenant bypass (AC-006-14)', async () => {
    const admin = await makeAdmin({ mfa: true });
    const org = await createOrganization(t);
    const res = await api(t).get(
      `/api/v1/organizations/${org.id}/__test/members-only`,
      admin.cookie,
    );
    expect(res.status).toBe(404);
  });

  it('IT-006-14 role, ban state and MFA flag cannot be set by clients (AC-006-16)', async () => {
    const email = uniqueEmail('inject');
    await api(t).post('/api/auth/sign-up/email', {
      name: 'Mallory',
      email,
      password: DEFAULT_PASSWORD,
      role: 'PLATFORM_ADMIN',
      banned: true,
      twoFactorEnabled: true,
    });
    const created = await t.prisma.user.findUnique({ where: { email } });
    if (created) {
      expect(created).toMatchObject({ role: 'USER', banned: false, twoFactorEnabled: false });
    }

    const user = await createVerifiedUser(t);
    const cookie = await signIn(t, user);
    await api(t).post(
      '/api/auth/update-user',
      { role: 'PLATFORM_ADMIN', twoFactorEnabled: true },
      cookie,
    );
    const after = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after).toMatchObject({ role: 'USER', twoFactorEnabled: false });
  });
});

describe('UM-006 test-only code never ships', () => {
  it('the production build contains no test controller', () => {
    const dist = resolve(__dirname, '../dist');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.js')) files.push(path);
      }
    };
    walk(dist);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/AuthzTestController|__test/);
    }
  });
});
