import { Controller, Get, HttpCode, Inject, Res } from '@nestjs/common';
import type { PrismaClient } from '@redova/db';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { PRISMA, REDIS } from '../config/tokens';

type Probe = 'up' | 'down';

const probe = async (check: () => Promise<unknown>): Promise<Probe> => {
  try {
    await check();
    return 'up';
  } catch {
    return 'down';
  }
};

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  @AllowAnonymous()
  @HttpCode(200)
  async health(@Res({ passthrough: true }) res: Response) {
    const [db, redis] = await Promise.all([
      probe(() => this.prisma.$queryRaw`SELECT 1`),
      probe(() => this.redis.ping()),
    ]);
    const healthy = db === 'up' && redis === 'up';
    if (!healthy) res.status(503);
    return { status: healthy ? 'ok' : 'degraded', db, redis };
  }
}
