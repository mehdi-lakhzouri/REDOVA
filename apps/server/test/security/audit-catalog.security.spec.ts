import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  AuditAction,
  type AuditActorType,
  type AuditOutcome,
  type AuditTargetType,
} from '@redova/contracts';
import type { Prisma } from '@redova/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createVerifiedUser, signIn, type TestUser, uniqueEmail } from '../support/factories';
import { enrollMfa, mergeCookies } from '../support/mfa';
import {
  addMember,
  addMemberViaInvitation,
  createOrganization,
  inviteMember,
} from '../support/organizations';
import { createTestApp, type TestApp, WEB_ORIGIN } from '../support/test-app';

/** What the single audit row produced by a trigger must look like. */
interface Expected {
  /** Narrows the search to rows created by this trigger. */
  where: Prisma.AuditEventWhereInput;
  actorType: AuditActorType;
  actorUserId: string | null;
  organizationId: string | null;
  targetType: AuditTargetType | null;
  outcome: AuditOutcome;
}

interface Context {
  t: TestApp;
  admin: { user: TestUser; cookie: string };
}

type Trigger = (ctx: Context) => Promise<Expected>;

const PASSWORD = 'correct-horse-battery-staple';
const pathOf = (url: string) => {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
};
const cli = (name: string) => resolve(__dirname, `../../dist/cli/${name}.js`);

const asUser = (user: { id: string }, extra: Partial<Expected> = {}): Omit<Expected, 'where'> => ({
  actorType: 'USER',
  actorUserId: user.id,
  organizationId: null,
  targetType: 'USER',
  outcome: 'SUCCESS',
  ...extra,
});

const signUp = (t: TestApp, email: string) =>
  api(t)
    .post('/api/auth/sign-up/email', {
      name: 'Catalog',
      email,
      password: PASSWORD,
      callbackURL: `${WEB_ORIGIN}/welcome`,
    })
    .expect(200);

const resetToken = async (t: TestApp, email: string) => {
  await api(t)
    .post('/api/auth/request-password-reset', { email, redirectTo: `${WEB_ORIGIN}/reset-password` })
    .expect(200);
  const job = [...t.emails]
    .reverse()
    .find((e) => e.template === 'reset-password' && e.to === email);
  const res = await request(t.app.getHttpServer()).get(
    pathOf((job!.variables as { resetUrl: string }).resetUrl),
  );
  return new URL(res.headers.location).searchParams.get('token')!;
};

/** Password step of an MFA sign-in: returns the two-factor cookie jar. */
const startMfaSignIn = async (t: TestApp, user: TestUser) =>
  mergeCookies(
    '',
    await api(t)
      .post('/api/auth/sign-in/email', { email: user.email, password: user.password })
      .expect(200),
  );

const adminRequest = (t: TestApp, cookie: string) => {
  const http = request(t.app.getHttpServer());
  return {
    put: (path: string, body: object) =>
      http
        .put(`/api/v1/admin/users${path}`)
        .set('origin', WEB_ORIGIN)
        .set('cookie', cookie)
        .send(body),
    delete: (path: string) =>
      http.delete(`/api/v1/admin/users${path}`).set('origin', WEB_ORIGIN).set('cookie', cookie),
  };
};

const BAN = { reason: 'Catalog completeness test', expiresInDays: 1 };

/** One trigger per audit action (README §17.4). TypeScript fails if an action has no trigger. */
const CATALOG: Record<AuditAction, Trigger> = {
  'auth.sign_up.completed': async ({ t }) => {
    const email = uniqueEmail('catalog');
    await signUp(t, email);
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
    return { where: { targetId: user.id }, ...asUser(user) };
  },
  'auth.email.verified': async ({ t }) => {
    const email = uniqueEmail('catalog');
    await signUp(t, email);
    const job = t.emails.find((e) => e.template === 'verify-email' && e.to === email)!;
    await request(t.app.getHttpServer())
      .get(pathOf((job.variables as { verifyUrl: string }).verifyUrl))
      .expect(302);
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
    return { where: { targetId: user.id }, ...asUser(user) };
  },
  'auth.session.created': async ({ t }) => {
    const user = await createVerifiedUser(t);
    await signIn(t, user);
    return { where: { actorUserId: user.id }, ...asUser(user, { targetType: 'SESSION' }) };
  },
  'auth.sign_in.failed': async ({ t }) => {
    const user = await createVerifiedUser(t);
    await api(t).post('/api/auth/sign-in/email', {
      email: user.email,
      password: 'wrong-password-1',
    });
    return {
      where: { targetId: user.id },
      ...asUser(user, { actorType: 'ANONYMOUS', actorUserId: null, outcome: 'FAILURE' }),
    };
  },
  'auth.sign_in.throttled': async ({ t }) => {
    const user = await createVerifiedUser(t);
    for (let i = 1; i <= 11; i++) {
      await api(t)
        .post('/api/auth/sign-in/email', { email: user.email, password: 'wrong-password-1' })
        .set('x-forwarded-for', `10.9.0.${i}`);
    }
    return {
      where: { targetId: user.id },
      ...asUser(user, { actorType: 'ANONYMOUS', actorUserId: null, outcome: 'DENIED' }),
    };
  },
  'auth.sign_out': async ({ t }) => {
    const user = await createVerifiedUser(t);
    await api(t)
      .post('/api/auth/sign-out', {}, await signIn(t, user))
      .expect(200);
    return { where: { targetId: user.id }, ...asUser(user) };
  },
  'auth.session.revoked': async ({ t }) => {
    const user = await createVerifiedUser(t);
    const cookie = await signIn(t, user, '10.9.1.1');
    await signIn(t, user, '10.9.1.2');
    await api(t).post('/api/auth/revoke-other-sessions', {}, cookie).expect(200);
    return { where: { targetId: user.id }, ...asUser(user) };
  },
  'auth.password.reset_requested': async ({ t }) => {
    const user = await createVerifiedUser(t);
    await resetToken(t, user.email);
    return {
      where: { targetId: user.id },
      ...asUser(user, { actorType: 'ANONYMOUS', actorUserId: null }),
    };
  },
  'auth.password.reset_completed': async ({ t }) => {
    const user = await createVerifiedUser(t);
    const token = await resetToken(t, user.email);
    await api(t)
      .post('/api/auth/reset-password', { token, newPassword: 'catalog-new-password-1' })
      .expect(200);
    return { where: { targetId: user.id }, ...asUser(user) };
  },
  'auth.password.changed': async ({ t }) => {
    const user = await createVerifiedUser(t);
    await api(t)
      .post(
        '/api/auth/change-password',
        { currentPassword: user.password, newPassword: 'catalog-new-password-2' },
        await signIn(t, user),
      )
      .expect(200);
    return { where: { targetId: user.id }, ...asUser(user) };
  },
  'auth.mfa.enabled': async ({ t }) => {
    const user = await createVerifiedUser(t);
    await enrollMfa(t, user);
    return { where: { targetId: user.id }, ...asUser(user) };
  },
  'auth.mfa.disabled': async ({ t }) => {
    const user = await createVerifiedUser(t);
    const { cookie } = await enrollMfa(t, user);
    await api(t)
      .post('/api/auth/two-factor/disable', { password: user.password }, cookie)
      .expect(200);
    return { where: { targetId: user.id }, ...asUser(user) };
  },
  'auth.mfa.backup_codes_regenerated': async ({ t }) => {
    const user = await createVerifiedUser(t);
    const { cookie } = await enrollMfa(t, user);
    await api(t)
      .post('/api/auth/two-factor/generate-backup-codes', { password: user.password }, cookie)
      .expect(200);
    return { where: { targetId: user.id }, ...asUser(user) };
  },
  'auth.mfa.challenge_failed': async ({ t }) => {
    const user = await createVerifiedUser(t);
    await enrollMfa(t, user);
    const jar = await startMfaSignIn(t, user);
    await api(t).post('/api/auth/two-factor/verify-totp', { code: '000000' }, jar).expect(401);
    return {
      where: { targetId: user.id },
      ...asUser(user, { actorType: 'ANONYMOUS', actorUserId: null, outcome: 'FAILURE' }),
    };
  },
  'auth.mfa.backup_code_used': async ({ t }) => {
    const user = await createVerifiedUser(t);
    const { backupCodes } = await enrollMfa(t, user);
    const jar = await startMfaSignIn(t, user);
    await api(t)
      .post('/api/auth/two-factor/verify-backup-code', { code: backupCodes[0] }, jar)
      .expect(200);
    return { where: { targetId: user.id }, ...asUser(user) };
  },
  'org.created': async ({ t }) => {
    const org = await createOrganization(t);
    return {
      where: { targetId: org.id },
      ...asUser(org.owner, { organizationId: org.id, targetType: 'ORGANIZATION' }),
    };
  },
  'org.updated': async ({ t }) => {
    const org = await createOrganization(t);
    await api(t)
      .post(
        '/api/auth/organization/update',
        { organizationId: org.id, data: { name: 'Catalog Renamed' } },
        org.owner.cookie,
      )
      .expect(200);
    return {
      where: { targetId: org.id },
      ...asUser(org.owner, { organizationId: org.id, targetType: 'ORGANIZATION' }),
    };
  },
  'org.invitation.created': async ({ t }) => {
    const org = await createOrganization(t);
    const id = await inviteMember(t, org.id, org.owner, uniqueEmail('invitee'), 'VIEWER');
    return {
      where: { targetId: id },
      ...asUser(org.owner, { organizationId: org.id, targetType: 'INVITATION' }),
    };
  },
  'org.invitation.canceled': async ({ t }) => {
    const org = await createOrganization(t);
    const id = await inviteMember(t, org.id, org.owner, uniqueEmail('invitee'), 'VIEWER');
    await api(t)
      .post('/api/auth/organization/cancel-invitation', { invitationId: id }, org.owner.cookie)
      .expect(200);
    return {
      where: { targetId: id },
      ...asUser(org.owner, { organizationId: org.id, targetType: 'INVITATION' }),
    };
  },
  'org.invitation.accepted': async ({ t }) => {
    const org = await createOrganization(t);
    const member = await addMemberViaInvitation(t, org.id, org.owner, 'VIEWER');
    const invitation = await t.prisma.invitation.findFirstOrThrow({
      where: { organizationId: org.id, email: member.email },
    });
    return {
      where: { targetId: invitation.id },
      ...asUser(member, { organizationId: org.id, targetType: 'INVITATION' }),
    };
  },
  'org.invitation.rejected': async ({ t }) => {
    const org = await createOrganization(t);
    const bob = await createVerifiedUser(t);
    const id = await inviteMember(t, org.id, org.owner, bob.email, 'VIEWER');
    await api(t)
      .post('/api/auth/organization/reject-invitation', { invitationId: id }, await signIn(t, bob))
      .expect(200);
    return {
      where: { targetId: id },
      ...asUser(bob, { organizationId: org.id, targetType: 'INVITATION' }),
    };
  },
  'org.member.role_changed': async ({ t }) => {
    const org = await createOrganization(t);
    const dave = await addMember(t, org.id, 'VIEWER');
    await api(t)
      .post(
        '/api/auth/organization/update-member-role',
        { memberId: dave.memberId, role: 'AUDITOR', organizationId: org.id },
        org.owner.cookie,
      )
      .expect(200);
    return {
      where: { targetId: dave.memberId },
      ...asUser(org.owner, { organizationId: org.id, targetType: 'MEMBER' }),
    };
  },
  'org.member.removed': async ({ t }) => {
    const org = await createOrganization(t);
    const dave = await addMember(t, org.id, 'VIEWER');
    await api(t)
      .post(
        '/api/auth/organization/remove-member',
        { memberIdOrEmail: dave.memberId, organizationId: org.id },
        org.owner.cookie,
      )
      .expect(200);
    return {
      where: { targetId: dave.memberId },
      ...asUser(org.owner, { organizationId: org.id, targetType: 'MEMBER' }),
    };
  },
  'org.member.left': async ({ t }) => {
    const org = await createOrganization(t);
    const dave = await addMember(t, org.id, 'VIEWER');
    await api(t)
      .post('/api/auth/organization/leave', { organizationId: org.id }, dave.cookie)
      .expect(200);
    return {
      where: { targetId: dave.memberId },
      ...asUser(dave, { organizationId: org.id, targetType: 'MEMBER' }),
    };
  },
  'authz.access_denied': async ({ t }) => {
    const user = await createVerifiedUser(t);
    const cookie = await signIn(t, user);
    await request(t.app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('cookie', cookie)
      .expect(403);
    return {
      where: { actorUserId: user.id },
      ...asUser(user, { targetType: null, outcome: 'DENIED' }),
    };
  },
  'admin.user.banned': async ({ t, admin }) => {
    const bob = await createVerifiedUser(t);
    await adminRequest(t, admin.cookie).put(`/${bob.id}/ban`, BAN).expect(200);
    return { where: { targetId: bob.id }, ...asUser(admin.user) };
  },
  'admin.user.unbanned': async ({ t, admin }) => {
    const bob = await createVerifiedUser(t);
    await adminRequest(t, admin.cookie).put(`/${bob.id}/ban`, BAN).expect(200);
    await adminRequest(t, admin.cookie).delete(`/${bob.id}/ban`).expect(204);
    return { where: { targetId: bob.id }, ...asUser(admin.user) };
  },
  'admin.user.role_changed': async ({ t, admin }) => {
    const carl = await createVerifiedUser(t);
    await adminRequest(t, admin.cookie)
      .put(`/${carl.id}/role`, { role: 'PLATFORM_ADMIN' })
      .expect(200);
    return { where: { targetId: carl.id }, ...asUser(admin.user) };
  },
  'admin.user.session_revoked': async ({ t, admin }) => {
    const bob = await createVerifiedUser(t);
    await signIn(t, bob);
    const session = await t.prisma.session.findFirstOrThrow({ where: { userId: bob.id } });
    await adminRequest(t, admin.cookie).delete(`/${bob.id}/sessions/${session.id}`).expect(204);
    return { where: { targetId: session.id }, ...asUser(admin.user, { targetType: 'SESSION' }) };
  },
  'admin.user.sessions_revoked': async ({ t, admin }) => {
    const bob = await createVerifiedUser(t);
    await signIn(t, bob);
    await adminRequest(t, admin.cookie).delete(`/${bob.id}/sessions`).expect(204);
    return { where: { targetId: bob.id }, ...asUser(admin.user) };
  },
  'admin.bootstrap.promoted': async ({ t }) => {
    const user = await createVerifiedUser(t);
    const run = spawnSync(
      process.execPath,
      [cli('admin-promote'), '--email', user.email, '--force'],
      {
        env: { ...process.env, DATABASE_URL: t.env.DATABASE_URL },
        encoding: 'utf8',
      },
    );
    expect(run.status, run.stderr).toBe(0);
    return {
      where: { targetId: user.id },
      ...asUser(user, { actorType: 'SYSTEM', actorUserId: null }),
    };
  },
  'admin.user.mfa_reset': async ({ t }) => {
    const user = await createVerifiedUser(t);
    await enrollMfa(t, user);
    const run = spawnSync(
      process.execPath,
      [cli('mfa-reset'), '--email', user.email, '--reason', 'catalog completeness test'],
      {
        input: `${user.email}\n`,
        env: { ...process.env, DATABASE_URL: t.env.DATABASE_URL },
        encoding: 'utf8',
      },
    );
    expect(run.status, run.stderr).toBe(0);
    return {
      where: { targetId: user.id },
      ...asUser(user, { actorType: 'SYSTEM', actorUserId: null }),
    };
  },
};

/** Actions that need the rate limiter (per-account throttle) enabled. */
const NEEDS_RATE_LIMIT = new Set<AuditAction>(['auth.sign_in.throttled']);

const expectExactlyOne = async (t: TestApp, action: AuditAction, expected: Expected) => {
  const { where, ...fields } = expected;
  const rows = await t.prisma.auditEvent.findMany({ where: { action, ...where } });
  expect(rows, `${action}: ${JSON.stringify(where)}`).toHaveLength(1);
  expect(rows[0]).toMatchObject(fields);
};

const makeAdmin = async (t: TestApp) => {
  const user = await createVerifiedUser(t);
  const { cookie } = await enrollMfa(t, user);
  await t.prisma.user.update({ where: { id: user.id }, data: { role: 'PLATFORM_ADMIN' } });
  return { user, cookie };
};

describe('SEC-12 audit catalog completeness (AC-008-04, IT-008-04)', () => {
  it('maps every AuditAction to a trigger', () => {
    expect(Object.keys(CATALOG).sort()).toEqual([...AuditAction.options].sort());
  });

  describe('default profile', () => {
    let ctx: Context;
    beforeAll(async () => {
      const t = await createTestApp();
      ctx = { t, admin: await makeAdmin(t) };
    });
    afterAll(() => ctx.t.close());

    const actions = AuditAction.options.filter((action) => !NEEDS_RATE_LIMIT.has(action));
    it.each(actions)(
      '%s is recorded exactly once with its scope, actor and target',
      async (action) => {
        await expectExactlyOne(ctx.t, action, await CATALOG[action](ctx));
      },
    );
  });

  describe('rate-limited profile', () => {
    let ctx: Context;
    beforeAll(async () => {
      const t = await createTestApp({ env: { RATE_LIMIT_ENABLED: 'true' } });
      ctx = { t, admin: await makeAdmin(t) };
    });
    afterAll(() => ctx.t.close());

    it.each([...NEEDS_RATE_LIMIT])('%s is recorded exactly once', async (action) => {
      await expectExactlyOne(ctx.t, action, await CATALOG[action](ctx));
    });
  });
});
