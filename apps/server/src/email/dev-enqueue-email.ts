import { Logger } from '@nestjs/common';
import type { EmailJob, EnqueueEmail } from '@redova/contracts';

const logger = new Logger('EmailQueue');

/**
 * Temporary email sink until the BullMQ queue lands (UM-003).
 * Action URLs are printed only in development so a developer can complete the flow locally.
 */
export const createDevEnqueueEmail =
  (nodeEnv: string): EnqueueEmail =>
  async (job: EmailJob) => {
    if (nodeEnv === 'development') {
      logger.warn(`[dev only] ${job.template} for ${job.to}: ${job.dedupeKey}`);
    } else {
      logger.warn(`Email queue not configured yet; dropped "${job.template}" email`);
    }
    return Promise.resolve();
  };
