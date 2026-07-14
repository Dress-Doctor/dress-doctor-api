import { Address } from 'nodemailer/lib/mailer';
import { OTPChannelEnum } from '../otp/otp.dto';

export enum NotificationStatusEnum {
  SEND = 'SEND',
  FAILED = 'FAILED',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
}

export enum LanguageEum {
  EN = 'en',
  FR = 'fr',
}

export type SendEmailDto = {
  from?: Address;
  language: LanguageEum;
  recipients: Address[];
  otpChannel: OTPChannelEnum;
  variables?: Record<string, string>;
  templateName: NotificationTemplateNameEnum;
  // Set on inactivity alerts — links the delivery-log row back to the
  // follow-up so "who was contacted, when, did they respond" is one join.
  followUpId?: string;
};

export type SendNotificationDto = {
  recipients: Address[] | string;
} & Omit<SendEmailDto, 'recipients'>;

export type GetHTMLDto = {
  templateName: string;
  language: LanguageEum;
  variables?: Record<string, string>;
};

export enum NotificationTemplateNameEnum {
  LOGIN_VERIFICATION_CODE = 'login_verification_code',
  INACTIVE_CUSTOMER_ALERT = 'inactive_customer_alert',
}
