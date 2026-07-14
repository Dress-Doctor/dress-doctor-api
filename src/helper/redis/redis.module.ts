import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

// Shared raw ioredis client for infra that needs Redis directly (leader lock,
// queue failed-set). Distinct connection from BullMQ's own. Same host/port as
// the worker's Bull connection; a separate logical namespace via key prefixes.
export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () =>
        new Redis({
          host: process.env.REDIS_HOST,
          port: Number(process.env.REDIS_PORT),
          maxRetriesPerRequest: null,
          keyPrefix: `dress-doctor-${process.env.REDIS_NAME}:infra:`,
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
