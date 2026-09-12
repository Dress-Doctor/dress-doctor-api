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
      { t: () => ({}) } as never, // i18n
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

      // BullMQ forbids ':' in custom ids — flattened, same uniqueness.
      expect(queue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ dedupKey: 'order-status:o1:READY' }),
        expect.objectContaining({ jobId: 'order-status-o1-READY' }),
      );
    });

    it('enqueues without a jobId when there is no dedupKey', async () => {
      await service.addToQueue(data);

      const [, , opts] = queue.add.mock.calls[0] as [
        string,
        unknown,
        Record<string, unknown>,
      ];
      expect(opts).not.toHaveProperty('jobId');
    });

    // A 421 "try again later" needs re-trying further apart than the
    // queue-wide default, and for longer than three attempts.
    it('enqueues with the throttle-tolerant retry budget', async () => {
      await service.addToQueue(data);

      expect(queue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        expect.objectContaining({
          attempts: 5,
          backoff: { type: 'exponential', delay: 10_000 },
        }),
      );
    });
  });
});

describe('NotificationService (email dispatch)', () => {
  let service: NotificationService;
  let notificationModel: { create: jest.Mock; exists: jest.Mock };
  let templateModel: { findOne: jest.Mock };
  let userModel: { findOne: jest.Mock };
  let sendMail: jest.Mock;

  const emailTemplate = {
    channel: OTPChannelEnum.EMAIL,
    templateName: NotificationTemplateNameEnum.LOGIN_VERIFICATION_CODE,
    variables: ['code'],
    titleEn: 'Your code',
    titleFr: 'Votre code',
  };

  const emailData: SendNotificationDto = {
    templateName: NotificationTemplateNameEnum.LOGIN_VERIFICATION_CODE,
    otpChannel: OTPChannelEnum.EMAIL,
    language: LanguageEum.FR,
    variables: { code: '123456' },
    recipients: [{ name: 'Ada', address: 'ada@example.com' }],
  };

  beforeEach(() => {
    notificationModel = {
      create: jest.fn().mockResolvedValue({}),
      exists: jest.fn().mockResolvedValue(null),
    };
    templateModel = { findOne: jest.fn().mockResolvedValue(emailTemplate) };
    userModel = {
      findOne: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };
    sendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-1' });

    service = new NotificationService(
      notificationModel as never,
      templateModel as never,
      { t: () => ({}) } as never, // i18n
      {
        renderTemplate: (t: string) => t,
        getLogText: () => '',
      } as never, // appUtilService
      userModel as never,
      { send: jest.fn() } as never, // whatsappProvider
      { add: jest.fn() } as never, // queue
    );
    // Stand in for the pooled SMTP transport onModuleInit would build.
    Object.assign(service, { transport: { sendMail } });
  });

  it('sends the mail and writes the delivery log', async () => {
    await service.send(emailData);

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(notificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: OTPChannelEnum.EMAIL,
        status: NotificationStatusEnum.SEND,
      }),
    );
  });

  // The whole point of dropping the old catch: a dead SMTP host has to reach
  // the processor so BullMQ retries and /metrics counts the failure, instead
  // of the job completing with the mail never sent.
  it('lets an SMTP failure escape so the job retries', async () => {
    sendMail.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.send(emailData)).rejects.toThrow('ECONNREFUSED');
    expect(notificationModel.create).not.toHaveBeenCalled();
  });

  it('skips a send whose dedupKey is already in the delivery log', async () => {
    notificationModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

    await service.send({ ...emailData, dedupKey: 'payment-receipt:p1' });

    expect(sendMail).not.toHaveBeenCalled();
    expect(notificationModel.create).not.toHaveBeenCalled();
  });

  // The mail has already gone out by then; throwing would retry it forever.
  it('does not fail the job when a recipient has no user row', async () => {
    userModel.findOne.mockResolvedValue(null);

    await expect(service.send(emailData)).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(notificationModel.create).not.toHaveBeenCalled();
  });

  it('carries the dedupKey on the first recipient row only', async () => {
    await service.send({
      ...emailData,
      recipients: [
        { name: 'Ada', address: 'ada@example.com' },
        { name: 'Bo', address: 'bo@example.com' },
      ],
      dedupKey: 'order-status:o1:READY',
    });

    expect(notificationModel.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ dedupKey: 'order-status:o1:READY' }),
    );
    expect(notificationModel.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ dedupKey: undefined }),
    );
  });
});
