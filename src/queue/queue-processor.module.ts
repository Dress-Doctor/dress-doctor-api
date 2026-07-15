import { Module } from '@nestjs/common';
import { QueueProducerModule } from './queue-producer.module';
import { NotificationProcessor } from './processor/notification.processor';
import { InactivityScanProcessor } from './processor/inactivity-scan.processor';
import { PaymentReconcileProcessor } from './processor/payment-reconcile.processor';
import { ScheduledJobRunner } from './processor/scheduled-job.runner';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { NotificationService } from 'src/helper/service/notification.service';
import { WhatsAppProvider } from 'src/helper/service/whatsapp.provider';
import { JobRunService } from 'src/helper/service/job-run.service';
import { FailedJobsService } from 'src/helper/service/failed-jobs.service';
import { RedisModule } from 'src/helper/redis/redis.module';
import { PaymentReconcileService } from 'src/api/payment/payment-reconcile.service';
import { InactivityScanService } from 'src/api/follow-up/inactivity-scan.service';
import { RewardAccrualService } from 'src/api/reward/reward-accrual.service';
import { RewardAccrualProcessor } from './processor/reward-accrual.processor';

@Module({
  imports: [QueueProducerModule, RedisModule],
  providers: [
    NotificationProcessor,
    InactivityScanProcessor,
    PaymentReconcileProcessor,
    RewardAccrualProcessor,
    RewardAccrualService,
    ScheduledJobRunner,
    AppUtilService,
    NotificationService,
    WhatsAppProvider,
    JobRunService,
    FailedJobsService,
    PaymentReconcileService,
    InactivityScanService,
  ],
})
export class QueueProcessorModule {}
