import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
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
import { WhatsAppProvider } from './whatsapp.provider';
import { User } from 'src/schema/user/user.schema';
import { InjectQueue } from '@nestjs/bullmq';
import { QueueProcessor, Queues } from 'src/queue/queue.dto';
import { Queue } from 'bullmq';
import constant from '../constant';
import { OTPChannelEnum } from 'src/schema/otp/otp.dto';

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
  ) {}

  onModuleInit() {
    this.transport = nodemailer.createTransport({
      secure: false,
      host: process.env.SMTP_HOST,
      replyTo: process.env.MAIL_FROM,
      port: Number(process.env.SMTP_PORT),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
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

    try {
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

      const result: unknown = await this.transport.sendMail(options);
      for (const recipient of data.recipients) {
        const user = await this.userModel.findOne({ email: recipient.address });
        if (!user) {
          this.logger.error(`This user ${recipient.address} doesn't exist`);
          throw new Error(`This user ${recipient.address} doesn't exist`);
        }

        await this.notificationModel.create({
          userId: user._id,
          sentAt: new Date(),
          title: options.subject,
          language: data.language,
          channel: template.channel,
          variables: data.variables,
          body: JSON.stringify(options.html),
          status: NotificationStatusEnum.SEND,
          providerResponse: JSON.stringify(result),
        });
      }
    } catch (error) {
      this.logger.error(error);
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
    const log = this.appUtilService.getLogText({
      STATUS: 'SUBMITTED',
      QUEUE_NAME: Queues.notification,
      LAN: data.language,
      FROM: JSON.stringify(data.from),
      TEMPLATE_NAME: data.templateName,
      VARIABLES: JSON.stringify(data.variables),
      RECIPIENTS: JSON.stringify(data.recipients),
    });
    this.logger.log(log);
    await this.notificationsQueue.add(QueueProcessor.notification, data);
  }
}
