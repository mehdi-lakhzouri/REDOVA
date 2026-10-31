import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AuditEventInput, auditEventInputSchema } from '@redova/contracts';
import { AuditEventRepository, type PrismaClient } from '@redova/db';
import { getRequestContext } from '../common/request-context';
import { PRISMA } from '../config/tokens';

/**
 * Writes the security audit trail (README §17.4).
 * Invalid events are programming errors and throw; storage failures are logged and never break the caller.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly repository: AuditEventRepository;

  constructor(@Inject(PRISMA) prisma: PrismaClient) {
    this.repository = new AuditEventRepository(prisma);
  }

  async record(input: AuditEventInput): Promise<void> {
    const event = auditEventInputSchema.parse(input);
    const context = getRequestContext();
    try {
      await this.repository.create({
        ...event,
        ipAddress: event.ipAddress ?? context?.ipAddress ?? null,
        userAgent: event.userAgent ?? context?.userAgent ?? null,
        requestId: context?.requestId ?? null,
      });
    } catch (error) {
      this.logger.error(
        { err: error, action: event.action, requestId: context?.requestId },
        'Audit write failed',
      );
    }
  }
}
