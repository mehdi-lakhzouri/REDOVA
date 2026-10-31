import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { Auth } from '@redova/auth';
import type { EmailJob } from '@redova/contracts';
import type { PrismaClient } from '@redova/db';
import { getTestDatabaseUrl, loadTestEnv, resetDatabase } from '@redova/db/testing';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { Redis } from 'ioredis';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { type Env, parseEnv } from '../../src/config/env';
import { PRISMA, REDIS } from '../../src/config/tokens';

export const WEB_ORIGIN = 'http://localhost:3000';

export interface TestApp {
  app: INestApplication;
  env: Env;
  prisma: PrismaClient;
  redis: Redis;
  auth: Auth;
  /** Emails enqueued by Better Auth callbacks (test double for the queue). */
  emails: EmailJob[];
  close: () => Promise<void>;
}

/** Test environment: isolated `<db>_test` database, Redis logical db 14, HIBP off unless overridden. */
export const buildTestEnv = (overrides: Partial<Record<keyof Env, string>> = {}): Env => {
  loadTestEnv();
  const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6380');
  redisUrl.pathname = '/14';
  return parseEnv({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: getTestDatabaseUrl(),
    REDIS_URL: redisUrl.toString(),
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ?? 'test-secret-test-secret-test-secret-0000',
    BETTER_AUTH_URL: 'http://localhost:3001',
    WEB_ORIGIN,
    HIBP_ENABLED: 'false',
    RATE_LIMIT_ENABLED: 'false',
    AVATAR_STORAGE: 'local',
    AVATAR_LOCAL_DIR: join(tmpdir(), 'redova-integration-avatars', String(process.pid)),
    ...overrides,
  });
};

export const createTestApp = async (
  options: {
    env?: Partial<Record<keyof Env, string>>;
    extra?: Pick<ModuleMetadata, 'imports' | 'controllers'>;
  } = {},
): Promise<TestApp> => {
  const env = buildTestEnv(options.env);
  const emails: EmailJob[] = [];
  const enqueueEmail = (job: EmailJob) => {
    emails.push(job);
    return Promise.resolve();
  };
  const app = await NestFactory.create(AppModule.forRoot(env, options.extra, { enqueueEmail }), {
    bodyParser: false,
    logger: false,
  });
  configureApp(app, env);
  await app.init();

  const prisma = app.get<PrismaClient>(PRISMA);
  const redis = app.get<Redis>(REDIS);
  await resetDatabase(prisma);
  await redis.flushdb();

  return {
    app,
    env,
    prisma,
    redis,
    auth: app.get(AuthService).instance as unknown as Auth,
    emails,
    close: () => app.close(),
  };
};
