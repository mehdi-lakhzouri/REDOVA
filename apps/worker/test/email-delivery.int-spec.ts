import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EmailJob } from '@redova/contracts';
import { createEmailSender, type EmailSender } from '@redova/integrations';
import {
  createEmailQueue,
  createEnqueueEmail,
  createQueueConnection,
  EMAIL_JOB_OPTIONS,
} from '@redova/queue';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadDotEnv, parseWorkerEnv, type WorkerEnv } from '../src/env';
import { startEmailWorker } from '../src/worker';
import { clearMailpit, extractLink, listMessagesTo, waitForEmail } from './mailpit';

loadDotEnv();

const redisUrl = (() => {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6380');
  url.pathname = '/13';
  return url.toString();
})();

const env: WorkerEnv = parseWorkerEnv({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  REDIS_URL: redisUrl,
  EMAIL_TRANSPORT: 'smtp',
  EMAIL_FROM: 'REDOVA <no-reply@redova.test>',
  SMTP_HOST: process.env.MAILPIT_SMTP_HOST ?? 'localhost',
  SMTP_PORT: process.env.MAILPIT_SMTP_PORT ?? '1025',
  SMTP_SECURE: 'false',
});

let sequence = 0;
const job = (overrides: Partial<EmailJob> = {}): EmailJob => {
  const to = `worker-${Date.now()}-${++sequence}@redova.test`;
  const url = `http://localhost:3001/api/auth/verify-email?token=t${sequence}`;
  return {
    template: 'verify-email',
    to,
    dedupeKey: url,
    variables: { name: 'Alice', verifyUrl: url, expiresInHours: 24 },
    ...overrides,
  } as EmailJob;
};

describe('email worker (integration with Redis and Mailpit)', () => {
  let connection: Redis;
  let queue: Queue<EmailJob>;

  beforeAll(async () => {
    connection = createQueueConnection(redisUrl);
    await connection.flushdb();
    queue = createEmailQueue(connection);
  });
  beforeEach(() => clearMailpit());
  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    await connection.quit();
  });

  it('IT-003-01 renders and delivers a queued email (AC-003-01)', async () => {
    const running = startEmailWorker(env, { logger: pino({ level: 'silent' }) });
    try {
      const email = job();
      await createEnqueueEmail(queue)(email);
      const message = await waitForEmail(email.to);
      expect(message.Subject).toBe('Verify your REDOVA email address');
      expect(extractLink(message.Text, 'http://localhost:3001/api/auth/verify-email?token=')).toBe(
        email.dedupeKey,
      );
      expect(message.HTML).toContain('verify-email?token');
    } finally {
      await running.close();
    }
  });

  it('IT-003-13 deduplicates re-enqueued jobs and retries failed deliveries (AC-003-15)', async () => {
    // First attempt fails as if SMTP were down; the retry goes to Mailpit.
    const smtp = createEmailSender(env);
    let calls = 0;
    const flaky: EmailSender = {
      send: async (message) => {
        calls += 1;
        if (calls === 1) throw new Error('SMTP connection refused');
        return smtp.send(message);
      },
    };
    const running = startEmailWorker(env, { sender: flaky, logger: pino({ level: 'silent' }) });
    try {
      const enqueue = createEnqueueEmail(queue, {
        ...EMAIL_JOB_OPTIONS,
        backoff: { type: 'fixed', delay: 200 },
      });
      const email = job();
      await enqueue(email);
      await enqueue(email);
      await waitForEmail(email.to);
      await new Promise((done) => setTimeout(done, 500));
      expect(calls).toBe(2);
      expect(await listMessagesTo(email.to)).toHaveLength(1);
    } finally {
      await running.close();
    }
  });

  it('IT-003-14 refuses Gmail SMTP in production (AC-003-16)', () => {
    const main = resolve(__dirname, '../dist/main.js');
    expect(existsSync(main), 'run `pnpm build` before the integration tests').toBe(true);
    const result = spawnSync(process.execPath, [main], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        REDIS_URL: redisUrl,
        EMAIL_TRANSPORT: 'smtp',
        EMAIL_FROM: 'REDOVA <no-reply@redova.test>',
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: '465',
      },
      encoding: 'utf8',
      timeout: 15_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Gmail SMTP is for development only');
  });
});
