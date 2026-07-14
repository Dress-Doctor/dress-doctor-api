import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  OrderPaymentStatusEnum,
  OrderStatusEnum,
} from 'src/schema/order/order.dto';
import { Order } from 'src/schema/order/order.schema';
import { Payment } from 'src/schema/payment/payment.schema';
import { PaymentReconcileService } from './payment-reconcile.service';
import { computePaymentStatus, computeFlagged } from './payment-status.util';

// Order rows keyed by id; the service loads each via findById(id).populate(...).
type OrderRow = {
  _id: Types.ObjectId;
  amountPaid: number;
  totalAmount: number;
  paymentStatus: OrderPaymentStatusEnum;
  flagged: boolean;
  orderStatusId: { orderStatusName: string };
};

// The exact shape the reconcile writes — typing the mock with it keeps the
// assertions on mock.calls type-safe.
type ReconcileUpdate = {
  $set: { paymentStatus: OrderPaymentStatusEnum; flagged: boolean };
};

describe('PaymentReconcileService', () => {
  let service: PaymentReconcileService;
  let orders: Map<string, OrderRow>;
  let updateOne: jest.Mock<
    Promise<{ modifiedCount: number }>,
    [{ _id: Types.ObjectId }, ReconcileUpdate]
  >;
  let distinct: jest.Mock;

  const buildOrder = (over: Partial<OrderRow> = {}): OrderRow => ({
    _id: new Types.ObjectId(),
    amountPaid: 500,
    totalAmount: 1000,
    paymentStatus: OrderPaymentStatusEnum.PARTIAL,
    flagged: true,
    orderStatusId: { orderStatusName: OrderStatusEnum.READY.toString() },
    ...over,
  });

  const seed = (rows: OrderRow[]) => {
    orders = new Map(rows.map((o) => [o._id.toString(), o]));
    distinct.mockResolvedValue(rows.map((o) => o._id));
  };

  beforeEach(async () => {
    updateOne = jest.fn<
      Promise<{ modifiedCount: number }>,
      [{ _id: Types.ObjectId }, ReconcileUpdate]
    >(() => Promise.resolve({ modifiedCount: 1 }));
    distinct = jest.fn();

    const orderModel = {
      findById: jest.fn((id: Types.ObjectId) => ({
        populate: jest
          .fn()
          .mockResolvedValue(orders.get(id.toString()) ?? null),
      })),
      updateOne,
    };
    const paymentModel = { distinct };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentReconcileService,
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: getModelToken(Payment.name), useValue: paymentModel },
      ],
    }).compile();

    service = module.get(PaymentReconcileService);
  });

  it('leaves an order that already agrees with the synchronous computation untouched', async () => {
    // amountPaid<total, READY => PARTIAL + flagged, which is what is stored.
    const order = buildOrder();
    // Guard: our fixture really is the sync answer (same util PaymentService uses).
    expect(order.paymentStatus).toBe(
      computePaymentStatus(order.amountPaid, order.totalAmount),
    );
    expect(order.flagged).toBe(
      computeFlagged(order.orderStatusId.orderStatusName, order.paymentStatus),
    );
    seed([order]);

    const counts = await service.run(new Date(0));

    expect(counts).toEqual({ scanned: 1, changed: 0 });
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('corrects an order whose stored flags drifted from the computation', async () => {
    // Fully paid + READY => PAID, not flagged. Stored values are stale/wrong.
    const order = buildOrder({
      amountPaid: 1000,
      totalAmount: 1000,
      paymentStatus: OrderPaymentStatusEnum.PARTIAL,
      flagged: true,
    });
    seed([order]);

    const counts = await service.run(new Date(0));

    expect(counts).toEqual({ scanned: 1, changed: 1 });
    expect(updateOne).toHaveBeenCalledWith(
      { _id: order._id },
      {
        $set: {
          paymentStatus: computePaymentStatus(
            order.amountPaid,
            order.totalAmount,
          ),
          flagged: computeFlagged(
            order.orderStatusId.orderStatusName,
            OrderPaymentStatusEnum.PAID,
          ),
        },
      },
    );
    // The correction is exactly the synchronous answer.
    expect(updateOne.mock.calls[0][1].$set).toEqual({
      paymentStatus: OrderPaymentStatusEnum.PAID,
      flagged: false,
    });
  });

  it('is idempotent: re-running after a correction changes nothing', async () => {
    const order = buildOrder({
      amountPaid: 1000,
      totalAmount: 1000,
      paymentStatus: OrderPaymentStatusEnum.PARTIAL,
      flagged: true,
    });
    seed([order]);

    await service.run(new Date(0));
    // Apply what the reconcile wrote, then run again over the same window.
    const applied = updateOne.mock.calls[0][1].$set;
    order.paymentStatus = applied.paymentStatus;
    order.flagged = applied.flagged;
    updateOne.mockClear();

    const counts = await service.run(new Date(0));

    expect(counts).toEqual({ scanned: 1, changed: 0 });
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('skips ids whose order no longer exists', async () => {
    const ghost = buildOrder();
    distinct.mockResolvedValue([ghost._id]);
    orders = new Map(); // not found

    const counts = await service.run(new Date(0));

    expect(counts).toEqual({ scanned: 0, changed: 0 });
    expect(updateOne).not.toHaveBeenCalled();
  });
});
