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
];
