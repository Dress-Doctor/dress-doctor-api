import { Module } from '@nestjs/common';
import { QueueProducerModule } from 'src/queue/queue-producer.module';
import { HealthController } from './health.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [QueueProducerModule],
  controllers: [HealthController],
  providers: [MetricsService],
})
export class HealthModule {}
