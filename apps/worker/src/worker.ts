import type { EmailJob } from '@redova/contracts';
import { EmailRenderer, type EmailSender, createEmailSender } from '@redova/integrations';
import { createQueueConnection, EMAIL_QUEUE_NAME } from '@redova/queue';
import { Worker } from 'bullmq';
import pino, { type Logger } from 'pino';
import { createEmailProcessor, recipientDomain } from './email-processor';
import type { WorkerEnv } from './env';

export const createLogger = (env: Pick<WorkerEnv, 'LOG_LEVEL' | 'NODE_ENV'>): Logger =>
  pino({
    level: env.LOG_LEVEL,
    base: { service: 'redova-worker', environment: env.NODE_ENV },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['*.to', '*.variables', '*.dedupeKey', '*.data', 'SMTP_PASS', 'EMAIL_API_KEY'],
      censor: '[Redacted]',
    },
  });

/** Starts the email worker. `sender` can be injected by tests. */
export const startEmailWorker = (
  env: WorkerEnv,
  options: { logger?: Logger; sender?: EmailSender } = {},
) => {
  const logger = options.logger ?? createLogger(env);
  const sender = options.sender ?? createEmailSender(env);
  const connection = createQueueConnection(env.REDIS_URL);
  const worker = new Worker<EmailJob>(
    EMAIL_QUEUE_NAME,
    createEmailProcessor({ renderer: new EmailRenderer(), sender, logger }),
    { connection, concurrency: env.EMAIL_CONCURRENCY },
  );

  worker.on('failed', (job, error) => {
    logger.warn(
      {
        jobId: job?.id,
        template: job?.data.template,
        recipientDomain: job ? recipientDomain(job.data.to) : undefined,
        attempt: job?.attemptsMade,
        err: { type: error.name, message: error.message },
      },
      'Email delivery failed',
    );
  });

  const close = async () => {
    await worker.close();
    await connection.quit();
  };
  return { worker, close, logger };
};
