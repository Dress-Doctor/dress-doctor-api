import { Logger } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { Customer } from 'src/schema/user/customer.schema';
import { User } from 'src/schema/user/user.schema';
import { Order } from 'src/schema/order/order.schema';
import { OrderItem } from 'src/schema/order/order-item.schema';
import { FollowUp } from 'src/schema/follow-up/follow-up.schema';
import { Setting } from 'src/schema/settings/settings.schema';
import { NotificationService } from 'src/helper/service/notification.service';
import { SendNotificationDto } from 'src/schema/notification/notification.dto';
import { InactivityScanService } from './inactivity-scan.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const CS_PHONE = '237690000001';
const CUSTOMER_PHONE = '237698765294';

// In-memory follow-up store honouring the two queries the scan uses (create +
// distinct-with-filter), so the cooldown trio is tested behaviorally: alert →
// blocked → resolve → alert again.
class FakeFollowUpModel {
  rows: {
    _id: Types.ObjectId;
    customerId: Types.ObjectId;
    triggeredAt: Date;
    lastOrderAt?: Date;
    cooldownUntil: Date;
    resolvedAt: Date | null;
  }[] = [];

  create = jest.fn(
    (doc: Omit<(typeof this.rows)[number], '_id' | 'resolvedAt'>) => {
      const row = { _id: new Types.ObjectId(), resolvedAt: null, ...doc };
      this.rows.push(row);
      return Promise.resolve(row);
    },
  );

  distinct = jest.fn(
    (
      _field: string,
      filter: {
        customerId: { $in: Types.ObjectId[] };
        resolvedAt: null;
        cooldownUntil: { $gt: Date };
      },
    ) => {
      const ids = filter.customerId.$in.map((id) => id.toString());
      return Promise.resolve(
        this.rows
          .filter(
            (r) =>
              ids.includes(r.customerId.toString()) &&
              r.resolvedAt === null &&
              r.cooldownUntil > filter.cooldownUntil.$gt,
          )
          .map((r) => r.customerId),
      );
    },
  );
}

describe('InactivityScanService', () => {
  let service: InactivityScanService;
  let followUpModel: FakeFollowUpModel;
  let addToQueue: jest.Mock<Promise<void>, [SendNotificationDto]>;
  let customers: Record<string, unknown>[];

  const customerId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const orderId = new Types.ObjectId();
  const lastOrderAt = new Date(Date.now() - 20 * DAY_MS); // 20 days inactive

  const buildCustomer = () => ({
    _id: customerId,
    userId,
    lastOrderAt,
    totalOrders: 7,
  });

  beforeEach(() => {
    process.env.CS_WHATSAPP_PHONE = CS_PHONE;
    customers = [buildCustomer()];
    followUpModel = new FakeFollowUpModel();
    addToQueue = jest.fn<Promise<void>, [SendNotificationDto]>(() =>
      Promise.resolve(),
    );

    const customerModel = {
      find: jest.fn(() => ({ lean: () => Promise.resolve(customers) })),
    };
    const userModel = {
      findById: jest.fn(() => ({
        lean: () =>
          Promise.resolve({
            _id: userId,
            firstName: 'Marie',
            lastName: 'Ngo',
            phone: CUSTOMER_PHONE,
            whatsappPhone: CUSTOMER_PHONE,
          }),
      })),
    };
    const orderModel = {
      findOne: jest.fn(() => ({
        sort: () => ({
          lean: () =>
            Promise.resolve({
              _id: orderId,
              totalAmount: 5500,
              createdAt: lastOrderAt,
            }),
        }),
      })),
    };
    const orderItemModel = {
      find: jest.fn(() => ({
        populate: () => ({
          lean: () =>
            Promise.resolve([
              { quantity: 2, itemId: { itemName: 'Chemise' } },
              { quantity: 1, itemId: { itemName: 'Pantalon' } },
            ]),
        }),
      })),
    };
    // No settings rows — defaults (14d threshold, 7d cooldown) apply.
    const settingModel = {
      findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })),
    };

    service = new InactivityScanService(
      customerModel as unknown as Model<Customer>,
      userModel as unknown as Model<User>,
      orderModel as unknown as Model<Order>,
      orderItemModel as unknown as Model<OrderItem>,
      followUpModel as unknown as Model<FollowUp>,
      settingModel as unknown as Model<Setting>,
      { addToQueue } as unknown as NotificationService,
    );
  });

  afterEach(() => {
    delete process.env.CS_WHATSAPP_PHONE;
    jest.restoreAllMocks();
  });

  it('alerts a 14+-day-inactive customer exactly once, with one follow-up row', async () => {
    const counts = await service.run();

    expect(counts).toEqual({
      scanned: 1,
      alerted: 1,
      skippedCooldown: 0,
      skippedNoDestination: 0,
    });
    expect(followUpModel.create).toHaveBeenCalledTimes(1);
    expect(addToQueue).toHaveBeenCalledTimes(1);

    const followUp = followUpModel.rows[0];
    expect(followUp.customerId).toEqual(customerId);
    expect(followUp.lastOrderAt).toEqual(lastOrderAt);
    // Default 7-day cooldown.
    expect(followUp.cooldownUntil.getTime()).toBeGreaterThan(
      Date.now() + 6 * DAY_MS,
    );
    expect(followUp.resolvedAt).toBeNull();
  });

  it('carries the full CS context in the alert payload, linked to the follow-up', async () => {
    await service.run();

    const payload = addToQueue.mock.calls[0][0];
    expect(payload.templateName).toBe('inactive_customer_alert');
    expect(payload.recipients).toEqual([
      { name: 'Customer Service', address: CS_PHONE },
    ]);
    expect(payload.followUpId).toBe(followUpModel.rows[0]._id.toString());
    expect(payload.variables).toEqual({
      customerName: 'Marie Ngo',
      customerPhone: CUSTOMER_PHONE, // CS needs the raw phone to call
      lastOrderDate: lastOrderAt.toISOString().slice(0, 10),
      lastOrderItems: '2× Chemise, 1× Pantalon',
      lastOrderValue: '5500 XAF',
      totalOrders: '7',
    });
  });

  it('writes the follow-up before enqueueing the alert (mid-run retry safety)', async () => {
    await service.run();

    const createOrder = followUpModel.create.mock.invocationCallOrder[0];
    const enqueueOrder = addToQueue.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(enqueueOrder);
  });

  it('produces no second alert within the cooldown (re-run and nightly)', async () => {
    await service.run();
    addToQueue.mockClear();
    followUpModel.create.mockClear();

    const counts = await service.run();

    expect(counts).toEqual({
      scanned: 1,
      alerted: 0,
      skippedCooldown: 1,
      skippedNoDestination: 0,
    });
    expect(addToQueue).not.toHaveBeenCalled();
    expect(followUpModel.create).not.toHaveBeenCalled();
  });

  it('alerts again once the follow-up is resolved', async () => {
    await service.run();
    // CS resolves the alert.
    followUpModel.rows[0].resolvedAt = new Date();
    addToQueue.mockClear();

    const counts = await service.run();

    expect(counts.alerted).toBe(1);
    expect(counts.skippedCooldown).toBe(0);
    expect(addToQueue).toHaveBeenCalledTimes(1);
  });

  it('skips (and counts) when no CS destination is configured — no cooldown row either', async () => {
    delete process.env.CS_WHATSAPP_PHONE;

    const counts = await service.run();

    expect(counts).toEqual({
      scanned: 1,
      alerted: 0,
      skippedCooldown: 0,
      skippedNoDestination: 1,
    });
    expect(followUpModel.create).not.toHaveBeenCalled();
    expect(addToQueue).not.toHaveBeenCalled();
  });

  it('never logs the raw customer phone (masked only)', async () => {
    const lines: string[] = [];
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((msg: unknown) => lines.push(String(msg)));
    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((msg: unknown) => lines.push(String(msg)));
    jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((msg: unknown) => lines.push(String(msg)));

    await service.run();

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain(CUSTOMER_PHONE);
    }
    // The masked form is what shows up.
    expect(lines.join('\n')).toContain('294');
  });
});
