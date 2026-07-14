import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { Queues } from './queue.dto';
import { ScheduledJobProducer } from './producer/scheduled-job.producer';

const queues = BullModule.registerQueue(
  { name: Queues.notification },
  { name: Queues.inactivityScan },
  { name: Queues.paymentReconcile },
);

@Module({
  imports: [queues],
  providers: [ScheduledJobProducer],
  exports: [queues, ScheduledJobProducer],
})
export class QueueProducerModule {}
