import { Logger } from '@nestjs/common';
import type { EmailJob, EnqueueEmail } from '@redova/contracts';

const logger = new Logger('EmailQueue');

/**
 * Temporary email sink until the BullMQ queue lands (UM-003).
 * Log only delivery metadata: dedupe keys can contain verification/reset URLs and tokens.
 */
export const createDevEnqueueEmail =
  (nodeEnv: string): EnqueueEmail =>
  async (job: EmailJob) => {
    if (nodeEnv === 'development') {
      logger.warn(
        { template: job.template },
        '[dev only] Email queue not configured; email dropped',
      );
    } else {
      logger.warn({ template: job.template }, 'Email queue not configured; email dropped');
    }
    return Promise.resolve();
  };
