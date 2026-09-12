/**
 * One place that decides where this process' Redis keys live.
 *
 * Every key sits under a single root, `dd-<REDIS_NAME>` — one hyphenated node,
 * so a browser (RedisInsight et al.) shows one folder per environment with the
 * queues directly inside it:
 *
 *   dd-stage:notification:*    — a queue, straight under the root
 *   dd-stage:infra:*           — the raw ioredis client (leader lock, failed-job sets)
 *
 * Stage and prod run on their own Redis instances, so the environment name is
 * not what keeps them apart — the instance is. The name stays in the key as a
 * tripwire (a box pointed at the wrong instance shows up as a foreign root)
 * and because the dev machine's Redis is shared with other projects.
 *
 * REDIS_DB is the wall that does matter locally: the e2e suites run against
 * their own logical database, so a test can never write next to dev data.
 */

export interface RedisConnectionOptions {
  host: string | undefined;
  port: number;
  db: number;
}

/** Logical database index for this process (0 unless REDIS_DB says otherwise). */
export const redisDb = (): number => Number(process.env.REDIS_DB ?? 0);

/** Connection shared by BullMQ and the raw client. */
export const redisConnection = (): RedisConnectionOptions => ({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  db: redisDb(),
});

/** Root namespace for this environment, e.g. `dd-stage`. */
export const redisNamespace = (): string => `dd-${process.env.REDIS_NAME}`;

/** BullMQ prefix — queue keys land under `dd-<name>:<queue>`. */
export const bullPrefix = (): string => redisNamespace();

/** Key prefix for the raw ioredis client (ioredis wants the trailing colon). */
export const infraKeyPrefix = (): string => `${redisNamespace()}:infra:`;
