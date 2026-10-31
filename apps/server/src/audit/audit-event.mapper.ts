import { type AuditEventDto, auditEventSchema, pickAllowedMetadata } from '@redova/contracts';
import type { AuditEvent } from '@redova/db';

export interface AuditActor {
  id: string;
  name: string;
  email: string;
}

/** Only USER actors are resolved; SYSTEM, ANONYMOUS and deleted users have no actor (README §17.4). */
export const resolveActor = (
  event: Pick<AuditEvent, 'actorType' | 'actorUserId'>,
  usersById: ReadonlyMap<string, AuditActor>,
): AuditActor | null => {
  if (event.actorType !== 'USER' || !event.actorUserId) return null;
  return usersById.get(event.actorUserId) ?? null;
};

/** Strict output: metadata is reduced to the action's allow-list on the way out. */
export const toAuditEventDto = (
  event: AuditEvent,
  usersById: ReadonlyMap<string, AuditActor>,
): AuditEventDto =>
  auditEventSchema.parse({
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    action: event.action,
    outcome: event.outcome,
    actorType: event.actorType,
    actor: resolveActor(event, usersById),
    organizationId: event.organizationId,
    targetType: event.targetType,
    targetId: event.targetId,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    requestId: event.requestId,
    metadata: pickAllowedMetadata(event.action, event.metadata),
  });
