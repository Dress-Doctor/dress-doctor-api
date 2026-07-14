import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Queues, ScheduledJobData } from '../queue.dto';
import { ScheduledJobRunner } from './scheduled-job.runner';
import { InactivityScanService } from 'src/api/follow-up/inactivity-scan.service';

@Processor(Queues.inactivityScan)
export class InactivityScanProcessor extends WorkerHost {
  constructor(
    private readonly runner: ScheduledJobRunner,
    private readonly scan: InactivityScanService,
  ) {
    super();
  }

  async process(job: Job<ScheduledJobData>): Promise<void> {
    await this.runner.process(job, () => this.scan.run());
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ScheduledJobData>, err: Error): Promise<void> {
    await this.runner.onFailed(job, err);
  }
}
