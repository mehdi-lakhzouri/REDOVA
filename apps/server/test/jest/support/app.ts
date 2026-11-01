import { Redis } from 'ioredis';
import { createTestApp } from '../../support/test-app';

/** Dedicated PostgreSQL database and reserved Redis db 11, independent of the existing suites. */
export const createJestApp = async (options: { avatarDirectory?: string } = {}) => {
  const database = new URL(process.env.TEST_DATABASE_URL ?? 'postgresql://missing/missing');
  if (!database.pathname.endsWith('_jest_test')) {
    throw new Error('Jest integration tests require their dedicated *_jest_test database');
  }
  const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6380');
  redisUrl.pathname = '/11';
  const redis = new Redis(redisUrl.toString(), { maxRetriesPerRequest: 1 });
  try {
    // Refuse to reset a logical database containing unrelated data.
    if ((await redis.dbsize()) !== 0) throw new Error('Reserved Jest Redis db 11 must be empty');
  } finally {
    await redis.quit();
  }
  return createTestApp({
    env: {
      REDIS_URL: redisUrl.toString(),
      MEDIA_STORAGE: 'local',
      ...(options.avatarDirectory ? { MEDIA_LOCAL_DIR: options.avatarDirectory } : {}),
    },
  });
};
