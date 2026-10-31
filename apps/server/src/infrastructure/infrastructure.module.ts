import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@redova/db';
import { Redis } from 'ioredis';
import type { Env } from '../config/env';
import { ENV, PRISMA, REDIS } from '../config/tokens';

/** Process-wide clients: configuration, PostgreSQL (Prisma) and Redis. */
@Global()
@Module({})
export class InfrastructureModule implements OnApplicationShutdown {
  private readonly logger = new Logger(InfrastructureModule.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  static forRoot(env: Env) {
    return {
      module: InfrastructureModule,
      providers: [
        { provide: ENV, useValue: env },
        { provide: PRISMA, useFactory: () => createPrismaClient(env.DATABASE_URL) },
        { provide: REDIS, useFactory: () => new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 }) },
      ],
      exports: [ENV, PRISMA, REDIS],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.prisma.$disconnect(), this.redis.quit()]);
    this.logger.log('Database and Redis connections closed');
  }
}
