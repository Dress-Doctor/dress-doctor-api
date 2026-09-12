import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { NotificationService } from 'src/helper/service/notification.service';
import { maskRecipients, variableKeys } from 'src/helper/pii';
import { SendNotificationDto } from 'src/schema/notification/notification.dto';
import { FailedJobsService } from 'src/helper/service/failed-jobs.service';
import { Queues } from '../queue.dto';

// concurrency 5: sends are IO-bound on SMTP, and the default of 1 serialised
// the whole queue behind whichever message was mid-handshake. Matches the
// transport's maxConnections so the pool is saturated but not oversubscribed.
@Processor(Queues.notification, { concurrency: 5 })
export class NotificationProcessor extends WorkerHost {
  private logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    private readonly notificationService: NotificationService,
    private readonly failedJobs: FailedJobsService,
  ) {
    super();
  }

  // Job payloads carry OTP codes and phone numbers in variables/recipients —
  // stage logs print variable keys and masked addresses only (§12).
  private stageLog(status: string, data: SendNotificationDto) {
    return this.appUtilService.getLogText({
      STATUS: status,
      LAN: data.language,
      CHANNEL: data.otpChannel,
      TEMPLATE_NAME: data.templateName,
      VARIABLE_KEYS: variableKeys(data.variables),
      RECIPIENTS: maskRecipients(data.recipients),
    });
  }

  async process(job: Job<SendNotificationDto>) {
    this.logger.log(this.stageLog('PROCESSING', job.data));
    await this.notificationService.send(job.data);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<SendNotificationDto>, err: Error) {
    const maxAttempts = job.opts.attempts ?? 1;
    const exhausted = job.attemptsMade >= maxAttempts;
    this.logger.error(this.stageLog(exhausted ? 'FAILED' : 'RETRY', job.data));
    this.logger.error(err.message, err.stack);
    if (!exhausted) return;

    // Out of retries: keep it visible in the failed set, since
    // defaultJobOptions.removeOnFail drops the job itself.
    await this.failedJobs.record({
      queue: job.queueName,
      jobId: job.id ?? 'unknown',
      jobName: job.name,
      error: err.message,
    });
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<SendNotificationDto>) {
    this.logger.log(this.stageLog('SEND', job.data));
  }
}
