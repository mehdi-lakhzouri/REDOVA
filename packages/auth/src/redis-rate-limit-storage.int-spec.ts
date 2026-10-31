import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRedisRateLimitStorage, RATE_LIMIT_KEY_PREFIX } from './redis-rate-limit-storage';

describe('Redis rate-limit storage (IT-001-07)', () => {
  let redis: Redis;

  beforeAll(() => {
    config({ path: resolve(__dirname, '../../../.env'), quiet: true });
    const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6380');
    url.pathname = '/15'; // dedicated logical database for tests
    redis = new Redis(url.toString());
  });
  afterAll(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it('allows exactly `max` requests under a concurrent burst and reports retryAfter', async () => {
    const storage = createRedisRateLimitStorage(redis);
    const key = `burst-${Date.now()}`;
    const results = await Promise.all(
      Array.from({ length: 10 }, () => storage.consume(key, { window: 60, max: 5 })),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    const rejected = results.filter((r) => !r.allowed);
    expect(rejected).toHaveLength(5);
    for (const r of rejected) expect(r.retryAfter).toBeGreaterThan(0);
    const ttl = await redis.ttl(`${RATE_LIMIT_KEY_PREFIX}${key}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });
});
