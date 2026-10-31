import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AuditEventInput,
  auditEventInputSchema,
  pickAllowedMetadata,
  unknownMetadataKeys,
} from '@redova/contracts';
import { AuditEventRepository, type PrismaClient } from '@redova/db';
import { getRequestContext } from '../common/request-context';
import type { Env } from '../config/env';
import { ENV, PRISMA } from '../config/tokens';

/**
 * Writes the security audit trail (README §17.4).
 * Invalid events are programming errors and throw; storage failures are logged and never break the caller.
 * Metadata keys outside the per-action allow-list throw outside production and are stripped in production.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly repository: AuditEventRepository;

  constructor(
    @Inject(PRISMA) prisma: PrismaClient,
    @Inject(ENV) private readonly env: Pick<Env, 'NODE_ENV'>,
  ) {
    this.repository = new AuditEventRepository(prisma);
  }

  async record(input: AuditEventInput): Promise<void> {
    const event = auditEventInputSchema.parse(input);
    const unknownKeys = unknownMetadataKeys(event.action, event.metadata);
    if (unknownKeys.length > 0) {
      if (this.env.NODE_ENV !== 'production') {
        throw new Error(
          `Audit metadata keys not allowed for ${event.action}: ${unknownKeys.join(', ')}`,
        );
      }
      this.logger.warn({ action: event.action, unknownKeys }, 'Audit metadata keys stripped');
      event.metadata = pickAllowedMetadata(event.action, event.metadata) as typeof event.metadata;
    }
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
