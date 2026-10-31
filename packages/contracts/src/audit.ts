import { z } from 'zod';

/** Security audit catalog (docs/user-management/README.md §17.4). */
export const AuditAction = z.enum([
  'auth.sign_up.completed',
  'auth.email.verified',
  'auth.session.created',
  'auth.sign_in.failed',
  'auth.sign_in.throttled',
  'auth.sign_out',
  'auth.session.revoked',
  'auth.password.reset_requested',
  'auth.password.reset_completed',
  'auth.password.changed',
  'auth.mfa.enabled',
  'auth.mfa.disabled',
  'auth.mfa.backup_codes_regenerated',
  'auth.mfa.challenge_failed',
  'auth.mfa.backup_code_used',
  'org.created',
  'org.updated',
  'org.invitation.created',
  'org.invitation.canceled',
  'org.invitation.accepted',
  'org.invitation.rejected',
  'org.member.role_changed',
  'org.member.removed',
  'org.member.left',
  'authz.access_denied',
  'admin.user.banned',
  'admin.user.unbanned',
  'admin.user.role_changed',
  'admin.user.session_revoked',
  'admin.user.sessions_revoked',
  'admin.bootstrap.promoted',
  'admin.user.mfa_reset',
]);
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditOutcome = z.enum(['SUCCESS', 'FAILURE', 'DENIED']);
export type AuditOutcome = z.infer<typeof AuditOutcome>;

export const AuditActorType = z.enum(['USER', 'SYSTEM', 'ANONYMOUS']);
export type AuditActorType = z.infer<typeof AuditActorType>;

export const AuditTargetType = z.enum(['USER', 'SESSION', 'ORGANIZATION', 'MEMBER', 'INVITATION']);
export type AuditTargetType = z.infer<typeof AuditTargetType>;

const metadataValue = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]);

/** Input accepted by the audit writer. Request context (ip, user agent, request id) is added by the writer. */
export const auditEventInputSchema = z.object({
  action: AuditAction,
  outcome: AuditOutcome,
  actorType: AuditActorType,
  actorUserId: z.string().nullish(),
  organizationId: z.string().nullish(),
  targetType: AuditTargetType.nullish(),
  targetId: z.string().nullish(),
  ipAddress: z.string().nullish(),
  userAgent: z.string().nullish(),
  metadata: z.record(z.string(), metadataValue).optional(),
});
export type AuditEventInput = z.input<typeof auditEventInputSchema>;

export type RecordAuditEvent = (input: AuditEventInput) => Promise<void>;
