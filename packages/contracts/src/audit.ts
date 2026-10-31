import { z } from 'zod';
import { cursorQuerySchema } from './pagination';

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
  'profile.avatar.updated',
  'profile.avatar.deleted',
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

/**
 * Metadata keys each action may carry (README §17.3). Writers reject other keys outside production
 * and strip them in production; readers only ever return these keys.
 */
export const AUDIT_METADATA_KEYS = {
  'auth.sign_up.completed': [],
  'profile.avatar.updated': [],
  'profile.avatar.deleted': [],
  'auth.email.verified': [],
  'auth.session.created': [],
  'auth.sign_in.failed': ['reason', 'emailHash'],
  'auth.sign_in.throttled': ['emailHash'],
  'auth.sign_out': [],
  'auth.session.revoked': ['scope'],
  'auth.password.reset_requested': [],
  'auth.password.reset_completed': [],
  'auth.password.changed': [],
  'auth.mfa.enabled': [],
  'auth.mfa.disabled': [],
  'auth.mfa.backup_codes_regenerated': [],
  'auth.mfa.challenge_failed': ['method', 'reason'],
  'auth.mfa.backup_code_used': [],
  'org.created': [],
  'org.updated': ['fields'],
  'org.invitation.created': ['role'],
  'org.invitation.canceled': ['role'],
  'org.invitation.accepted': ['role'],
  'org.invitation.rejected': ['role'],
  'org.member.role_changed': ['previousRole', 'newRole', 'userId'],
  'org.member.removed': ['role', 'userId'],
  'org.member.left': ['role'],
  'authz.access_denied': ['reason', 'role', 'required'],
  'admin.user.banned': ['expiresInDays'],
  'admin.user.unbanned': [],
  'admin.user.role_changed': ['previousRole', 'newRole'],
  'admin.user.session_revoked': ['userId'],
  'admin.user.sessions_revoked': ['count'],
  'admin.bootstrap.promoted': ['forced'],
  'admin.user.mfa_reset': ['reason', 'sessionsRevoked'],
} as const satisfies Record<AuditAction, readonly string[]>;

const allowedKeys = (action: string): readonly string[] =>
  (AUDIT_METADATA_KEYS as Record<string, readonly string[]>)[action] ?? [];

export const unknownMetadataKeys = (action: string, metadata: object = {}): string[] =>
  Object.keys(metadata).filter((key) => !allowedKeys(action).includes(key));

export const pickAllowedMetadata = (action: string, metadata: unknown): Record<string, unknown> => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => allowedKeys(action).includes(key)),
  );
};

export const AUDIT_MAX_RANGE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const auditFilters = {
  /** Repeatable: `?action=a&action=b`. */
  action: z
    .union([AuditAction, z.array(AuditAction).min(1).max(AuditAction.options.length)])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .optional(),
  outcome: AuditOutcome.optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
};

const withinRange = (query: { from?: string; to?: string }, now = Date.now()): boolean => {
  if (!query.from) return true;
  const span = (query.to ? Date.parse(query.to) : now) - Date.parse(query.from);
  return span >= 0 && span <= AUDIT_MAX_RANGE_DAYS * DAY_MS;
};

const rangeIssue = {
  message: `from must be before to, at most ${AUDIT_MAX_RANGE_DAYS} days apart`,
  path: ['from'],
};

/** Organization audit log query: the tenant comes from the path only. */
export const orgAuditEventQuerySchema = cursorQuerySchema
  .extend(auditFilters)
  .refine((query) => withinRange(query), rangeIssue);
export type OrgAuditEventQuery = z.infer<typeof orgAuditEventQuerySchema>;

/** Platform audit log query (all scopes), with an actor filter. */
export const platformAuditEventQuerySchema = cursorQuerySchema
  .extend({ ...auditFilters, actorUserId: z.string().min(1).max(200).optional() })
  .refine((query) => withinRange(query), rangeIssue);
export type PlatformAuditEventQuery = z.infer<typeof platformAuditEventQuerySchema>;

export const auditEventSchema = z
  .object({
    id: z.uuid(),
    occurredAt: z.iso.datetime(),
    action: z.string(),
    outcome: AuditOutcome,
    actorType: AuditActorType,
    /** Resolved for USER actors; null for SYSTEM, ANONYMOUS or deleted users. */
    actor: z.object({ id: z.string(), name: z.string(), email: z.email() }).strict().nullable(),
    organizationId: z.string().nullable(),
    targetType: AuditTargetType.nullable(),
    targetId: z.string().nullable(),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
    requestId: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
  })
  .strict();
export type AuditEventDto = z.infer<typeof auditEventSchema>;
