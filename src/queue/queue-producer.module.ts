import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { Queues } from './queue.dto';
import { ScheduledJobProducer } from './producer/scheduled-job.producer';
import { RewardProducer } from './producer/reward.producer';

const queues = BullModule.registerQueue(
  { name: Queues.notification },
  { name: Queues.inactivityScan },
  { name: Queues.paymentReconcile },
  { name: Queues.rewardAccrual },
);

@Module({
  imports: [queues],
  providers: [ScheduledJobProducer, RewardProducer],
  exports: [queues, ScheduledJobProducer, RewardProducer],
})
export class QueueProducerModule {}
