import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { Queues } from './queue.dto';

@Module({
  imports: [BullModule.registerQueue({ name: Queues.notification })],
  exports: [BullModule.registerQueue({ name: Queues.notification })],
})
export class QueueProducerModule {}
