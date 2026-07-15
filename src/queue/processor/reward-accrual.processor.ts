import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RewardAccrualService } from 'src/api/reward/reward-accrual.service';
import { Queues, RewardAccrualJobData } from '../queue.dto';

@Processor(Queues.rewardAccrual)
export class RewardAccrualProcessor extends WorkerHost {
  private readonly logger = new Logger(RewardAccrualProcessor.name);

  constructor(private readonly accrualService: RewardAccrualService) {
    super();
  }

  async process(job: Job<RewardAccrualJobData>): Promise<void> {
    this.logger.log(`PROCESSING reward-accrual for order ${job.data.orderId}`);
    const result = await this.accrualService.accrueForOrder(job.data.orderId);
    this.logger.log(
      `COMPLETED reward-accrual for order ${job.data.orderId}: ${
        result.credited ? `+${result.points} pts` : 'no credit (skip/duplicate)'
      }`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<RewardAccrualJobData>, err: Error) {
    this.logger.error(
      `FAILED reward-accrual for order ${job.data.orderId}: ${err.message}`,
      err.stack,
    );
  }
}
