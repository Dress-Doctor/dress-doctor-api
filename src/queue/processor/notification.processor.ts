import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { NotificationService } from 'src/helper/service/notification.service';
import { maskRecipients, variableKeys } from 'src/helper/pii';
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
  onFailed(job: Job<SendNotificationDto>, err: Error) {
    this.logger.error(this.stageLog('FAILED', job.data));
    this.logger.error(err.message, err.stack);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<SendNotificationDto>) {
    this.logger.log(this.stageLog('SEND', job.data));
  }
}
