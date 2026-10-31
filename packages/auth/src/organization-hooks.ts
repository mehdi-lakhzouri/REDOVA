import { tryGetCurrentAuthEndpointContext } from '@better-auth/core/context';
import {
  type AuditEventInput,
  type EnqueueEmail,
  ORG_ROLE_LABELS,
  type OrgRole,
  type RecordAuditEvent,
} from '@redova/contracts';
import { type OrgFieldIssue, validateOrgCreation, validateOrgUpdate } from '@redova/core';
import type { PrismaClient } from '@redova/db';
import { APIError, getSessionFromCtx, isAPIError } from 'better-auth/api';
import type { AuthHookContext, AuthHookHandler } from './audit-hooks';

export const ORG_FIELD_ERROR: Record<OrgFieldIssue, { code: OrgFieldIssue; message: string }> = {
  ORG_SLUG_INVALID: {
    code: 'ORG_SLUG_INVALID',
    message:
      'The slug must be 3-48 lowercase letters, digits or hyphens, and start and end with a letter or digit.',
  },
  ORG_SLUG_RESERVED: { code: 'ORG_SLUG_RESERVED', message: 'This slug is reserved.' },
  ORG_SLUG_IMMUTABLE: {
    code: 'ORG_SLUG_IMMUTABLE',
    message: 'The organization slug cannot be changed.',
  },
  ORG_NAME_INVALID: {
    code: 'ORG_NAME_INVALID',
    message: 'The organization name must be 2-64 characters long.',
  },
  ORG_LOGO_INVALID: {
    code: 'ORG_LOGO_INVALID',
    message: 'The logo must be an https URL of at most 2048 characters.',
  },
};

const reject = (issue: OrgFieldIssue | null): void => {
  if (issue) throw new APIError('BAD_REQUEST', ORG_FIELD_ERROR[issue]);
};

const roleLabel = (role: string): string => ORG_ROLE_LABELS[role as OrgRole] ?? role;

export interface Ref {
  id: string;
}
export interface MemberRef extends Ref {
  organizationId: string;
  userId: string;
  role: string;
}
export interface InvitationRef extends Ref {
  organizationId: string;
  role: string;
}

export interface OrganizationHooksOptions {
  prisma: PrismaClient;
  audit: RecordAuditEvent;
  enqueueEmail: EnqueueEmail;
  webOrigin: string;
}

/**
 * Organization field rules, invitation email and `org.*` audit events (UM-005, README §17.4).
 * Native member hooks receive the target, not the actor: the actor is read from the session of the
 * endpoint being executed. `leave` fires no organization hook, so it is audited by an endpoint hook.
 */
export const createOrganizationHooks = ({
  prisma,
  audit,
  enqueueEmail,
  webOrigin,
}: OrganizationHooksOptions) => {
  /** Session user of the running endpoint; null for server-side calls without a session. */
  const currentActorId = async (): Promise<string | null> => {
    const ctx = tryGetCurrentAuthEndpointContext();
    if (!ctx) return null;
    const session = await getSessionFromCtx(ctx as AuthHookContext).catch(() => null);
    return session?.user.id ?? null;
  };

  const auditBy = (
    actorUserId: string | null,
    event: Omit<AuditEventInput, 'actorType' | 'actorUserId' | 'outcome'>,
  ) =>
    audit({
      ...event,
      actorType: actorUserId ? 'USER' : 'SYSTEM',
      actorUserId,
      outcome: 'SUCCESS',
    });

  const invitationEvent = (
    action: AuditEventInput['action'],
    actorUserId: string,
    invitation: InvitationRef,
  ) =>
    auditBy(actorUserId, {
      action,
      organizationId: invitation.organizationId,
      targetType: 'INVITATION',
      targetId: invitation.id,
      metadata: { role: invitation.role },
    });

  const organizationHooks = {
    beforeCreateOrganization: async ({
      organization,
    }: {
      organization: { name?: unknown; slug?: unknown; logo?: unknown };
    }) => {
      reject(validateOrgCreation(organization));
    },
    afterCreateOrganization: async ({ organization, user }: { organization: Ref; user: Ref }) => {
      await auditBy(user.id, {
        action: 'org.created',
        organizationId: organization.id,
        targetType: 'ORGANIZATION',
        targetId: organization.id,
      });
    },
    beforeUpdateOrganization: async ({
      organization,
      member,
    }: {
      organization: { name?: unknown; slug?: unknown; logo?: unknown };
      member: { organizationId: string };
    }) => {
      const current = await prisma.organization.findUniqueOrThrow({
        where: { id: member.organizationId },
        select: { slug: true },
      });
      reject(validateOrgUpdate(current.slug, organization));
    },
    afterUpdateOrganization: async ({
      organization,
      user,
    }: {
      organization: Ref | null;
      user: Ref;
    }) => {
      if (!organization) return;
      const data = (tryGetCurrentAuthEndpointContext()?.body as { data?: object } | undefined)
        ?.data;
      await auditBy(user.id, {
        action: 'org.updated',
        organizationId: organization.id,
        targetType: 'ORGANIZATION',
        targetId: organization.id,
        // Field names only: values may be user content (README §17.3).
        metadata: { fields: Object.keys(data ?? {}).sort() },
      });
    },
    afterCreateInvitation: async ({
      invitation,
      inviter,
    }: {
      invitation: InvitationRef;
      inviter: Ref;
    }) => {
      await invitationEvent('org.invitation.created', inviter.id, invitation);
    },
    afterCancelInvitation: async ({
      invitation,
      cancelledBy,
    }: {
      invitation: InvitationRef;
      cancelledBy: Ref;
    }) => {
      await invitationEvent('org.invitation.canceled', cancelledBy.id, invitation);
    },
    afterAcceptInvitation: async ({
      invitation,
      user,
    }: {
      invitation: InvitationRef;
      user: Ref;
    }) => {
      await invitationEvent('org.invitation.accepted', user.id, invitation);
    },
    afterRejectInvitation: async ({
      invitation,
      user,
    }: {
      invitation: InvitationRef;
      user: Ref;
    }) => {
      await invitationEvent('org.invitation.rejected', user.id, invitation);
    },
    afterUpdateMemberRole: async ({
      member,
      previousRole,
    }: {
      member: MemberRef;
      previousRole: string;
    }) => {
      await auditBy(await currentActorId(), {
        action: 'org.member.role_changed',
        organizationId: member.organizationId,
        targetType: 'MEMBER',
        targetId: member.id,
        metadata: { previousRole, newRole: member.role, userId: member.userId },
      });
    },
    afterRemoveMember: async ({ member }: { member: MemberRef }) => {
      await auditBy(await currentActorId(), {
        action: 'org.member.removed',
        organizationId: member.organizationId,
        targetType: 'MEMBER',
        targetId: member.id,
        metadata: { role: member.role, userId: member.userId },
      });
    },
  };

  /** Re-invites (`resend`) keep the invitation id but extend `expiresAt`, so both form the key. */
  const sendInvitationEmail = async ({
    invitation,
    inviter,
    organization,
  }: {
    invitation: InvitationRef & { email: string; expiresAt: Date };
    inviter: { user: { name: string } };
    organization: { name: string };
  }) => {
    const expiresAt = new Date(invitation.expiresAt).toISOString();
    await enqueueEmail({
      template: 'organization-invitation',
      to: invitation.email,
      dedupeKey: `${invitation.id}:${expiresAt}`,
      variables: {
        inviterName: inviter.user.name,
        organizationName: organization.name,
        roleLabel: roleLabel(invitation.role),
        acceptUrl: `${webOrigin}/invitations/${invitation.id}`,
        expiresAt,
      },
    });
  };

  const after: AuthHookHandler = async (ctx) => {
    if (ctx.path !== '/organization/leave') return;
    const returned: unknown = ctx.context.returned;
    if (!returned || isAPIError(returned)) return;
    const member = returned as MemberRef;
    await auditBy(member.userId, {
      action: 'org.member.left',
      organizationId: member.organizationId,
      targetType: 'MEMBER',
      targetId: member.id,
      metadata: { role: member.role },
    });
  };

  return { organizationHooks, sendInvitationEmail, after };
};
