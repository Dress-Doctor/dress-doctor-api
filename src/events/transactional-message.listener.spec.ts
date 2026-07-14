import { Model, Types } from 'mongoose';
import { OTPChannelEnum } from 'src/schema/otp/otp.dto';
import { Order } from 'src/schema/order/order.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { User } from 'src/schema/user/user.schema';
import { Notification } from 'src/schema/notification/notification.schema';
import { NotificationService } from 'src/helper/service/notification.service';
import { SendNotificationDto } from 'src/schema/notification/notification.dto';
import { OrderStatusEnum } from 'src/schema/order/order.dto';
import { TransactionalMessageListener } from './transactional-message.listener';

describe('TransactionalMessageListener', () => {
  let listener: TransactionalMessageListener;
  let addToQueue: jest.Mock<Promise<void>, [SendNotificationDto]>;
  let notificationExists: jest.Mock;
  let customerRow: Record<string, unknown> | null;
  let userRow: Record<string, unknown> | null;

  const orderId = new Types.ObjectId();
  const paymentId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const changedBy = new Types.ObjectId();

  const orderRow = {
    _id: orderId,
    customerId: userId,
    orderCode: 'OR-42',
    balanceDue: 1500,
  };

  const statusEvent = (to: OrderStatusEnum) => ({
    orderId,
    from: OrderStatusEnum.WASHING,
    to,
    changedBy,
  });

  const paymentEvent = (over: Partial<{ isRefund: boolean }> = {}) => ({
    paymentId,
    orderId,
    amount: 2000,
    isRefund: false,
    ...over,
  });

  beforeEach(() => {
    addToQueue = jest.fn<Promise<void>, [SendNotificationDto]>(() =>
      Promise.resolve(),
    );
    notificationExists = jest.fn().mockResolvedValue(null);
    customerRow = { userId, notificationsOptIn: true };
    userRow = {
      _id: userId,
      firstName: 'Marie',
      whatsappPhone: '237698765294',
      email: 'marie@example.com',
      preferredLanguage: 'fr',
    };

    const orderModel = {
      findById: jest.fn(() => ({ lean: () => Promise.resolve(orderRow) })),
    };
    const customerModel = {
      findOne: jest.fn(() => ({ lean: () => Promise.resolve(customerRow) })),
    };
    const userModel = {
      findById: jest.fn(() => ({ lean: () => Promise.resolve(userRow) })),
    };
    const notificationModel = { exists: notificationExists };

    listener = new TransactionalMessageListener(
      orderModel as unknown as Model<Order>,
      customerModel as unknown as Model<Customer>,
      userModel as unknown as Model<User>,
      notificationModel as unknown as Model<Notification>,
      { addToQueue } as unknown as NotificationService,
    );
  });

  describe('dedup key (the crux)', () => {
    it('keys order messages per (order, status) and passes it as dedupKey', async () => {
      await listener.onOrderStatusChanged(statusEvent(OrderStatusEnum.READY));

      const payload = addToQueue.mock.calls[0][0];
      expect(payload.dedupKey).toBe(`order-status:${orderId.toString()}:READY`);
      expect(payload.templateName).toBe('order_ready');
    });

    it('keys receipts per payment', async () => {
      await listener.onPaymentRecorded(paymentEvent());

      const payload = addToQueue.mock.calls[0][0];
      expect(payload.dedupKey).toBe(`payment-receipt:${paymentId.toString()}`);
      expect(payload.templateName).toBe('payment_receipt');
    });

    it('a duplicate event after the first send is a no-op (delivery-log check)', async () => {
      notificationExists.mockResolvedValue({ _id: new Types.ObjectId() });

      await listener.onOrderStatusChanged(statusEvent(OrderStatusEnum.READY));
      await listener.onPaymentRecorded(paymentEvent());

      expect(addToQueue).not.toHaveBeenCalled();
    });

    it('READY and DELIVERED are distinct keys — one message each', async () => {
      await listener.onOrderStatusChanged(statusEvent(OrderStatusEnum.READY));
      await listener.onOrderStatusChanged(
        statusEvent(OrderStatusEnum.DELIVERED),
      );

      expect(addToQueue).toHaveBeenCalledTimes(2);
      const keys = addToQueue.mock.calls.map((c) => c[0].dedupKey);
      expect(new Set(keys).size).toBe(2);
    });
  });

  describe('gating', () => {
    it('ignores non-READY/DELIVERED transitions', async () => {
      await listener.onOrderStatusChanged(statusEvent(OrderStatusEnum.WASHING));
      expect(addToQueue).not.toHaveBeenCalled();
    });

    it('respects the customer opt-out', async () => {
      customerRow = { userId, notificationsOptIn: false };

      await listener.onOrderStatusChanged(statusEvent(OrderStatusEnum.READY));
      await listener.onPaymentRecorded(paymentEvent());

      expect(addToQueue).not.toHaveBeenCalled();
    });

    it('skips refunds', async () => {
      await listener.onPaymentRecorded(paymentEvent({ isRefund: true }));
      expect(addToQueue).not.toHaveBeenCalled();
    });

    it('never throws into the emitting request when enqueue fails', async () => {
      addToQueue.mockRejectedValue(new Error('queue down'));

      await expect(
        listener.onOrderStatusChanged(statusEvent(OrderStatusEnum.READY)),
      ).resolves.toBeUndefined();
    });
  });

  describe('channel + content', () => {
    it('prefers WhatsApp, carries order context, honours preferred language', async () => {
      await listener.onOrderStatusChanged(statusEvent(OrderStatusEnum.READY));

      const payload = addToQueue.mock.calls[0][0];
      expect(payload.otpChannel).toBe(OTPChannelEnum.WHATSAPP);
      expect(payload.language).toBe('fr');
      expect(payload.recipients).toEqual([
        { name: 'Marie', address: '237698765294' },
      ]);
      expect(payload.variables).toMatchObject({
        firstName: 'Marie',
        orderCode: 'OR-42',
      });
    });

    it('falls back to email when there is no WhatsApp number', async () => {
      userRow = { ...userRow, whatsappPhone: undefined };

      await listener.onPaymentRecorded(paymentEvent());

      const payload = addToQueue.mock.calls[0][0];
      expect(payload.otpChannel).toBe(OTPChannelEnum.EMAIL);
      expect(payload.recipients).toEqual([
        { name: 'Marie', address: 'marie@example.com' },
      ]);
      expect(payload.variables).toMatchObject({
        amount: '2000 XAF',
        balance: '1500 XAF',
      });
    });

    it('skips silently when the customer has no channel at all', async () => {
      userRow = { ...userRow, whatsappPhone: undefined, email: undefined };

      await listener.onPaymentRecorded(paymentEvent());

      expect(addToQueue).not.toHaveBeenCalled();
    });
  });
});
