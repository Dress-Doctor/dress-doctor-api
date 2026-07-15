import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrderEvents, type OrderPaidEvent } from 'src/api/order/order.events';
import { RewardProducer } from 'src/queue/producer/reward.producer';

/**
 * order.paid → enqueue reward accrual (§2.1). Event-driven and queued — the
 * payment write path never runs reward maths inline. Failures are logged,
 * never surfaced into the emitting request; a missed enqueue is recovered by
 * re-emission (reconcile), which the jobId + ledger index keep idempotent.
 */
@Injectable()
export class RewardAccrualListener {
  private readonly logger = new Logger(RewardAccrualListener.name);

  constructor(private readonly rewardProducer: RewardProducer) {}

  @OnEvent(OrderEvents.paid)
  async onOrderPaid(event: OrderPaidEvent): Promise<void> {
    try {
      await this.rewardProducer.enqueueAccrual({
        orderId: event.orderId.toString(),
      });
    } catch (err) {
      this.logger.error(
        `failed to enqueue reward accrual for order ${event.orderId.toString()}: ${(err as Error).message}`,
      );
    }
  }
}
