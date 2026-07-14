import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Queues, ScheduledJobData } from '../queue.dto';
import { ScheduledJobRunner } from './scheduled-job.runner';
import { PaymentReconcileService } from 'src/api/payment/payment-reconcile.service';

@Processor(Queues.paymentReconcile)
export class PaymentReconcileProcessor extends WorkerHost {
  constructor(
    private readonly runner: ScheduledJobRunner,
    private readonly reconcile: PaymentReconcileService,
  ) {
    super();
  }

  async process(job: Job<ScheduledJobData>): Promise<void> {
    await this.runner.process(job, (data) =>
      this.reconcile.run(data.since ? new Date(data.since) : undefined),
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ScheduledJobData>, err: Error): Promise<void> {
    await this.runner.onFailed(job, err);
  }
}
