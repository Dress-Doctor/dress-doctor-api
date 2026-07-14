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
  {
    // CS-facing inactivity alert (§2.4). Carries the full context so CS can
    // call the customer without opening anything. Ordered to match the approved
    // WhatsApp template's body parameters.
    channel: OTPChannelEnum.WHATSAPP,
    templateName: NotificationTemplateNameEnum.INACTIVE_CUSTOMER_ALERT,
    titleFr: 'Client inactif — relance',
    titleEn: 'Inactive customer — follow up',
    variables: [
      'customerName',
      'customerPhone',
      'lastOrderDate',
      'lastOrderItems',
      'lastOrderValue',
      'totalOrders',
    ],
  },
];
