import { createHash } from 'node:crypto';
import { type EmailJob, emailJobSchema, type EnqueueEmail } from '@redova/contracts';
import { type JobsOptions, Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export const EMAIL_QUEUE_NAME = 'email';

/** Retries survive SMTP hiccups; finished jobs (which contain action URLs) are not kept (README §16.1). */
export const EMAIL_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: true,
  removeOnFail: { age: 86_400 },
};

/** Deterministic id: re-enqueuing the same email (same dedupe key) is a no-op. BullMQ forbids ':' in ids. */
export const emailJobId = (job: Pick<EmailJob, 'template' | 'dedupeKey'>): string =>
  `${job.template}-${createHash('sha256').update(job.dedupeKey).digest('hex')}`;

export const createEmailQueue = (connection: Redis): Queue<EmailJob> =>
  new Queue<EmailJob>(EMAIL_QUEUE_NAME, { connection });

/** Producer used by Better Auth callbacks. Payloads are validated before reaching Redis. */
export const createEnqueueEmail =
  (queue: Queue<EmailJob>, options: JobsOptions = EMAIL_JOB_OPTIONS): EnqueueEmail =>
  async (job) => {
    const payload = emailJobSchema.parse(job);
    await queue.add(payload.template, payload, { ...options, jobId: emailJobId(payload) });
  };
