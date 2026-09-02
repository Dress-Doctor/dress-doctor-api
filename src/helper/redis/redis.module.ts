import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { infraKeyPrefix, redisConnection } from '../../config/redis.config';

// Shared raw ioredis client for infra that needs Redis directly (leader lock,
// queue failed-set). Distinct connection from BullMQ's own. Same host/port/db
// as the worker's Bull connection; a separate logical namespace via key
// prefixes — see src/config/redis.config.ts for the layout.
export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () =>
        new Redis({
          ...redisConnection(),
          maxRetriesPerRequest: null,
          keyPrefix: infraKeyPrefix(),
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
