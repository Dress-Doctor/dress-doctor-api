import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { bullPrefix, redisConnection } from './config/redis.config';
import { i18nModule } from './i18n/i18n.module';
import { SchemaModule } from './schema/schema.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { QueueProcessorModule } from './queue/queue-processor.module';
import { MetricsModule } from './helper/metrics/metrics.module';
import { ActivityRecorderModule } from './helper/activity/activity.module';

// Background-only counterpart to AppModule: no controllers, guards, or
// HTTP middleware — queue processors + cron, same image, no user traffic.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    SchemaModule,
    SchedulerModule,
    MetricsModule,
    ActivityRecorderModule,
    QueueProcessorModule,
    i18nModule,
    BullModule.forRoot({
      connection: redisConnection(),
      prefix: bullPrefix(),
      defaultJobOptions: {
        attempts: 3,
        removeOnFail: true,
        removeOnComplete: {
          age: 3600, // keep for 1 hour
          count: 1000,
        },
        backoff: { type: 'exponential', delay: 2000 },
      },
    }),
  ],
})
export class WorkerModule {}
