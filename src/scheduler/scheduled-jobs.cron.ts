import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LeaderLockService } from 'src/helper/service/leader-lock.service';
import { JobRunService } from 'src/helper/service/job-run.service';
import { ScheduledJobProducer } from 'src/queue/producer/scheduled-job.producer';
import { Queues } from 'src/queue/queue.dto';

// Business timezone (Douala, WAT). Cron fires on the worker only (SchedulerModule
// is imported by WorkerModule, never AppModule). The leader lock makes exactly
// one worker dispatch per tick even when several workers run.
const TZ = 'Africa/Douala';

// Lock is held (not released) until its TTL expires, so a straggler worker whose
// tick lands slightly later still sees the key and skips. TTL < the cron interval
// so the next tick can re-acquire.
const RECONCILE_LOCK = 'cron:payment-reconcile';
const RECONCILE_TTL_MS = 5 * 60 * 1000; // 5 min < 15 min interval
const INACTIVITY_LOCK = 'cron:inactivity-scan';
const INACTIVITY_TTL_MS = 6 * 60 * 60 * 1000; // 6 h < 24 h interval

@Injectable()
export class ScheduledJobsCron {
  private readonly logger = new Logger(ScheduledJobsCron.name);

  constructor(
    private readonly leaderLock: LeaderLockService,
    private readonly jobRun: JobRunService,
    private readonly producer: ScheduledJobProducer,
  ) {}

  // Backstop reconcile of computed flags — every 15 minutes.
  @Cron('*/15 * * * *', { timeZone: TZ })
  async paymentReconcile(): Promise<void> {
    if (!(await this.leaderLock.acquire(RECONCILE_LOCK, RECONCILE_TTL_MS))) {
      return; // another worker won this tick
    }
    const since = await this.jobRun.lastCompletedFinishedAt(
      Queues.paymentReconcile,
    );
    const run = await this.jobRun.createSubmitted({
      queue: Queues.paymentReconcile,
      jobName: 'payment-reconcile',
      leaderId: this.leaderLock.id,
    });
    await this.producer.enqueuePaymentReconcile({
      jobRunId: run.jobId,
      since: since?.toISOString(),
    });
    this.logger.log(`Dispatched payment-reconcile run ${run.jobId}`);
  }

  // Nightly customer-inactivity scan — 07:00 WAT.
  @Cron('0 7 * * *', { timeZone: TZ })
  async inactivityScan(): Promise<void> {
    if (!(await this.leaderLock.acquire(INACTIVITY_LOCK, INACTIVITY_TTL_MS))) {
      return; // another worker won this tick
    }
    const run = await this.jobRun.createSubmitted({
      queue: Queues.inactivityScan,
      jobName: 'inactivity-scan',
      leaderId: this.leaderLock.id,
    });
    await this.producer.enqueueInactivityScan({ jobRunId: run.jobId });
    this.logger.log(`Dispatched inactivity-scan run ${run.jobId}`);
  }
}
