import { Inject, Injectable } from '@nestjs/common';
import {
  type AuditEventDto,
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
  type OrgAuditEventQuery,
  type Paginated,
  type PlatformAuditEventQuery,
} from '@redova/contracts';
import {
  type AuditEvent,
  AuditEventRepository,
  type AuditScope,
  type PrismaClient,
} from '@redova/db';
import { ApiException } from '../common/api-exception';
import { PRISMA } from '../config/tokens';
import { type AuditActor, toAuditEventDto } from './audit-event.mapper';

/** Audit ids are UUIDv7 (`audit_event.id` is a uuid column). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read side of the audit trail (README §17.4, UM-008). Read-only: there is no write endpoint. */
@Injectable()
export class AuditQueryService {
  private readonly repository: AuditEventRepository;

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {
    this.repository = new AuditEventRepository(prisma);
  }

  async list(
    scope: AuditScope,
    query: OrgAuditEventQuery & Partial<Pick<PlatformAuditEventQuery, 'actorUserId'>>,
  ): Promise<Paginated<AuditEventDto>> {
    const afterId = query.cursor ? decodeCursor(query.cursor).id : undefined;
    if (afterId !== undefined && !UUID.test(afterId)) throw new InvalidCursorError();
    const page = await this.repository.list(scope, {
      actions: query.action,
      outcome: query.outcome,
      actorUserId: query.actorUserId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      afterId,
    });
    if (!page) throw new InvalidCursorError();
    const last = page.items.at(-1);
    return {
      items: await this.toDtos(page.items),
      pagination: {
        limit: query.limit,
        hasMore: page.hasMore,
        nextCursor: page.hasMore && last ? encodeCursor({ id: last.id }) : null,
      },
    };
  }

  /** Another scope's event is reported exactly like a missing one. */
  async get(scope: AuditScope, eventId: string): Promise<AuditEventDto> {
    const event = UUID.test(eventId) ? await this.repository.findById(scope, eventId) : null;
    if (!event) throw new ApiException('NOT_FOUND');
    const [dto] = await this.toDtos([event]);
    return dto;
  }

  /** One batched lookup for all actors of the page. */
  private async toDtos(events: AuditEvent[]): Promise<AuditEventDto[]> {
    const ids = [...new Set(events.flatMap((e) => (e.actorUserId ? [e.actorUserId] : [])))];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const usersById = new Map<string, AuditActor>(users.map((user) => [user.id, user]));
    return events.map((event) => toAuditEventDto(event, usersById));
  }
}
