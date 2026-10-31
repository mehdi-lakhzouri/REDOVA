import { describe, expect, it, jest } from '@jest/globals';
import type { PrismaClient } from '@redova/db';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { HealthController } from '../../../src/health/health.controller';

describe('health probes', () => {
  it.each([
    [true, true, 'ok', 'up', 'up', 200],
    [false, true, 'degraded', 'down', 'up', 503],
    [true, false, 'degraded', 'up', 'down', 503],
    [false, false, 'degraded', 'down', 'down', 503],
  ] as const)(
    'reports database=%s and Redis=%s',
    async (dbOk, redisOk, status, db, redis, code) => {
      const checkDb = jest.fn<() => Promise<unknown>>();
      const ping = jest.fn<() => Promise<string>>();
      if (dbOk) checkDb.mockResolvedValue(1);
      else checkDb.mockRejectedValue(new Error('private database error'));
      if (redisOk) ping.mockResolvedValue('PONG');
      else ping.mockRejectedValue(new Error('private Redis error'));
      const controller = new HealthController(
        { $queryRaw: checkDb } as unknown as PrismaClient,
        { ping } as unknown as Redis,
      );
      const setStatus = jest.fn();
      const result = await controller.health({ status: setStatus } as unknown as Response);
      expect(result).toEqual({ status, db, redis });
      expect(JSON.stringify(result)).not.toContain('private');
      expect(checkDb).toHaveBeenCalledTimes(1);
      expect(ping).toHaveBeenCalledTimes(1);
      if (code === 503) expect(setStatus).toHaveBeenCalledWith(503);
      else expect(setStatus).not.toHaveBeenCalled();
    },
  );
});
