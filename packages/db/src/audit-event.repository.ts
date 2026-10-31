import type { AuditActorType, AuditOutcome, AuditTargetType } from './generated/prisma/enums';
import type { AuditEvent, Prisma, PrismaClient } from './generated/prisma/client';

export interface CreateAuditEventData {
  action: string;
  outcome: AuditOutcome;
  actorType: AuditActorType;
  actorUserId?: string | null;
  organizationId?: string | null;
  targetType?: AuditTargetType | null;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Platform scope sees every event (admin oversight); organization scope is always filtered. */
export type AuditScope = { kind: 'platform' } | { kind: 'organization'; organizationId: string };

export interface AuditEventFilter {
  actions?: string[];
  outcome?: AuditOutcome;
  actorUserId?: string;
  from?: Date;
  to?: Date;
  limit: number;
  /** Id of the last event of the previous page. */
  afterId?: string;
}

const scopeWhere = (scope: AuditScope): Prisma.AuditEventWhereInput =>
  scope.kind === 'organization' ? { organizationId: scope.organizationId } : {};

/** Append-only audit trail: writes, and scoped keyset reads (UM-008). */
export class AuditEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateAuditEventData): Promise<{ id: string }> {
    return this.prisma.auditEvent.create({
      data: { ...data, metadata: (data.metadata ?? {}) as object },
      select: { id: true },
    });
  }

  /** Newest first by UUIDv7 id; `null` when `afterId` is not an event of this scope. */
  async list(
    scope: AuditScope,
    filter: AuditEventFilter,
  ): Promise<{ items: AuditEvent[]; hasMore: boolean } | null> {
    if (filter.afterId) {
      const anchor = await this.prisma.auditEvent.findFirst({
        where: { id: filter.afterId, ...scopeWhere(scope) },
        select: { id: true },
      });
      if (!anchor) return null;
    }
    const rows = await this.prisma.auditEvent.findMany({
      where: {
        ...scopeWhere(scope),
        ...(filter.actions ? { action: { in: filter.actions } } : {}),
        ...(filter.outcome ? { outcome: filter.outcome } : {}),
        ...(filter.actorUserId ? { actorUserId: filter.actorUserId } : {}),
        ...(filter.from || filter.to ? { occurredAt: { gte: filter.from, lte: filter.to } } : {}),
      },
      orderBy: { id: 'desc' },
      take: filter.limit + 1,
      ...(filter.afterId ? { cursor: { id: filter.afterId }, skip: 1 } : {}),
    });
    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  findById(scope: AuditScope, id: string): Promise<AuditEvent | null> {
    return this.prisma.auditEvent.findFirst({ where: { id, ...scopeWhere(scope) } });
  }
}
