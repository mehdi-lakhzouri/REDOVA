import { canAssignOrgRole, canManageMember, isValidOrgRole } from '@redova/core';
import type { PrismaClient } from '@redova/db';
import { APIError, getSessionFromCtx } from 'better-auth/api';
import type { AuthHookHandler } from './audit-hooks';

export const ORG_HOOK_ERROR = {
  ORG_ROLE_ESCALATION_FORBIDDEN: {
    code: 'ORG_ROLE_ESCALATION_FORBIDDEN',
    message: 'You cannot grant or manage a role at or above your own.',
  },
  ORG_ROLE_INVALID: {
    code: 'ORG_ROLE_INVALID',
    message: 'The role must be exactly one of the REDOVA organization roles.',
  },
  ORGANIZATION_ID_REQUIRED: {
    code: 'ORGANIZATION_ID_REQUIRED',
    message: 'organizationId is required for member management.',
  },
} as const;

const forbidden = () => new APIError('FORBIDDEN', ORG_HOOK_ERROR.ORG_ROLE_ESCALATION_FORBIDDEN);
const invalidRole = () => new APIError('BAD_REQUEST', ORG_HOOK_ERROR.ORG_ROLE_INVALID);

const MEMBER_MUTATIONS = new Set([
  '/organization/update-member-role',
  '/organization/remove-member',
]);

/**
 * Organization role-rank rules R3–R6 (README §10.4). Better Auth natively protects the owner role
 * (R1) and the last owner (R2); these hooks close the admin-to-admin and self-promotion gaps.
 */
export const createOrgEscalationHooks = (prisma: PrismaClient) => {
  const findMember = (organizationId: string, where: { id?: string; userId?: string }) =>
    prisma.member.findFirst({
      where: { organizationId, ...where },
      select: { id: true, role: true },
    });

  /** The inviter is provided by Better Auth for invitations. */
  const beforeCreateInvitation = async ({
    invitation,
    inviter,
    organization,
  }: {
    invitation: { role: string };
    inviter: { id: string };
    organization: { id: string };
  }): Promise<void> => {
    if (!isValidOrgRole(invitation.role)) throw invalidRole();
    const actor = await findMember(organization.id, { userId: inviter.id });
    if (!actor || !canAssignOrgRole({ actorRole: actor.role, targetRole: invitation.role })) {
      throw forbidden();
    }
  };

  /**
   * Native member hooks receive the target user, not the actor: role changes and removals are checked
   * here with the caller's session. An explicit organizationId keeps both sides on the same tenant.
   */
  const before: AuthHookHandler = async (ctx) => {
    if (!MEMBER_MUTATIONS.has(ctx.path)) return;
    const body = (ctx.body ?? {}) as {
      organizationId?: unknown;
      memberId?: unknown;
      memberIdOrEmail?: unknown;
      role?: unknown;
    };
    if (typeof body.organizationId !== 'string' || body.organizationId.length === 0) {
      throw new APIError('BAD_REQUEST', ORG_HOOK_ERROR.ORGANIZATION_ID_REQUIRED);
    }
    const organizationId = body.organizationId;
    const isRoleChange = ctx.path === '/organization/update-member-role';
    if (isRoleChange && !isValidOrgRole(body.role)) throw invalidRole();

    // Missing session, actor or target: let Better Auth return its native error without leaking.
    const session = await getSessionFromCtx(ctx).catch(() => null);
    if (!session) return;
    const actor = await findMember(organizationId, { userId: session.user.id });
    if (!actor) return;

    const targetRef = isRoleChange ? body.memberId : body.memberIdOrEmail;
    if (typeof targetRef !== 'string') return;
    const target = targetRef.includes('@')
      ? await prisma.member.findFirst({
          where: { organizationId, user: { email: targetRef.toLowerCase() } },
          select: { id: true, role: true },
        })
      : await findMember(organizationId, { id: targetRef });
    if (!target) return;

    const allowed = canManageMember({
      actorRole: actor.role,
      actorMemberId: actor.id,
      targetMemberId: target.id,
      targetRole: target.role,
      newRole: isRoleChange ? (body.role as string) : undefined,
    });
    if (!allowed) throw forbidden();
  };

  return { before, beforeCreateInvitation };
};
