import { Redis } from 'ioredis';

/** BullMQ requires `maxRetriesPerRequest: null` on its connections. */
export const createQueueConnection = (redisUrl: string): Redis =>
  new Redis(redisUrl, { maxRetriesPerRequest: null });
