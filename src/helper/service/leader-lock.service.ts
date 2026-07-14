import { Inject, Injectable, Logger } from '@nestjs/common';
import { hostname } from 'os';
import { randomUUID } from 'crypto';
import { REDIS_CLIENT } from '../redis/redis.module';

// Minimal slice of ioredis the lock depends on — keeps the service testable
// without a live Redis and without pulling the whole client type into tests.
export interface LeaderLockRedis {
  set(
    key: string,
    value: string,
    mode: 'PX',
    ttlMs: number,
    condition: 'NX',
  ): Promise<'OK' | null>;
  eval(
    script: string,
    numKeys: number,
    ...args: (string | number)[]
  ): Promise<unknown>;
}

// Compare-and-delete: only the holder releases, so a lock that already expired
// and was re-acquired by another worker isn't deleted out from under it.
const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end`;

/**
 * Single-owner election via Redis `SET key token NX PX ttl`. Every worker fires
 * the same cron tick; the first to set the key wins and dispatches, the rest
 * see `null` and skip. TTL bounds a crashed holder so the next tick recovers.
 */
@Injectable()
export class LeaderLockService {
  private readonly logger = new Logger(LeaderLockService.name);
  // Unique per process so release only ever deletes a lock this instance holds.
  private readonly instanceId = `${hostname()}:${process.pid}:${randomUUID()}`;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: LeaderLockRedis) {}

  get id(): string {
    return this.instanceId;
  }

  /** Try to become leader for `key` for `ttlMs`. True = this instance won. */
  async acquire(key: string, ttlMs: number): Promise<boolean> {
    const res = await this.redis.set(key, this.instanceId, 'PX', ttlMs, 'NX');
    const won = res === 'OK';
    if (won) this.logger.debug(`Acquired leader lock ${key} as ${this.id}`);
    return won;
  }

  /** Release only if still held by this instance. Safe to call unconditionally. */
  async release(key: string): Promise<void> {
    try {
      await this.redis.eval(RELEASE_SCRIPT, 1, key, this.instanceId);
    } catch (err) {
      // A failed release is non-fatal: the TTL will expire the lock anyway.
      this.logger.warn(
        `Leader lock release failed for ${key}: ${(err as Error).message}`,
      );
    }
  }

  /** Run `fn` only if this instance wins the lock; always releases after. */
  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    if (!(await this.acquire(key, ttlMs))) return undefined;
    try {
      return await fn();
    } finally {
      await this.release(key);
    }
  }
}
