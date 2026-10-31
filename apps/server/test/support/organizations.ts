import type { OrgRole } from '@redova/contracts';
import { api, createVerifiedUser, signIn, type TestUser } from './factories';
import type { TestApp } from './test-app';

export interface TestMember extends TestUser {
  memberId: string;
  role: OrgRole;
  cookie: string;
}

export interface TestOrganization {
  id: string;
  slug: string;
  owner: TestMember;
}

let orgSequence = 0;

/** Creates an organization through Better Auth; the creator becomes ORG_OWNER. */
export const createOrganization = async (t: TestApp, name = 'Org'): Promise<TestOrganization> => {
  const user = await createVerifiedUser(t);
  const cookie = await signIn(t, user);
  const slug = `org-${Date.now()}-${++orgSequence}`;
  const organization = await t.auth.api.createOrganization({
    headers: new Headers({ cookie }),
    body: { name: `${name} ${orgSequence}`, slug },
  });
  if (!organization) throw new Error('organization creation failed');
  const member = await t.prisma.member.findFirstOrThrow({
    where: { organizationId: organization.id, userId: user.id },
  });
  return {
    id: organization.id,
    slug,
    owner: { ...user, memberId: member.id, role: 'ORG_OWNER', cookie },
  };
};

/** Adds a signed-in member with `role` (server-side `addMember`, as invitations arrive in UM-005). */
export const addMember = async (
  t: TestApp,
  organizationId: string,
  role: OrgRole,
  user?: TestUser,
): Promise<TestMember> => {
  const target = user ?? (await createVerifiedUser(t));
  const member = await t.auth.api.addMember({
    body: { userId: target.id, organizationId, role },
  });
  if (!member) throw new Error('addMember failed');
  const cookie = await signIn(t, target);
  return { ...target, memberId: member.id, role, cookie };
};

/** Invites over HTTP as `inviter`. Returns the invitation id. */
export const inviteMember = async (
  t: TestApp,
  organizationId: string,
  inviter: Pick<TestMember, 'cookie'>,
  email: string,
  role: OrgRole,
): Promise<string> => {
  const res = await api(t).post(
    '/api/auth/organization/invite-member',
    { email, role, organizationId },
    inviter.cookie,
  );
  if (res.status !== 200)
    throw new Error(`invite failed: ${res.status} ${JSON.stringify(res.body)}`);
  return (res.body as { id: string }).id;
};

/** Full invitation flow: invite, then the (verified, signed-in) user accepts over HTTP. */
export const addMemberViaInvitation = async (
  t: TestApp,
  organizationId: string,
  inviter: Pick<TestMember, 'cookie'>,
  role: OrgRole,
  user?: TestUser,
): Promise<TestMember> => {
  const target = user ?? (await createVerifiedUser(t));
  const invitationId = await inviteMember(t, organizationId, inviter, target.email, role);
  const cookie = await signIn(t, target);
  const res = await api(t).post(
    '/api/auth/organization/accept-invitation',
    { invitationId },
    cookie,
  );
  if (res.status !== 200)
    throw new Error(`accept failed: ${res.status} ${JSON.stringify(res.body)}`);
  const member = await t.prisma.member.findFirstOrThrow({
    where: { organizationId, userId: target.id },
  });
  return { ...target, memberId: member.id, role, cookie };
};
