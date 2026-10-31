import type { AuditActorType, AuditOutcome, AuditTargetType } from './generated/prisma/enums';
import type { PrismaClient } from './generated/prisma/client';

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

/** Write side of the append-only audit trail. */
export class AuditEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateAuditEventData): Promise<{ id: string }> {
    return this.prisma.auditEvent.create({
      data: { ...data, metadata: (data.metadata ?? {}) as object },
      select: { id: true },
    });
  }
}
