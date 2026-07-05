import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { NotificationService } from 'src/helper/service/notification.service';
import { SendNotificationDto } from 'src/schema/notification/notification.dto';
import { Queues } from '../queue.dto';

@Processor(Queues.notification)
export class NotificationProcessor extends WorkerHost {
  private logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    private readonly notificationService: NotificationService,
  ) {
    super();
  }

  async process(job: Job<SendNotificationDto>) {
    const log = this.appUtilService.getLogText({
      STATUS: 'PROCESSING',
      JOB_NAME: job.name,
      LAN: job.data.language,
      CHANNEL: job.data.otpChannel,
      FROM: JSON.stringify(job.data.from),
      TEMPLATE_NAME: job.data.templateName,
      VARIABLES: JSON.stringify(job.data.variables),
      RECIPIENTS: JSON.stringify(job.data.recipients),
    });

    this.logger.log(log);
    await this.notificationService.send(job.data);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<SendNotificationDto>, err: Error) {
    const log = this.appUtilService.getLogText({
      STATUS: 'FAILED',
      JOB_NAME: job.name,
      LAN: job.data.language,
      CHANNEL: job.data.otpChannel,
      FROM: JSON.stringify(job.data.from),
      TEMPLATE_NAME: job.data.templateName,
      VARIABLES: JSON.stringify(job.data.variables),
      RECIPIENTS: JSON.stringify(job.data.recipients),
    });
    this.logger.error(log);
    this.logger.error(err.message, err.stack);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<SendNotificationDto>) {
    const log = this.appUtilService.getLogText({
      STATUS: 'SEND',
      JOB_NAME: job.name,
      LAN: job.data.language,
      CHANNEL: job.data.otpChannel,
      FROM: JSON.stringify(job.data.from),
      TEMPLATE_NAME: job.data.templateName,
      VARIABLES: JSON.stringify(job.data.variables),
      RECIPIENTS: JSON.stringify(job.data.recipients),
    });
    this.logger.log(log);
  }
}
