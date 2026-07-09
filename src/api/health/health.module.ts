import { Module } from '@nestjs/common';
import { QueueProducerModule } from 'src/queue/queue-producer.module';
import { HealthController } from './health.controller';

@Module({
  imports: [QueueProducerModule],
  controllers: [HealthController],
})
export class HealthModule {}
