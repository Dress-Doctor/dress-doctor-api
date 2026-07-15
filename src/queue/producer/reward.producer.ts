import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QueueProcessor, Queues, RewardAccrualJobData } from '../queue.dto';

/**
 * Thin typed enqueue wrapper for reward accrual — the only thing listeners
 * call (§2.1). The jobId is derived from the orderId so a re-emitted
 * order.paid while the first job is queued/retained is dropped by BullMQ;
 * the ledger's unique (orderId, EARN) index is the durable second layer.
 */
@Injectable()
export class RewardProducer {
  private readonly logger = new Logger(RewardProducer.name);

  constructor(
    @InjectQueue(Queues.rewardAccrual)
    private readonly rewardAccrualQueue: Queue,
  ) {}

  async enqueueAccrual(data: RewardAccrualJobData): Promise<void> {
    await this.rewardAccrualQueue.add(QueueProcessor.rewardAccrual, data, {
      jobId: `reward-accrual-${data.orderId}`,
    });
    this.logger.log(`SUBMITTED reward-accrual for order ${data.orderId}`);
  }
}
