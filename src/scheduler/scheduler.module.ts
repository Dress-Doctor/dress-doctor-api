import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

// Cron scaffolding only — no jobs registered yet. Future cron triggers
// enqueue work via the queue producers; they never do the work inline.
@Module({
  imports: [ScheduleModule.forRoot()],
})
export class SchedulerModule {}
