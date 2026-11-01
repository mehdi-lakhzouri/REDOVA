import { type ChildProcess, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createPrismaClient } from '@redova/db';
import { loadTestEnv, prepareTestDatabase, resetDatabase } from '@redova/db/testing';
import { Redis } from 'ioredis';
import type { TestProject } from 'vitest/node';

export interface E2eContext {
  baseUrl: string;
  webOrigin: string;
  mailpitUrl: string;
  databaseUrl: string;
  logFiles: string[];
}

declare module 'vitest' {
  export interface ProvidedContext {
    e2e: E2eContext;
  }
}

const PORT = Number(process.env.E2E_PORT ?? 3101);
const WEB_ORIGIN = 'http://localhost:3000';
const LOG_DIR = resolve(__dirname, '../../.e2e-logs');
const SERVER_MAIN = resolve(__dirname, '../../dist/main.js');
const WORKER_MAIN = resolve(__dirname, '../../../worker/dist/main.js');

/** `<db>_e2e` on the configured server: never the development or integration database. */
const e2eDatabaseUrl = (): string => {
  const url = new URL(
    process.env.DATABASE_URL ?? 'postgresql://redova:redova@localhost:5433/redova',
  );
  url.pathname = `${url.pathname.replace(/^\//, '')}_e2e`;
  return url.toString();
};

const start = (name: string, main: string, env: Record<string, string>): ChildProcess => {
  const log = createWriteStream(resolve(LOG_DIR, `${name}.log`));
  const child = spawn(process.execPath, [main], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  return child;
};

const waitForHealth = async (baseUrl: string, server: ChildProcess): Promise<void> => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`Server exited (${server.exitCode}); see .e2e-logs`);
    const ok = await fetch(`${baseUrl}/api/v1/health`, { signal: AbortSignal.timeout(2_000) })
      .then((res) => res.ok)
      .catch(() => false);
    if (ok) return;
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error('Server did not become healthy within 30 s; see .e2e-logs');
};

/**
 * API end-to-end environment (README §19.1): the built server and worker run as real processes
 * against PostgreSQL, Redis and Mailpit. Process output goes to `.e2e-logs/` (uploaded by CI on
 * failure, and scanned for secrets by the journeys).
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  loadTestEnv();
  if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) throw new Error('Invalid E2E_PORT');
  mkdirSync(LOG_DIR, { recursive: true });

  process.env.TEST_DATABASE_URL = e2eDatabaseUrl();
  const databaseUrl = await prepareTestDatabase();
  const prisma = createPrismaClient(databaseUrl);
  await resetDatabase(prisma);
  await prisma.$disconnect();

  // Dedicated local services; CI explicitly points these variables at its disposable job services.
  const redisUrl = new URL(process.env.E2E_REDIS_URL ?? 'redis://localhost:6381');
  redisUrl.pathname = '/12';
  const redis = new Redis(redisUrl.toString());
  await redis.flushdb();
  await redis.quit();

  const mailpitUrl = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8026';
  await fetch(`${mailpitUrl}/api/v1/info`, { signal: AbortSignal.timeout(3_000) }).then(
    (response) => {
      if (!response.ok) throw new Error('E2E Mailpit is unavailable');
    },
  );

  const baseUrl = `http://localhost:${PORT}`;
  // Production profile, like a deployment; empty strings keep the developer's .env out of the run.
  const server = start('server', SERVER_MAIN, {
    NODE_ENV: 'production',
    PORT: String(PORT),
    LOG_LEVEL: 'debug',
    LOG_AUTO_LOGGING: 'true',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl.toString(),
    BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-0000',
    BETTER_AUTH_URL: baseUrl,
    WEB_ORIGIN,
    HIBP_ENABLED: 'false',
    RATE_LIMIT_ENABLED: 'false',
    MEDIA_STORAGE: 'local',
    MEDIA_LOCAL_DIR: resolve(tmpdir(), 'redova-e2e-media'),
  });
  const worker = start('worker', WORKER_MAIN, {
    NODE_ENV: 'production',
    LOG_LEVEL: 'debug',
    REDIS_URL: redisUrl.toString(),
    EMAIL_TRANSPORT: 'smtp',
    EMAIL_FROM: 'REDOVA <no-reply@redova.test>',
    SMTP_HOST: process.env.E2E_SMTP_HOST ?? 'localhost',
    SMTP_PORT: process.env.E2E_SMTP_PORT ?? '1026',
    SMTP_SECURE: 'false',
    SMTP_USER: '',
    SMTP_PASS: '',
    EMAIL_API_KEY: '',
  });

  const stop = async () => {
    for (const child of [server, worker]) {
      if (child.exitCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        await exited;
      }
    }
  };

  try {
    await waitForHealth(baseUrl, server);
  } catch (error) {
    await stop();
    throw error;
  }

  project.provide('e2e', {
    baseUrl,
    webOrigin: WEB_ORIGIN,
    mailpitUrl,
    databaseUrl,
    logFiles: [resolve(LOG_DIR, 'server.log'), resolve(LOG_DIR, 'worker.log')],
  });
  return stop;
}
