import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Queues, QueueProcessor, ScheduledJobData } from '../queue.dto';

/**
 * Thin typed enqueue wrapper for the scheduled queues — the only surface cron
 * (or a service) calls to dispatch work. No logic here: it sets the BullMQ
 * jobId to the JobRun id so the run row and the job share one identity, and
 * inherits the global retry/backoff from the worker's defaultJobOptions.
 */
@Injectable()
export class ScheduledJobProducer {
  constructor(
    @InjectQueue(Queues.inactivityScan)
    private readonly inactivityQueue: Queue,
    @InjectQueue(Queues.paymentReconcile)
    private readonly reconcileQueue: Queue,
  ) {}

  async enqueueInactivityScan(data: ScheduledJobData): Promise<void> {
    await this.inactivityQueue.add(QueueProcessor.inactivityScan, data, {
      jobId: data.jobRunId,
    });
  }

  async enqueuePaymentReconcile(data: ScheduledJobData): Promise<void> {
    await this.reconcileQueue.add(QueueProcessor.paymentReconcile, data, {
      jobId: data.jobRunId,
    });
  }
}
