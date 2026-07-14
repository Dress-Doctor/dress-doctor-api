import { ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';
import { NotificationStatusEnum } from 'src/schema/notification/notification.dto';
import { WebhookService } from './webhook.service';

describe('WebhookService', () => {
  let service: WebhookService;
  let notificationModel: { updateOne: jest.Mock };
  const OLD = { ...process.env };

  beforeEach(() => {
    notificationModel = {
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    service = new WebhookService(notificationModel as never);
    process.env.WHATSAPP_APP_SECRET = 'app-secret';
  });

  afterEach(() => {
    process.env = { ...OLD };
  });

  const sign = (body: Buffer) =>
    'sha256=' +
    crypto.createHmac('sha256', 'app-secret').update(body).digest('hex');

  describe('verifySignature', () => {
    it('accepts a correct signature', () => {
      const body = Buffer.from(JSON.stringify({ a: 1 }));
      expect(() => service.verifySignature(body, sign(body))).not.toThrow();
    });

    it('rejects a tampered signature', () => {
      const body = Buffer.from('{"a":1}');
      expect(() =>
        service.verifySignature(body, sign(Buffer.from('{"a":2}'))),
      ).toThrow(ForbiddenException);
    });

    it('rejects when the secret is not configured', () => {
      delete process.env.WHATSAPP_APP_SECRET;
      const body = Buffer.from('{}');
      expect(() => service.verifySignature(body, 'sha256=x')).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('applyStatusUpdates', () => {
    const payload = (status: string, id = 'wamid.1') => ({
      entry: [{ changes: [{ value: { statuses: [{ id, status }] } }] }],
    });

    it('flips the log to DELIVERED by providerMessageId', async () => {
      await service.applyStatusUpdates(payload('delivered'));
      const [filter, update] = notificationModel.updateOne.mock
        .calls[0] as unknown as [
        { providerMessageId: string },
        { $set: { status: NotificationStatusEnum; deliveredAt?: Date } },
      ];
      expect(filter.providerMessageId).toBe('wamid.1');
      expect(update.$set.status).toBe(NotificationStatusEnum.DELIVERED);
      expect(update.$set.deliveredAt).toBeInstanceOf(Date);
    });

    it('maps read and failed statuses', async () => {
      await service.applyStatusUpdates(payload('read'));
      await service.applyStatusUpdates(payload('failed'));
      const calls = notificationModel.updateOne.mock.calls as unknown as Array<
        [unknown, { $set: { status: NotificationStatusEnum } }]
      >;
      expect(calls[0][1].$set.status).toBe(NotificationStatusEnum.READ);
      expect(calls[1][1].$set.status).toBe(NotificationStatusEnum.FAILED);
    });

    it('ignores non-terminal statuses (e.g. sent)', async () => {
      const updated = await service.applyStatusUpdates(payload('sent'));
      expect(updated).toBe(0);
      expect(notificationModel.updateOne).not.toHaveBeenCalled();
    });

    it('is idempotent — re-applying the same update is a no-op set', async () => {
      await service.applyStatusUpdates(payload('delivered'));
      await service.applyStatusUpdates(payload('delivered'));
      expect(notificationModel.updateOne).toHaveBeenCalledTimes(2);
      // Both target the same doc + same status — Mongo makes the repeat a no-op.
    });
  });
});
