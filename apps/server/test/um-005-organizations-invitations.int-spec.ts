import type { AuditAction } from '@redova/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, createVerifiedUser, signIn, uniqueEmail } from './support/factories';
import {
  addMember,
  addMemberViaInvitation,
  createOrganization,
  inviteMember,
} from './support/organizations';
import { createTestApp, type TestApp, WEB_ORIGIN } from './support/test-app';

const DAY_MS = 24 * 60 * 60 * 1000;
let slugSequence = 0;
const uniqueSlug = (prefix = 'acme') => `${prefix}-${Date.now()}-${++slugSequence}`;

describe('UM-005 organizations, members and invitations', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => {
    t.emails.length = 0;
  });
  afterAll(() => t.close());

  const auditsFor = (action: AuditAction, targetId: string) =>
    t.prisma.auditEvent.findMany({ where: { action, targetId } });

  const activeOrganizationId = async (cookie: string) => {
    const res = await api(t).get('/api/auth/get-session', cookie).expect(200);
    return (res.body as { session: { activeOrganizationId: string | null } }).session
      .activeOrganizationId;
  };

  const createOrg = (cookie: string, slug: string, name = 'Acme Security') =>
    api(t).post('/api/auth/organization/create', { name, slug }, cookie);

  describe('creation and settings', () => {
    it('IT-005-01 a verified user creates an organization and becomes its owner (AC-005-01)', async () => {
      const user = await createVerifiedUser(t);
      const cookie = await signIn(t, user);
      const res = await createOrg(cookie, uniqueSlug()).expect(200);
      const organizationId = (res.body as { id: string }).id;

      const members = await t.prisma.member.findMany({ where: { organizationId } });
      expect(members).toHaveLength(1);
      expect(members[0]).toMatchObject({ userId: user.id, role: 'ORG_OWNER' });
      expect(await activeOrganizationId(cookie)).toBe(organizationId);
      const [audit] = await auditsFor('org.created', organizationId);
      expect(audit).toMatchObject({ actorUserId: user.id, organizationId, outcome: 'SUCCESS' });
    });

    it('IT-005-02 enforces the organization limit and slug rules (AC-005-02)', async () => {
      const user = await createVerifiedUser(t);
      const cookie = await signIn(t, user);
      const taken = uniqueSlug();
      await createOrg(cookie, taken).expect(200);

      const other = await signIn(t, await createVerifiedUser(t));
      const cases = [
        { slug: taken, code: 'ORGANIZATION_ALREADY_EXISTS' },
        { slug: 'admin', code: 'ORG_SLUG_RESERVED' },
        { slug: 'Acme!', code: 'ORG_SLUG_INVALID' },
      ];
      for (const { slug, code } of cases) {
        const res = await createOrg(other, slug);
        expect(res.status, slug).toBe(400);
        expect(res.body.code, slug).toBe(code);
      }
      const shortName = await createOrg(other, uniqueSlug(), 'A');
      expect(shortName.body.code).toBe('ORG_NAME_INVALID');

      await createOrg(cookie, uniqueSlug()).expect(200);
      await createOrg(cookie, uniqueSlug()).expect(200);
      const fourth = await createOrg(cookie, uniqueSlug());
      expect(fourth.status).toBe(403);
      expect(fourth.body.code).toBe('YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS');
      expect(await t.prisma.member.count({ where: { userId: user.id } })).toBe(3);
      expect(
        await t.prisma.organization.count({ where: { slug: { in: ['admin', 'Acme!'] } } }),
      ).toBe(0);
    });

    it('IT-005-02 a user whose email is no longer verified cannot create an organization', async () => {
      const user = await createVerifiedUser(t);
      const cookie = await signIn(t, user);
      await t.prisma.user.update({ where: { id: user.id }, data: { emailVerified: false } });
      const res = await createOrg(cookie, uniqueSlug());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION');
    });

    it('IT-005-03 the slug is immutable and name updates are audited (AC-005-03)', async () => {
      const org = await createOrganization(t);
      const update = (data: object) =>
        api(t).post(
          '/api/auth/organization/update',
          { organizationId: org.id, data },
          org.owner.cookie,
        );

      const slugChange = await update({ slug: uniqueSlug('renamed') });
      expect(slugChange.status).toBe(400);
      expect(slugChange.body.code).toBe('ORG_SLUG_IMMUTABLE');
      const badLogo = await update({ logo: 'http://insecure.example/logo.png' });
      expect(badLogo.body.code).toBe('ORG_LOGO_INVALID');

      await update({ name: 'Acme Renamed' }).expect(200);
      const stored = await t.prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
      expect(stored).toMatchObject({ slug: org.slug, name: 'Acme Renamed' });
      const audits = await auditsFor('org.updated', org.id);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        actorUserId: org.owner.id,
        metadata: { fields: ['name'] },
      });
    });
  });

  describe('invitations', () => {
    it('IT-005-04 an invitation is stored, emailed and audited (AC-005-04)', async () => {
      const org = await createOrganization(t);
      const email = uniqueEmail('bob');
      const invitationId = await inviteMember(t, org.id, org.owner, email, 'AI_DEVELOPER');

      const invitation = await t.prisma.invitation.findUniqueOrThrow({
        where: { id: invitationId },
      });
      expect(invitation.status).toBe('pending');
      expect(invitation.expiresAt.getTime() - Date.now()).toBeGreaterThan(7 * DAY_MS - 60_000);
      const organization = await t.prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
      expect(t.emails.filter((e) => e.template === 'organization-invitation')).toEqual([
        expect.objectContaining({
          template: 'organization-invitation',
          to: email,
          variables: {
            inviterName: org.owner.name,
            organizationName: organization.name,
            roleLabel: 'AI Developer',
            acceptUrl: `${WEB_ORIGIN}/invitations/${invitationId}`,
            expiresAt: invitation.expiresAt.toISOString(),
          },
        }),
      ]);
      const [audit] = await auditsFor('org.invitation.created', invitationId);
      expect(audit).toMatchObject({
        actorUserId: org.owner.id,
        organizationId: org.id,
        metadata: { role: 'AI_DEVELOPER' },
      });
    });

    it('IT-005-05 re-inviting replaces the pending invitation (AC-005-05)', async () => {
      const org = await createOrganization(t);
      const email = uniqueEmail('bob');
      const first = await inviteMember(t, org.id, org.owner, email, 'AI_DEVELOPER');
      const second = await inviteMember(t, org.id, org.owner, email, 'AI_DEVELOPER');

      const invitations = await t.prisma.invitation.findMany({
        where: { organizationId: org.id, email },
      });
      expect(invitations.find((i) => i.id === first)?.status).toBe('canceled');
      expect(invitations.filter((i) => i.status === 'pending').map((i) => i.id)).toEqual([second]);
      expect(t.emails.filter((e) => e.template === 'organization-invitation')).toHaveLength(2);
    });

    it('IT-005-06 a new user signs up, reads the invitation and accepts it (AC-005-06)', async () => {
      const org = await createOrganization(t);
      const email = uniqueEmail('bob');
      await inviteMember(t, org.id, org.owner, email, 'AI_DEVELOPER');
      const acceptUrl = t.emails.find((e) => e.template === 'organization-invitation')?.variables;
      const invitationId = String((acceptUrl as { acceptUrl: string }).acceptUrl)
        .split('/')
        .pop()!;

      const bob = await createVerifiedUser(t, { email });
      const cookie = await signIn(t, bob);
      const details = await api(t)
        .get(`/api/auth/organization/get-invitation?id=${invitationId}`, cookie)
        .expect(200);
      expect(details.body).toMatchObject({
        organizationId: org.id,
        role: 'AI_DEVELOPER',
        inviterEmail: org.owner.email,
      });

      await api(t)
        .post('/api/auth/organization/accept-invitation', { invitationId }, cookie)
        .expect(200);
      const member = await t.prisma.member.findFirstOrThrow({
        where: { organizationId: org.id, userId: bob.id },
      });
      expect(member.role).toBe('AI_DEVELOPER');
      expect(await activeOrganizationId(cookie)).toBe(org.id);
      const invitation = await t.prisma.invitation.findUniqueOrThrow({
        where: { id: invitationId },
      });
      expect(invitation.status).toBe('accepted');
      const [audit] = await auditsFor('org.invitation.accepted', invitationId);
      expect(audit).toMatchObject({ actorUserId: bob.id, organizationId: org.id });
    });

    it('IT-005-06 the invitation is bound to its recipient (AC-005-07)', async () => {
      const org = await createOrganization(t);
      const invitationId = await inviteMember(t, org.id, org.owner, uniqueEmail('bob'), 'VIEWER');
      const eve = await createVerifiedUser(t);
      const cookie = await signIn(t, eve);

      const read = await api(t).get(
        `/api/auth/organization/get-invitation?id=${invitationId}`,
        cookie,
      );
      const accept = await api(t).post(
        '/api/auth/organization/accept-invitation',
        { invitationId },
        cookie,
      );
      for (const res of [read, accept]) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION');
      }
      expect(await t.prisma.member.count({ where: { userId: eve.id } })).toBe(0);
    });

    it('IT-005-07 a session whose email became unverified cannot accept (AC-005-08)', async () => {
      const org = await createOrganization(t);
      const bob = await createVerifiedUser(t);
      const invitationId = await inviteMember(t, org.id, org.owner, bob.email, 'VIEWER');
      const cookie = await signIn(t, bob);
      await t.prisma.user.update({ where: { id: bob.id }, data: { emailVerified: false } });

      const res = await api(t).post(
        '/api/auth/organization/accept-invitation',
        { invitationId },
        cookie,
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(
        'EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION',
      );
      expect(await t.prisma.member.count({ where: { userId: bob.id } })).toBe(0);
    });

    it('IT-005-08 expired and canceled invitations cannot be accepted (AC-005-09)', async () => {
      const org = await createOrganization(t);
      const bob = await createVerifiedUser(t);
      const cookie = await signIn(t, bob);
      const accept = (invitationId: string) =>
        api(t).post('/api/auth/organization/accept-invitation', { invitationId }, cookie);

      const expired = await inviteMember(t, org.id, org.owner, bob.email, 'VIEWER');
      await t.prisma.invitation.update({
        where: { id: expired },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await accept(expired)).status).toBe(400);

      const canceled = await inviteMember(t, org.id, org.owner, bob.email, 'VIEWER');
      await api(t)
        .post(
          '/api/auth/organization/cancel-invitation',
          { invitationId: canceled },
          org.owner.cookie,
        )
        .expect(200);
      const [audit] = await auditsFor('org.invitation.canceled', canceled);
      expect(audit).toMatchObject({ actorUserId: org.owner.id, organizationId: org.id });
      expect((await accept(canceled)).status).toBe(400);

      expect(await t.prisma.member.count({ where: { userId: bob.id } })).toBe(0);
    });

    it('IT-005-09 invitations cannot be read anonymously (AC-005-10)', async () => {
      const org = await createOrganization(t);
      const invitationId = await inviteMember(t, org.id, org.owner, uniqueEmail('bob'), 'VIEWER');
      const res = await api(t).get(`/api/auth/organization/get-invitation?id=${invitationId}`);
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toContain(org.id);
    });

    it('IT-005-10 the recipient can decline (AC-005-11)', async () => {
      const org = await createOrganization(t);
      const bob = await createVerifiedUser(t);
      const invitationId = await inviteMember(t, org.id, org.owner, bob.email, 'VIEWER');
      const cookie = await signIn(t, bob);
      await api(t)
        .post('/api/auth/organization/reject-invitation', { invitationId }, cookie)
        .expect(200);

      const invitation = await t.prisma.invitation.findUniqueOrThrow({
        where: { id: invitationId },
      });
      expect(invitation.status).toBe('rejected');
      expect(await t.prisma.member.count({ where: { userId: bob.id } })).toBe(0);
      const [audit] = await auditsFor('org.invitation.rejected', invitationId);
      expect(audit).toMatchObject({ actorUserId: bob.id, organizationId: org.id });
    });
  });

  describe('members', () => {
    it('IT-005-11 role change and removal are audited with the actor (AC-005-12)', async () => {
      const org = await createOrganization(t);
      const dave = await addMemberViaInvitation(t, org.id, org.owner, 'VIEWER');

      await api(t)
        .post(
          '/api/auth/organization/update-member-role',
          { memberId: dave.memberId, role: 'SECURITY_ENGINEER', organizationId: org.id },
          org.owner.cookie,
        )
        .expect(200);
      const [changed] = await auditsFor('org.member.role_changed', dave.memberId);
      expect(changed).toMatchObject({
        actorUserId: org.owner.id,
        organizationId: org.id,
        metadata: { previousRole: 'VIEWER', newRole: 'SECURITY_ENGINEER', userId: dave.id },
      });

      await api(t)
        .post(
          '/api/auth/organization/remove-member',
          { memberIdOrEmail: dave.memberId, organizationId: org.id },
          org.owner.cookie,
        )
        .expect(200);
      expect(await t.prisma.member.count({ where: { id: dave.memberId } })).toBe(0);
      const [removed] = await auditsFor('org.member.removed', dave.memberId);
      expect(removed).toMatchObject({ actorUserId: org.owner.id, organizationId: org.id });

      const after = await api(t).get(
        `/api/auth/organization/get-full-organization?organizationId=${org.id}`,
        dave.cookie,
      );
      expect(after.status).toBe(403);
    });

    it('IT-005-12/15 leaving is audited as org.member.left; the last owner cannot leave (AC-005-13, RK-3)', async () => {
      const org = await createOrganization(t);
      const dave = await addMember(t, org.id, 'VIEWER');

      await api(t)
        .post('/api/auth/organization/leave', { organizationId: org.id }, dave.cookie)
        .expect(200);
      expect(await t.prisma.member.count({ where: { id: dave.memberId } })).toBe(0);
      const [left] = await auditsFor('org.member.left', dave.memberId);
      expect(left).toMatchObject({ actorUserId: dave.id, organizationId: org.id });
      // RK-3: `leave` does not fire afterRemoveMember, so no removal event is written.
      expect(await auditsFor('org.member.removed', dave.memberId)).toHaveLength(0);

      const owner = await api(t).post(
        '/api/auth/organization/leave',
        { organizationId: org.id },
        org.owner.cookie,
      );
      expect(owner.status).toBe(400);
      expect(owner.body.code).toBe('YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER');
      expect(await t.prisma.member.count({ where: { id: org.owner.memberId } })).toBe(1);
    });

    it('IT-005-13 set-active switches only between own organizations (AC-005-14)', async () => {
      const a = await createOrganization(t, 'A');
      const b = await createOrganization(t, 'B');
      const c = await createOrganization(t, 'C');
      const mia = await createVerifiedUser(t);
      await addMember(t, a.id, 'AUDITOR', mia);
      const { cookie } = await addMember(t, b.id, 'VIEWER', mia);

      await api(t)
        .post('/api/auth/organization/set-active', { organizationId: b.id }, cookie)
        .expect(200);
      expect(await activeOrganizationId(cookie)).toBe(b.id);
      const active = await api(t)
        .get('/api/auth/organization/get-active-member', cookie)
        .expect(200);
      expect(active.body).toMatchObject({ organizationId: b.id, role: 'VIEWER' });

      const foreign = await api(t).post(
        '/api/auth/organization/set-active',
        { organizationId: c.id },
        cookie,
      );
      expect(foreign.status).toBe(403);
      expect(foreign.body.code).toBe('USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION');
      // Native fail-closed behavior: a rejected switch clears the active organization (README §13).
      expect(await activeOrganizationId(cookie)).toBeNull();
    });

    it('IT-005-14 members and invitations are visible to members only (AC-005-15)', async () => {
      const a = await createOrganization(t, 'A');
      const c = await createOrganization(t, 'C');
      await inviteMember(t, a.id, a.owner, uniqueEmail('pending'), 'VIEWER');
      const mia = await addMember(t, a.id, 'VIEWER');

      const members = await api(t)
        .get(`/api/auth/organization/list-members?organizationId=${a.id}`, mia.cookie)
        .expect(200);
      expect((members.body as { total: number }).total).toBe(2);
      const invitations = await api(t)
        .get(`/api/auth/organization/list-invitations?organizationId=${a.id}`, mia.cookie)
        .expect(200);
      expect(invitations.body).toHaveLength(1);

      for (const path of ['list-members', 'list-invitations']) {
        const res = await api(t).get(
          `/api/auth/organization/${path}?organizationId=${c.id}`,
          mia.cookie,
        );
        expect(res.status, path).toBe(403);
      }
    });
  });

  it('IT-005-15 a replaced invitation is not audited as canceled (RK-3)', async () => {
    const org = await createOrganization(t);
    const email = uniqueEmail('bob');
    const first = await inviteMember(t, org.id, org.owner, email, 'VIEWER');
    await inviteMember(t, org.id, org.owner, email, 'VIEWER');
    expect(await auditsFor('org.invitation.canceled', first)).toHaveLength(0);
    expect(
      await t.prisma.auditEvent.count({
        where: { action: 'org.invitation.created', organizationId: org.id },
      }),
    ).toBe(2);
  });
});
