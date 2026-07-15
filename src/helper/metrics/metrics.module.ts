import { Global, Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { ProviderMetricsService } from './provider-metrics.service';
import { FailedJobsService } from '../service/failed-jobs.service';
import { JobRunService } from '../service/job-run.service';

// Observability plumbing (§2.6), global so providers (WhatsApp) and the
// metrics endpoint resolve the same services in both the API and worker
// contexts without per-module wiring.
@Global()
@Module({
  imports: [RedisModule],
  providers: [ProviderMetricsService, FailedJobsService, JobRunService],
  exports: [ProviderMetricsService, FailedJobsService, JobRunService],
})
export class MetricsModule {}
