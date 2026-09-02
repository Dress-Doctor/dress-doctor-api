import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as fs from 'fs';
import * as handlebars from 'handlebars';
import { Model } from 'mongoose';
import { I18nService } from 'nestjs-i18n';
import * as nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import * as path from 'path';
import appConfig from 'src/config/app-config';
import { NotificationTemplate } from 'src/schema/notification/notification-template.schema';
import {
  GetHTMLDto,
  LanguageEum,
  NotificationStatusEnum,
  SendEmailDto,
  SendNotificationDto,
} from 'src/schema/notification/notification.dto';
import { Notification } from 'src/schema/notification/notification.schema';
import { AppUtilService } from './app-util.service';
import { maskRecipients, variableKeys } from '../pii';
import { WhatsAppProvider } from './whatsapp.provider';
import { User } from 'src/schema/user/user.schema';
import { InjectQueue } from '@nestjs/bullmq';
import { QueueProcessor, Queues } from 'src/queue/queue.dto';
import { Queue } from 'bullmq';
import constant from '../constant';
import { OTPChannelEnum } from 'src/schema/otp/otp.dto';
import { ProviderMetricsService } from '../metrics/provider-metrics.service';

export const SMTP_PROVIDER_NAME = 'smtp';

@Injectable()
export class NotificationService implements OnModuleInit {
  private i18nKey = 'notification.email';
  private transport: nodemailer.Transporter;
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,

    @InjectModel(NotificationTemplate.name)
    private readonly templateModel: Model<NotificationTemplate>,

    private readonly i18n: I18nService,
    private readonly appUtilService: AppUtilService,
    @InjectModel(User.name) private readonly userModel: Model<User>,

    private readonly whatsappProvider: WhatsAppProvider,

    @InjectQueue(Queues.notification) private notificationsQueue: Queue,

    // Optional so the unit specs can construct the service directly; the
    // global MetricsModule always provides it in the app.
    @Optional() private readonly providerMetrics?: ProviderMetricsService,
  ) {}

  onModuleInit() {
    this.transport = nodemailer.createTransport({
      secure: false,
      host: process.env.SMTP_HOST,
      replyTo: process.env.MAIL_FROM,
      port: Number(process.env.SMTP_PORT),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // Reuse connections: one TCP+TLS+AUTH handshake per pooled socket
      // instead of one per message. maxConnections caps the parallel sockets
      // so the processor's concurrency can't trip the provider's own limit.
      pool: true,
      maxConnections: 5,
      // Google's relay answers a throttled connection by simply not replying
      // (or by closing it mid-session), and nodemailer's defaults then wait
      // 2 min to connect / 10 min on the socket. That is the "email took
      // forever" symptom: one stalled attempt holding the job. Fail fast
      // instead and let BullMQ retry against a fresh connection.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      // Stay under the relay's per-connection and per-second limits rather
      // than being told to go away with a 421.
      maxMessages: 50,
      rateDelta: 1_000,
      rateLimit: 5,
    });
  }

  private async validate(data: SendNotificationDto) {
    const template = await this.getTemplate(data.templateName, data.otpChannel);
    const requiredVariables = template.variables ?? [];

    if (requiredVariables.length > 0) {
      if (!data.variables) {
        this.logger.error(
          `Variables are required for template "${data.templateName}"`,
        );
        throw new InternalServerErrorException(constant.SERVER_ERROR);
      }

      const missingVariables = requiredVariables.filter(
        (key) => !(key in data.variables!),
      );

      if (missingVariables.length > 0) {
        this.logger.error(
          `Missing required variables for template "${data.templateName}": ${missingVariables.join(', ')}`,
        );

        throw new InternalServerErrorException(constant.SERVER_ERROR);
      }
    }

    return template;
  }

  private async getTemplate(templateName: string, channel: OTPChannelEnum) {
    const template = await this.templateModel.findOne({
      channel,
      templateName,
    });
    if (!template) {
      const log = `Notification Template ${templateName} not found for ${channel}`;
      this.logger.log(log);
      throw new Error(log);
    }
    return template;
  }

  private getHTML(dto: GetHTMLDto) {
    const baseDir = appConfig.baseDir;
    const { templateName, variables = {}, language } = dto;

    const translations = this.i18n.t(`${this.i18nKey}.${templateName}`, {
      lang: language.toString(),
      args: variables,
    });

    const file = path.join(baseDir, 'static', 'emails', `${templateName}.hbs`);
    const templateFile = fs.readFileSync(file, 'utf8');
    const hbs = handlebars.compile(templateFile);

    // Ensure translations is an object before spreading
    const translationsObj =
      typeof translations === 'object' && translations !== null
        ? translations
        : {};

    return hbs({ ...translationsObj, ...variables });
  }

  private async sendEmail(data: SendEmailDto) {
    const template = await this.getTemplate(data.templateName, data.otpChannel);

    // Durable idempotency (§2.5). The BullMQ jobId stops a duplicate *enqueue*;
    // this stops a duplicate *send* — a job that threw after the mail left
    // (delivery-log write failed, provider timed out on the response) is
    // retried, and must not put a second copy in the customer's inbox.
    if (
      data.dedupKey &&
      (await this.notificationModel.exists({ dedupKey: data.dedupKey }))
    ) {
      this.logger.log(
        this.appUtilService.getLogText({
          STATUS: 'SKIPPED_DUPLICATE',
          TEMPLATE_NAME: data.templateName,
          RECIPIENTS: maskRecipients(data.recipients),
        }),
      );
      return;
    }

    const html = this.getHTML(data);
    // From
    const appName = appConfig.appName;
    const mailFrom = process.env.MAIL_FROM!;
    const from = data.from ?? { name: appName, address: mailFrom };

    // Subject
    const english = data.language === LanguageEum.EN;
    const title = english ? template.titleEn : template.titleFr;
    const subject = data.variables
      ? this.appUtilService.renderTemplate(title, data.variables)
      : title;

    const options: Mail.Options = {
      from,
      html,
      subject,
      to: data.recipients,
    };

    // Nothing is swallowed here on purpose: an SMTP failure has to reach the
    // processor so BullMQ retries it and /metrics counts it. Swallowing it
    // marked the job COMPLETED and the mail simply never arrived. The catch
    // only records the timing before re-throwing.
    const startedAt = Date.now();
    let result: unknown;
    try {
      result = await this.transport.sendMail(options);
    } catch (err) {
      await this.providerMetrics?.recordCall(
        SMTP_PROVIDER_NAME,
        Date.now() - startedAt,
        false,
      );
      throw err;
    }
    await this.providerMetrics?.recordCall(
      SMTP_PROVIDER_NAME,
      Date.now() - startedAt,
      true,
    );

    for (const [index, recipient] of data.recipients.entries()) {
      const user = await this.userModel.findOne({ email: recipient.address });
      if (!user) {
        // The mail has already left. A recipient with no user row is a data
        // problem, not a send failure — throwing here would retry the job and
        // send the message again, forever. Log it and skip the log row.
        this.logger.error(
          `No user for recipient ${maskRecipients([recipient])} — delivery log row skipped`,
        );
        continue;
      }

      await this.notificationModel.create({
        userId: user._id,
        sentAt: new Date(),
        title: options.subject,
        language: data.language,
        channel: template.channel,
        variables: data.variables,
        // dedupKey is unique-indexed, so it can only sit on one row: the
        // first recipient carries it and answers the exists-check above.
        dedupKey: index === 0 ? data.dedupKey : undefined,
        body: JSON.stringify(options.html),
        status: NotificationStatusEnum.SEND,
        providerResponse: JSON.stringify(result),
      });
    }
  }

  /**
   * Dispatch over WhatsApp Business Cloud API (approved template) and write the
   * delivery log with the provider message id — the key the status webhook later
   * matches on. Recipient address is the whatsappPhone.
   */
  private async sendWhatsApp(data: SendEmailDto) {
    const template = await this.getTemplate(
      data.templateName,
      OTPChannelEnum.WHATSAPP,
    );

    for (const recipient of data.recipients) {
      const to = recipient.address;
      const { providerMessageId, response } = await this.whatsappProvider.send({
        to,
        templateName: template.templateName,
        language: data.language,
        variables: data.variables ?? {},
      });

      const user = await this.userModel.findOne({ whatsappPhone: to });
      await this.notificationModel.create({
        userId: user?._id,
        sentAt: new Date(),
        followUpId: data.followUpId,
        dedupKey: data.dedupKey,
        providerMessageId,
        title: data.templateName,
        language: data.language,
        channel: OTPChannelEnum.WHATSAPP,
        variables: data.variables,
        body: JSON.stringify(data.variables),
        status: NotificationStatusEnum.SEND,
        providerResponse: JSON.stringify(response),
      });
    }
  }

  async send(data: SendNotificationDto) {
    const template = await this.validate(data);

    switch (template.channel) {
      case OTPChannelEnum.EMAIL:
        await this.sendEmail(data as SendEmailDto);
        break;

      case OTPChannelEnum.WHATSAPP:
        await this.sendWhatsApp(data as SendEmailDto);
        break;

      default:
        break;
    }
  }

  async addToQueue(data: SendNotificationDto) {
    await this.validate(data);
    // Variables/recipients carry OTP codes and phone numbers — log keys and
    // masked addresses only (§12: never log OTPs or PII).
    const log = this.appUtilService.getLogText({
      STATUS: 'SUBMITTED',
      QUEUE_NAME: Queues.notification,
      LAN: data.language,
      TEMPLATE_NAME: data.templateName,
      VARIABLE_KEYS: variableKeys(data.variables),
      RECIPIENTS: maskRecipients(data.recipients),
    });
    this.logger.log(log);
    // dedupKey as the BullMQ jobId: a duplicate event re-enqueueing the same
    // transactional message is dropped by BullMQ while the first job is still
    // queued/retained — the first idempotency layer (§2.5); the unique
    // delivery-log index is the durable second one. BullMQ forbids ':' in
    // custom job ids (its Redis key separator), so the id is the dedupKey
    // with ':' flattened — same uniqueness, valid id.
    // The queue-wide default (3 attempts, 2s base) is tuned for a bug, not for
    // a provider saying "try again later": a 421 needs to be re-tried further
    // apart and for longer. 5 attempts on a 10s exponential spans ~2.5 min,
    // inside the OTP validity window.
    await this.notificationsQueue.add(QueueProcessor.notification, data, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      ...(data.dedupKey ? { jobId: data.dedupKey.replace(/:/g, '-') } : {}),
    });
  }
}
