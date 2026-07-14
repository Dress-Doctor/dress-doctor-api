import { NotificationTemplateNameEnum } from 'src/schema/notification/notification.dto';
import { OTPChannelEnum } from 'src/schema/otp/otp.dto';

export default [
  {
    channel: OTPChannelEnum.EMAIL,
    templateName: NotificationTemplateNameEnum.LOGIN_VERIFICATION_CODE,
    titleFr: 'Code de vérification: {code}',
    titleEn: 'Login verification code: {code}',
    variables: [
      'code',
      'year',
      'minutes',
      'firstName',
      'supportEmail',
      'supportPhones',
    ],
  },
  {
    // WhatsApp uses an approved template of the same name; the body parameters
    // are the ordered `variables` values (the code first).
    channel: OTPChannelEnum.WHATSAPP,
    templateName: NotificationTemplateNameEnum.LOGIN_VERIFICATION_CODE,
    titleFr: 'Code de vérification',
    titleEn: 'Login verification code',
    variables: ['code', 'minutes', 'firstName'],
  },
];
