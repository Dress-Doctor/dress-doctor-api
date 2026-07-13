import { BadRequestException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { Currency } from 'src/schema/catalog/currency.schema';
import {
  OrderPaymentStatusEnum,
  OrderStatusEnum,
} from 'src/schema/order/order.dto';
import { Order } from 'src/schema/order/order.schema';
import { PaymentMethod } from 'src/schema/payment/payment-method.schema';
import { PaymentType } from 'src/schema/payment/payment-type.schema';
import { PaymentTypeEnum } from 'src/schema/payment/payment.dto';
import { Payment } from 'src/schema/payment/payment.schema';
import { OrderEvents } from '../order/order.events';
import { PaymentEvents } from './payment.events';
import { PaymentService } from './payment.service';

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentModel: { findOne: jest.Mock; create: jest.Mock };
  let orderModel: { findById: jest.Mock; findOneAndUpdate: jest.Mock };
  let paymentTypeModel: { findById: jest.Mock };
  let paymentMethodModel: { findById: jest.Mock };
  let currencyModel: { findOne: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let headers: Record<string, string>;

  const validId = () => new Types.ObjectId().toString();

  const buildOrder = (over: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    orderCode: 'OR-1',
    customerId: new Types.ObjectId(),
    amountPaid: 0,
    totalAmount: 1000,
    orderStatusId: { orderStatusName: OrderStatusEnum.CONFIRMED },
    ...over,
  });

  const setOrder = (over: Record<string, unknown> = {}) =>
    orderModel.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(buildOrder(over)),
    });

  const dto = (over: Record<string, unknown> = {}) => ({
    paymentMethodId: validId(),
    paymentTypeId: validId(),
    amount: 500,
    ...over,
  });

  const lastOrderUpdate = () => {
    const calls = orderModel.findOneAndUpdate.mock.calls as unknown as Array<
      [
        unknown,
        {
          paymentStatus: OrderPaymentStatusEnum;
          flagged: boolean;
          amountPaid: number;
        },
      ]
    >;
    return calls[0][1];
  };

  beforeEach(async () => {
    headers = {};
    paymentModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]),
    };
    orderModel = {
      findById: jest.fn(),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
    };
    paymentTypeModel = {
      findById: jest
        .fn()
        .mockResolvedValue({ paymentTypeName: PaymentTypeEnum.PAYMENT }),
    };
    paymentMethodModel = {
      findById: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };
    currencyModel = {
      findOne: jest.fn().mockResolvedValue({ id: new Types.ObjectId() }),
    };
    eventEmitter = { emit: jest.fn() };

    const connection = {
      startSession: jest.fn().mockResolvedValue({
        withTransaction: async (fn: () => Promise<void>) => fn(),
        endSession: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: AppUtilService, useValue: { parseSortParam: () => ({}) } },
        {
          provide: REQUEST,
          useValue: {
            headers,
            data: { platform: 'WEB', officeId: new Types.ObjectId() },
            user: {
              phone: '600',
              userId: validId(),
              ability: { can: () => true },
            },
          },
        },
        { provide: getModelToken(Payment.name), useValue: paymentModel },
        { provide: getModelToken(Order.name), useValue: orderModel },
        {
          provide: getModelToken(PaymentType.name),
          useValue: paymentTypeModel,
        },
        {
          provide: getModelToken(PaymentMethod.name),
          useValue: paymentMethodModel,
        },
        { provide: getModelToken(Currency.name), useValue: currencyModel },
        { provide: getConnectionToken(), useValue: connection },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = await module.resolve<PaymentService>(PaymentService);
  });

  const pay = (over: Record<string, unknown> = {}) =>
    service.createPaymentForOrder({ orderId: validId() }, dto(over) as never);

  it('records a partial payment (PARTIAL, no order.paid)', async () => {
    setOrder({ amountPaid: 0, totalAmount: 1000 });

    await pay({ amount: 400 });

    expect(lastOrderUpdate().paymentStatus).toBe(
      OrderPaymentStatusEnum.PARTIAL,
    );
    expect(lastOrderUpdate().amountPaid).toBe(400);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      PaymentEvents.recorded,
      expect.any(Object),
    );
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      OrderEvents.paid,
      expect.anything(),
    );
  });

  it('settles the order (PAID) and emits order.paid', async () => {
    setOrder({ amountPaid: 600, totalAmount: 1000 });

    await pay({ amount: 400 });

    expect(lastOrderUpdate().paymentStatus).toBe(OrderPaymentStatusEnum.PAID);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      OrderEvents.paid,
      expect.any(Object),
    );
  });

  it('flags an overpayment as OVERPAID', async () => {
    setOrder({ amountPaid: 900, totalAmount: 1000 });

    await pay({ amount: 500 });

    expect(lastOrderUpdate().paymentStatus).toBe(
      OrderPaymentStatusEnum.OVERPAID,
    );
    expect(lastOrderUpdate().flagged).toBe(true);
  });

  it('flags a READY order that is not fully paid', async () => {
    setOrder({
      amountPaid: 0,
      totalAmount: 1000,
      orderStatusId: { orderStatusName: OrderStatusEnum.READY },
    });

    await pay({ amount: 400 });

    expect(lastOrderUpdate().flagged).toBe(true);
  });

  it('is idempotent: a replayed idempotency key does not double-count', async () => {
    headers['x-idempotency-key'] = 'key-1';
    setOrder();
    paymentModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });

    const res = await pay({ amount: 400 });

    expect(res).toBe('Payment already recorded');
    expect(paymentModel.create).not.toHaveBeenCalled();
    expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a payment on a DRAFT order', async () => {
    setOrder({ orderStatusId: { orderStatusName: OrderStatusEnum.DRAFT } });

    await expect(pay({ amount: 400 })).rejects.toThrow(BadRequestException);
  });

  it('rejects a refund on an order with no prior payments', async () => {
    setOrder({ amountPaid: 0 });
    paymentTypeModel.findById.mockResolvedValue({
      paymentTypeName: PaymentTypeEnum.REFUND,
    });

    await expect(pay({ amount: 400 })).rejects.toThrow(BadRequestException);
  });
});
