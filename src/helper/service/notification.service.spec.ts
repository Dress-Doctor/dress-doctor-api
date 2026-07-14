import { Types } from 'mongoose';
import { OTPChannelEnum } from 'src/schema/otp/otp.dto';
import {
  LanguageEum,
  NotificationStatusEnum,
  NotificationTemplateNameEnum,
  SendNotificationDto,
} from 'src/schema/notification/notification.dto';
import { NotificationService } from './notification.service';

describe('NotificationService (WhatsApp dispatch)', () => {
  let service: NotificationService;
  let notificationModel: { create: jest.Mock };
  let templateModel: { findOne: jest.Mock };
  let userModel: { findOne: jest.Mock };
  let whatsappProvider: { send: jest.Mock };

  const waTemplate = {
    channel: OTPChannelEnum.WHATSAPP,
    templateName: NotificationTemplateNameEnum.LOGIN_VERIFICATION_CODE,
    variables: ['code'],
    titleEn: 'x',
    titleFr: 'x',
  };

  const data: SendNotificationDto = {
    templateName: NotificationTemplateNameEnum.LOGIN_VERIFICATION_CODE,
    otpChannel: OTPChannelEnum.WHATSAPP,
    language: LanguageEum.FR,
    variables: { code: '123456' },
    recipients: [{ name: 'Ada', address: '237690000000' }],
  };

  let queue: { add: jest.Mock };

  beforeEach(() => {
    notificationModel = { create: jest.fn().mockResolvedValue({}) };
    templateModel = { findOne: jest.fn().mockResolvedValue(waTemplate) };
    userModel = {
      findOne: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };
    whatsappProvider = {
      send: jest
        .fn()
        .mockResolvedValue({ providerMessageId: 'wamid.1', response: {} }),
    };
    queue = { add: jest.fn().mockResolvedValue({}) };

    service = new NotificationService(
      notificationModel as never,
      templateModel as never,
      {} as never, // i18n
      {
        renderTemplate: (s: string) => s,
        getLogText: () => '',
      } as never, // appUtilService
      userModel as never,
      whatsappProvider as never,
      queue as never,
    );
  });

  it('dispatches over WhatsApp and writes the delivery log with the provider id', async () => {
    await service.send(data);

    expect(whatsappProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '237690000000',
        templateName: NotificationTemplateNameEnum.LOGIN_VERIFICATION_CODE,
        language: LanguageEum.FR,
      }),
    );
    expect(notificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: OTPChannelEnum.WHATSAPP,
        providerMessageId: 'wamid.1',
        status: NotificationStatusEnum.SEND,
      }),
    );
  });

  it('writes the dedupKey into the delivery log when present', async () => {
    await service.send({ ...data, dedupKey: 'payment-receipt:abc' });

    expect(notificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ dedupKey: 'payment-receipt:abc' }),
    );
  });

  describe('addToQueue', () => {
    it('uses the dedupKey as the BullMQ jobId (enqueue-level idempotency)', async () => {
      await service.addToQueue({ ...data, dedupKey: 'order-status:o1:READY' });

      expect(queue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ dedupKey: 'order-status:o1:READY' }),
        { jobId: 'order-status:o1:READY' },
      );
    });

    it('enqueues without a jobId when there is no dedupKey', async () => {
      await service.addToQueue(data);

      expect(queue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ templateName: data.templateName }),
        undefined,
      );
    });
  });
});
