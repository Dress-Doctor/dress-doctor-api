import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Queues, ScheduledJobData } from '../queue.dto';
import { ScheduledJobRunner } from './scheduled-job.runner';

@Processor(Queues.inactivityScan)
export class InactivityScanProcessor extends WorkerHost {
  constructor(private readonly runner: ScheduledJobRunner) {
    super();
  }

  async process(job: Job<ScheduledJobData>): Promise<void> {
    await this.runner.process(job, () => {
      // TODO(§2.4): scan customers past the inactivity threshold with no active
      // cooldown, enqueue a CS WhatsApp alert per customer, write follow-ups.
      return Promise.resolve({});
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ScheduledJobData>, err: Error): Promise<void> {
    await this.runner.onFailed(job, err);
  }
}
