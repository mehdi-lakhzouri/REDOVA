import type { Redis } from 'ioredis';

/** Shape required by Better Auth 1.7 `rateLimit.customStorage` (atomic consume, no get/set). */
export interface RateLimitStorage {
  consume: (
    key: string,
    rule: { window: number; max: number },
  ) => Promise<{ allowed: boolean; retryAfter: number | null }>;
}

// INCR + EXPIRE on first hit + TTL lookup in one atomic step, so concurrent requests cannot bypass the limit.
const CONSUME_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
if current > tonumber(ARGV[2]) then
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  end
  return {0, ttl}
end
return {1, -1}
`;

export const RATE_LIMIT_KEY_PREFIX = 'redova:rate-limit:';

export const createRedisRateLimitStorage = (redis: Redis): RateLimitStorage => ({
  async consume(key, { window, max }) {
    const [allowed, ttl] = (await redis.eval(CONSUME_SCRIPT, 1, `${RATE_LIMIT_KEY_PREFIX}${key}`, window, max)) as [
      number,
      number,
    ];
    return allowed === 1 ? { allowed: true, retryAfter: null } : { allowed: false, retryAfter: ttl };
  },
});
