import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { QueueProducerModule } from '../queue/queue-producer.module';
import { RedisModule } from '../helper/redis/redis.module';
import { LeaderLockService } from '../helper/service/leader-lock.service';
import { JobRunService } from '../helper/service/job-run.service';
import { ScheduledJobsCron } from './scheduled-jobs.cron';

// Cron owner — imported by WorkerModule only, so triggers never run in the API
// process. Each cron acquires a Redis leader lock, writes a job-run, and
// enqueues via the producer; the work happens in the queue processors.
@Module({
  imports: [ScheduleModule.forRoot(), RedisModule, QueueProducerModule],
  providers: [LeaderLockService, JobRunService, ScheduledJobsCron],
})
export class SchedulerModule {}
