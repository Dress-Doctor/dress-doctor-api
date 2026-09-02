import Redis from 'ioredis';
import { TEST_REDIS_DB } from './redis-test-env';

/**
 * Wipe the database the e2e suites own. Refuses to touch db 0 so a mistyped
 * TEST_REDIS_DB can never flush dev or stage keys; a Redis that isn't running
 * is not an error (suites that need it fail on their own).
 */
export const flushTestRedis = async (): Promise<void> => {
  if (TEST_REDIS_DB === 0) {
    throw new Error('refusing to flush Redis db 0 — that is not the test db');
  }
  const redis = new Redis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    db: TEST_REDIS_DB,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
    await redis.flushdb();
  } catch {
    // No Redis reachable — nothing to clean.
  } finally {
    redis.disconnect();
  }
};
