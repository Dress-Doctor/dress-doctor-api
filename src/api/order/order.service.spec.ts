import { AbilityBuilder } from '@casl/ability';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { HistoryLabelService } from 'src/helper/service/history-label.service';
import { Currency } from 'src/schema/catalog/currency.schema';
import { Item } from 'src/schema/catalog/item.schema';
import { OfficeUser } from 'src/schema/office/office-user.schema';
import { Office } from 'src/schema/office/office.schema';
import { OrderItem } from 'src/schema/order/order-item.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import {
  OrderPaymentStatusEnum,
  OrderStatusEnum,
  PricingModelEnum,
} from 'src/schema/order/order.dto';
import { Order } from 'src/schema/order/order.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { PromoCode } from 'src/schema/promo/promo-code.schema';
import { PromoCodeUsage } from 'src/schema/promo/promo-code-usage.schema';
import { Subscription } from 'src/schema/subscription/subscription.schema';
import { User } from 'src/schema/user/user.schema';
import { PricingService } from '../pricing/pricing.service';
import { AppAbility } from 'src/helper/casl/casl.dto';
import { OrderEvents } from './order.events';
import { OrderService } from './order.service';

// A real (unrestricted) ability so scopeFilter's rulesToQuery works and yields
// an empty (unrestricted) filter in these tests.
const manageAllAbility = () => {
  const { can, build } = new AbilityBuilder(AppAbility);
  can('manage', 'all');
  return build();
};

describe('OrderService', () => {
  let service: OrderService;
  let orderModel: {
    findById: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    updateOne: jest.Mock;
    countDocuments: jest.Mock;
    find: jest.Mock;
    aggregate: jest.Mock;
  };
  // Constructible, because createOrder builds rows with `new orderItemModel()`
  // and saves them (which is what keeps the history hook firing).
  let orderItemModel: jest.Mock & {
    countDocuments: jest.Mock;
    find: jest.Mock;
    updateOne: jest.Mock;
  };
  let savedOrderItems: Record<string, unknown>[];
  let itemModel: { find: jest.Mock };
  let userModel: { findById: jest.Mock; exists: jest.Mock };
  let currencyModel: { findById: jest.Mock };
  let orderStatusModel: { findOne: jest.Mock };
  let officeModel: { findOne: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let subscriptionModel: { updateOne: jest.Mock };
  let promoUsageModel: { create: jest.Mock };
  let promoCodeModel: { updateOne: jest.Mock };
  let pricingService: { priceOrder: jest.Mock };
  let historyLabelService: { labelChanges: jest.Mock };
  let connection: { startSession: jest.Mock };

  const orderWithStatus = (
    status: OrderStatusEnum,
    extra: Record<string, unknown> = {},
  ) => ({
    _id: new Types.ObjectId(),
    orderCode: 'OR-TEST',
    pickupRequestId: undefined,
    customerId: new Types.ObjectId(),
    quotaConsumed: 0,
    promoDiscount: 0,
    orderStatusId: { orderStatusName: status },
    ...extra,
  });

  // transition() fetches the order via findOne({ _id, ...scope }).populate(...).
  const setOrder = (
    status: OrderStatusEnum,
    extra: Record<string, unknown> = {},
  ) =>
    orderModel.findOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue(orderWithStatus(status, extra)),
    });

  beforeEach(async () => {
    orderModel = {
      findById: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockResolvedValue({}),
      countDocuments: jest.fn().mockResolvedValue(2),
      find: jest.fn(),
      aggregate: jest.fn(),
    };
    savedOrderItems = [];
    orderItemModel = Object.assign(
      jest.fn().mockImplementation((doc: Record<string, unknown>) => {
        const row = {
          ...doc,
          $locals: {} as Record<string, unknown>,
          save: jest.fn().mockImplementation(() => {
            savedOrderItems.push(row);
            return Promise.resolve(row);
          }),
        };
        return row;
      }),
      {
        countDocuments: jest.fn().mockResolvedValue(1),
        find: jest.fn().mockResolvedValue([]),
        updateOne: jest.fn().mockResolvedValue({}),
      },
    ) as unknown as typeof orderItemModel;
    // assertItemsExist reads .find().select(); every requested id resolves.
    itemModel = {
      find: jest
        .fn()
        .mockImplementation((filter: { _id: { $in: unknown[] } }) => ({
          select: () => Promise.resolve(filter._id.$in.map((_id) => ({ _id }))),
        })),
    };
    userModel = {
      findById: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      exists: jest.fn().mockResolvedValue(true),
    };
    currencyModel = {
      findById: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };
    orderStatusModel = {
      findOne: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };
    // Chainable: the service resolves an office code with .select().lean().
    officeModel = {
      findOne: jest.fn().mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(null) }),
      }),
    };
    eventEmitter = { emit: jest.fn() };
    subscriptionModel = {
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    promoUsageModel = { create: jest.fn().mockResolvedValue({}) };
    promoCodeModel = {
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    pricingService = { priceOrder: jest.fn() };
    historyLabelService = {
      labelChanges: jest
        .fn()
        .mockImplementation((_model: string, entries: unknown) =>
          Promise.resolve(entries),
        ),
    };

    // Runs the transaction body straight through, like payment.service.spec.
    connection = {
      startSession: jest.fn().mockResolvedValue({
        withTransaction: async (fn: () => Promise<void>) => fn(),
        endSession: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        {
          provide: CodeGeneratorService,
          useValue: {
            generateOrderReference: jest.fn().mockResolvedValue('OR-000123'),
          },
        },
        {
          provide: AppUtilService,
          useValue: {
            parseSortParam: jest.fn().mockReturnValue({ receivedAt: -1 }),
          },
        },
        { provide: PricingService, useValue: pricingService },
        { provide: HistoryLabelService, useValue: historyLabelService },
        {
          provide: REQUEST,
          useValue: {
            data: { platform: 'WEB' },
            user: {
              phone: '600',
              userId: new Types.ObjectId().toString(),
              ability: manageAllAbility(),
            },
          },
        },
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: getModelToken(Item.name), useValue: itemModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Currency.name), useValue: currencyModel },
        { provide: getModelToken(OrderItem.name), useValue: orderItemModel },
        {
          provide: getModelToken(OrderStatus.name),
          useValue: orderStatusModel,
        },
        { provide: getModelToken(Office.name), useValue: officeModel },
        { provide: getModelToken(OfficeUser.name), useValue: {} },
        { provide: getModelToken(PickupRequest.name), useValue: {} },
        { provide: getModelToken(PickupStatus.name), useValue: {} },
        {
          provide: getModelToken(Customer.name),
          // onOrderCreated bumps the customer's lastOrderAt rollup.
          useValue: { findOneAndUpdate: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: getModelToken(Subscription.name),
          useValue: subscriptionModel,
        },
        {
          provide: getModelToken(PromoCodeUsage.name),
          useValue: promoUsageModel,
        },
        { provide: getModelToken(PromoCode.name), useValue: promoCodeModel },
        { provide: getConnectionToken(), useValue: connection },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = await module.resolve<OrderService>(OrderService);
  });

  describe('createOrder with items', () => {
    const created = {
      _id: new Types.ObjectId(),
      orderCode: 'OR-000123',
      amountPaid: 0,
    };

    const dto = (over: Record<string, unknown> = {}) =>
      ({
        customerId: new Types.ObjectId().toString(),
        currencyId: new Types.ObjectId().toString(),
        pricingModel: PricingModelEnum.PER_PIECE,
        estimatedDeliveryDate: new Date(),
        ...over,
      }) as never;

    const line = (over: Record<string, unknown> = {}) => ({
      itemId: new Types.ObjectId().toString(),
      serviceTypeId: new Types.ObjectId().toString(),
      quantity: 2,
      ...over,
    });

    beforeEach(() => {
      // No existing draft for this customer.
      orderModel.findOne.mockResolvedValue(null);
      orderModel.findOneAndUpdate.mockResolvedValue(created);
      // reprice() re-reads the order it just wrote.
      orderModel.findById.mockResolvedValue({
        ...created,
        pricingModel: PricingModelEnum.PER_PIECE,
        customerId: new Types.ObjectId(),
      });
      pricingService.priceOrder.mockResolvedValue({
        lines: [],
        subtotal: 0,
        manualDiscount: 0,
        promoDiscount: 0,
        total: 0,
        currencyId: null,
        promoCodeId: null,
        subscriptionId: null,
        quotaConsumed: 0,
      });
    });

    it('books the order and one row per garment', async () => {
      await service.createOrder(dto({ items: [line(), line()] }));

      expect(orderModel.findOneAndUpdate).toHaveBeenCalled();
      expect(savedOrderItems).toHaveLength(2);
      expect(savedOrderItems[0]).toEqual(
        expect.objectContaining({
          orderId: created._id,
          quantity: 2,
          unitPrice: 0,
          lineTotal: 0,
        }),
      );
    });

    it('returns the new order id and code so the caller can address it', async () => {
      const res = await service.createOrder(dto());

      expect(res).toEqual({
        message: 'Order created successfully',
        data: { _id: created._id, orderCode: 'OR-000123' },
      });
    });

    it('creates an empty order when items are omitted, exactly as before', async () => {
      await service.createOrder(dto());

      expect(orderModel.findOneAndUpdate).toHaveBeenCalled();
      expect(savedOrderItems).toHaveLength(0);
    });

    it('never persists `items` onto the order document itself', async () => {
      await service.createOrder(dto({ items: [line()] }));

      const [, update] = orderModel.findOneAndUpdate.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(update).not.toHaveProperty('items');
    });

    it('rejects an unknown itemId and writes nothing', async () => {
      itemModel.find.mockReturnValue({ select: () => Promise.resolve([]) });

      await expect(
        service.createOrder(dto({ items: [line()] })),
      ).rejects.toThrow(BadRequestException);

      expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(savedOrderItems).toHaveLength(0);
    });

    it('keeps garments that differ in colour as separate rows', async () => {
      const itemId = new Types.ObjectId().toString();
      const serviceTypeId = new Types.ObjectId().toString();

      await service.createOrder(
        dto({
          items: [
            line({ itemId, serviceTypeId, colour: 'blue' }),
            line({ itemId, serviceTypeId, colour: 'white' }),
          ],
        }),
      );

      expect(savedOrderItems).toHaveLength(2);
      expect(savedOrderItems.map((row) => row.colour)).toEqual([
        'blue',
        'white',
      ]);
    });

    it('keeps garments that differ in condition as separate rows', async () => {
      const itemId = new Types.ObjectId().toString();
      const serviceTypeId = new Types.ObjectId().toString();

      await service.createOrder(
        dto({
          items: [
            line({ itemId, serviceTypeId, colour: 'blue' }),
            line({
              itemId,
              serviceTypeId,
              colour: 'blue',
              condition: 'Stained',
            }),
          ],
        }),
      );

      expect(savedOrderItems).toHaveLength(2);
    });

    it('counts an identical garment twice as one row of higher quantity', async () => {
      const itemId = new Types.ObjectId().toString();
      const serviceTypeId = new Types.ObjectId().toString();

      await service.createOrder(
        dto({
          items: [
            line({ itemId, serviceTypeId, colour: 'blue', quantity: 2 }),
            line({ itemId, serviceTypeId, colour: 'blue', quantity: 3 }),
          ],
        }),
      );

      expect(savedOrderItems).toHaveLength(1);
      expect(savedOrderItems[0].quantity).toBe(5);
    });

    it('treats colour as case- and whitespace-insensitive when merging', async () => {
      const itemId = new Types.ObjectId().toString();
      const serviceTypeId = new Types.ObjectId().toString();

      await service.createOrder(
        dto({
          items: [
            line({ itemId, serviceTypeId, colour: 'Navy Blue', quantity: 1 }),
            line({ itemId, serviceTypeId, colour: ' navy blue ', quantity: 1 }),
          ],
        }),
      );

      expect(savedOrderItems).toHaveLength(1);
      expect(savedOrderItems[0].quantity).toBe(2);
    });

    it('persists an agreed unit price on the line', async () => {
      await service.createOrder(dto({ items: [line({ unitPrice: 750.5 })] }));

      expect(savedOrderItems[0].unitPrice).toBe(750.5);
    });

    it('keeps the later agreed price when two identical lines disagree', async () => {
      const itemId = new Types.ObjectId().toString();
      const serviceTypeId = new Types.ObjectId().toString();

      await service.createOrder(
        dto({
          items: [
            line({ itemId, serviceTypeId, unitPrice: 500 }),
            line({ itemId, serviceTypeId, unitPrice: 900 }),
          ],
        }),
      );

      expect(savedOrderItems).toHaveLength(1);
      expect(savedOrderItems[0].unitPrice).toBe(900);
    });

    it('attributes every garment row to the creator for the audit trail', async () => {
      await service.createOrder(dto({ items: [line()] }));

      const locals = savedOrderItems[0].$locals as { changedBy?: unknown };
      expect(locals.changedBy).toBeInstanceOf(Types.ObjectId);
    });

    it('names the cause when the deployment cannot open a transaction', async () => {
      // What a standalone mongod says — a config problem, not a bad request.
      connection.startSession.mockResolvedValue({
        withTransaction: () => {
          throw new Error(
            'This MongoDB deployment does not support retryable writes. ' +
              'Please add retryWrites=false to your connection string.',
          );
        },
        endSession: jest.fn(),
      });

      await expect(service.createOrder(dto())).rejects.toMatchObject({
        response: { code: 'TRANSACTIONS_UNSUPPORTED' },
      });
    });

    it('lets a pricing failure abort the whole booking', async () => {
      // e.g. PRICE_NOT_FOUND for a PER_PIECE line — raised inside the
      // transaction, so the order it had just written rolls back with it.
      pricingService.priceOrder.mockRejectedValue(
        new BadRequestException('No price configured for one of the items'),
      );

      await expect(
        service.createOrder(dto({ items: [line()] })),
      ).rejects.toThrow(BadRequestException);

      // The order.created listeners must not have run for an order that failed.
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('status transitions', () => {
    it('confirms a DRAFT order with items and emits status_changed', async () => {
      setOrder(OrderStatusEnum.DRAFT);

      const msg = await service.confirmOrder('507f1f77bcf86cd799439011');

      expect(msg).toBe('Order confirmed successfully');
      expect(orderModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        OrderEvents.statusChanged,
        expect.objectContaining({
          from: OrderStatusEnum.DRAFT,
          to: OrderStatusEnum.CONFIRMED,
        }),
      );
    });

    it('rejects confirming an order with no items (ORDER_EMPTY)', async () => {
      setOrder(OrderStatusEnum.DRAFT);
      orderItemModel.countDocuments.mockResolvedValue(0);

      await expect(
        service.confirmOrder('507f1f77bcf86cd799439011'),
      ).rejects.toThrow(BadRequestException);
      expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects an illegal transition (DRAFT -> READY)', async () => {
      setOrder(OrderStatusEnum.DRAFT);

      await expect(
        service.readyOrder('507f1f77bcf86cd799439011'),
      ).rejects.toThrow(ConflictException);
      expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('rejects any transition out of a terminal state (DELIVERED)', async () => {
      setOrder(OrderStatusEnum.DELIVERED);

      await expect(
        service.cancelOrder('507f1f77bcf86cd799439011'),
      ).rejects.toThrow(ConflictException);
    });

    it('allows a legal cancel from CONFIRMED', async () => {
      setOrder(OrderStatusEnum.CONFIRMED);

      const msg = await service.cancelOrder('507f1f77bcf86cd799439011');
      expect(msg).toBe('Order cancelled successfully');
      // By-id fetch is a scoped findOne({ _id, ...scope }), not findById.
      expect(orderModel.findOne).toHaveBeenCalledTimes(1);
      const [findFilter] = orderModel.findOne.mock.calls[0] as [
        Record<string, unknown>,
      ];
      expect(findFilter).toHaveProperty('_id');
      expect(orderModel.findById).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        OrderEvents.statusChanged,
        expect.objectContaining({ to: OrderStatusEnum.CANCELLED }),
      );
    });

    it('advances RECEIVED -> WASHING', async () => {
      setOrder(OrderStatusEnum.RECEIVED);

      const msg = await service.washOrder('507f1f77bcf86cd799439011');
      expect(msg).toBe('Order is now being washed');
    });
  });

  describe('confirm finalize (one-time side effects)', () => {
    it('decrements subscription quota and records promo usage on confirm', async () => {
      const subscriptionId = new Types.ObjectId();
      const promoCodeId = new Types.ObjectId();
      setOrder(OrderStatusEnum.DRAFT, {
        subscriptionId,
        quotaConsumed: 5,
        promoCodeId,
        promoDiscount: 500,
      });

      await service.confirmOrder('507f1f77bcf86cd799439011');

      expect(subscriptionModel.updateOne).toHaveBeenCalledWith(
        { _id: subscriptionId },
        { $inc: { remainingQuota: -5 } },
      );
      expect(promoUsageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ promoCodeId, discountApplied: 500 }),
      );
      expect(promoCodeModel.updateOne).toHaveBeenCalledWith(
        { _id: promoCodeId },
        { $inc: { usedCount: 1 } },
      );
    });

    it('does not touch quota/usage on a non-confirm transition', async () => {
      setOrder(OrderStatusEnum.RECEIVED, {
        subscriptionId: new Types.ObjectId(),
        quotaConsumed: 5,
      });

      await service.washOrder('507f1f77bcf86cd799439011');

      expect(subscriptionModel.updateOne).not.toHaveBeenCalled();
      expect(promoUsageModel.create).not.toHaveBeenCalled();
    });
  });

  describe('reprice (pure snapshot via updateOrderDraft)', () => {
    const pricing = {
      pricingModel: 'PER_PIECE',
      lines: [],
      subtotal: 4000,
      manualDiscount: 1000,
      promoDiscount: 500,
      total: 2500,
      currencyId: new Types.ObjectId(),
      promoCodeId: null,
      subscriptionId: null,
      quotaConsumed: 0,
    };

    beforeEach(() => {
      // updateOrderDraft fetches a DRAFT order (findOne+populate), then reprice
      // re-fetches it (findById) and runs the engine.
      setOrder(OrderStatusEnum.DRAFT);
      orderModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(),
        pricingModel: 'PER_PIECE',
        customerId: new Types.ObjectId(),
        totalWeightKg: 0,
        manualDiscount: 1000,
        promoCode: 'SAVE',
        amountPaid: 0,
      });
      pricingService.priceOrder.mockResolvedValue(pricing);
    });

    it('snapshots the engine result onto the order', async () => {
      await service.updateOrderDraft('507f1f77bcf86cd799439011', {
        manualDiscount: 1000,
      });

      expect(pricingService.priceOrder).toHaveBeenCalled();
      const updateCalls = orderModel.findOneAndUpdate.mock
        .calls as unknown as Array<
        [
          unknown,
          {
            orderAmount: number;
            promoDiscount: number;
            totalAmount: number;
            discountAmount: number;
          },
        ]
      >;
      const update = updateCalls[updateCalls.length - 1][1];
      expect(update.orderAmount).toBe(4000);
      expect(update.promoDiscount).toBe(500);
      expect(update.totalAmount).toBe(2500);
      expect(update.discountAmount).toBe(1500); // manual + promo
    });

    it('has NO side effects — never decrements quota or writes promo usage', async () => {
      await service.updateOrderDraft('507f1f77bcf86cd799439011', {
        manualDiscount: 1000,
      });

      expect(subscriptionModel.updateOne).not.toHaveBeenCalled();
      expect(promoUsageModel.create).not.toHaveBeenCalled();
      expect(promoCodeModel.updateOne).not.toHaveBeenCalled();
    });

    it('feeds a stored agreed unit price back on every reprice', async () => {
      // Without this, adding a second garment would re-price the first from
      // the catalog and silently undo what the counter agreed.
      orderItemModel.find.mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          itemId: new Types.ObjectId(),
          serviceTypeId: new Types.ObjectId(),
          quantity: 2,
          unitPrice: 750.5,
        },
        {
          _id: new Types.ObjectId(),
          itemId: new Types.ObjectId(),
          serviceTypeId: new Types.ObjectId(),
          quantity: 1,
          // Never agreed — the engine still prices this one.
          unitPrice: 0,
        },
      ]);

      await service.updateOrderDraft('507f1f77bcf86cd799439011', {
        manualDiscount: 0,
      });

      const [payload] = pricingService.priceOrder.mock.calls.at(-1) as [
        { items: { unitPrice?: number }[] },
      ];
      expect(payload.items[0].unitPrice).toBe(750.5);
      expect(payload.items[1].unitPrice).toBeUndefined();
    });

    it('feeds a stored agreed price back to the engine on every reprice', async () => {
      orderModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(),
        pricingModel: 'PER_KG',
        customerId: new Types.ObjectId(),
        totalWeightKg: 20.5,
        manualOrderAmount: 5500.5,
        manualDiscount: 0,
        amountPaid: 0,
      });

      await service.updateOrderDraft('507f1f77bcf86cd799439011', {
        totalWeightKg: 20.5,
      });

      expect(pricingService.priceOrder).toHaveBeenCalledWith(
        expect.objectContaining({ orderAmount: 5500.5, totalWeightKg: 20.5 }),
      );
    });

    it('clears the agreed price when the draft sends 0', async () => {
      await service.updateOrderDraft('507f1f77bcf86cd799439011', {
        orderAmount: 0,
      });

      const [, update] = orderModel.updateOne.mock.calls.at(-1) as [
        unknown,
        { $unset?: Record<string, unknown> },
      ];
      expect(update.$unset).toEqual({ manualOrderAmount: 1 });
    });
  });

  describe('confirm is not repeatable', () => {
    it('rejects re-confirming an already CONFIRMED order (no double finalize)', async () => {
      setOrder(OrderStatusEnum.CONFIRMED, {
        subscriptionId: new Types.ObjectId(),
        quotaConsumed: 5,
      });

      await expect(
        service.confirmOrder('507f1f77bcf86cd799439011'),
      ).rejects.toThrow(ConflictException);
      // Guard blocks it before any finalize side effect.
      expect(subscriptionModel.updateOne).not.toHaveBeenCalled();
      expect(promoUsageModel.create).not.toHaveBeenCalled();
    });
  });

  describe('findFlagged', () => {
    it('lists flagged orders sorted by balance then age', async () => {
      const populate = jest.fn().mockResolvedValue([{ orderCode: 'OR-1' }]);
      const limit = jest.fn().mockReturnValue({ populate });
      const skip = jest.fn().mockReturnValue({ limit });
      const sort = jest.fn().mockReturnValue({ skip });
      orderModel.find.mockReturnValue({ sort });

      const res = await service.findFlagged({ page: 1, size: 20 } as never);

      expect(orderModel.find).toHaveBeenCalledWith({ flagged: true });
      expect(sort).toHaveBeenCalledWith({ balanceDue: -1, createdAt: 1 });
      expect(res.total).toBe(2);
      expect(res.data).toHaveLength(1);
    });
  });

  describe('findByCode', () => {
    // The pipeline stage a given collection is joined in, so a test can assert
    // the join exists without pinning every field of it.
    const lookupFor = (from: string) => {
      const [pipeline] = orderModel.aggregate.mock.calls[0] as [
        Record<string, { from?: string; pipeline?: unknown[] }>[],
      ];
      return pipeline.find((stage) => stage.$lookup?.from === from)?.$lookup;
    };

    it('returns the order addressed by its code', async () => {
      orderModel.aggregate.mockResolvedValueOnce([
        { orderCode: 'OR-000123', history: [] },
      ]);

      const res = await service.findByCode('OR-000123');

      expect(res.orderCode).toBe('OR-000123');
      const [pipeline] = orderModel.aggregate.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      expect(pipeline[0]).toEqual({ $match: { orderCode: 'OR-000123' } });
    });

    it('joins the customer, office, items, payments and history', async () => {
      orderModel.aggregate.mockResolvedValueOnce([{ orderCode: 'OR-1' }]);

      await service.findByCode('OR-1');

      for (const from of [
        'user',
        'office',
        'order_item',
        'payment',
        'order_history',
        'order_status',
        'currency',
        'pickup_request',
        'promo_code',
        'subscription',
      ]) {
        expect(lookupFor(from)).toBeDefined();
      }
    });

    it('returns what changed on each history entry, never the snapshot', async () => {
      orderModel.aggregate.mockResolvedValueOnce([{ orderCode: 'OR-1' }]);

      await service.findByCode('OR-1');

      const history = lookupFor('order_history');
      const projection = history?.pipeline?.find(
        (stage): stage is { $project: Record<string, unknown> } =>
          typeof stage === 'object' && stage !== null && '$project' in stage,
      )?.$project;

      expect(projection).toBeDefined();
      expect(projection).not.toHaveProperty('snapshot');
      expect(projection).toHaveProperty('changes');
      expect(projection).toHaveProperty('action');
      // Newest first, and capped so a heavily edited order can't return an
      // unbounded trail.
      expect(history?.pipeline).toContainEqual({ $sort: { createdAt: -1 } });
      expect(history?.pipeline).toContainEqual({ $limit: 100 });
    });

    it('never projects the payment idempotency key', async () => {
      orderModel.aggregate.mockResolvedValueOnce([{ orderCode: 'OR-1' }]);

      await service.findByCode('OR-1');

      expect(lookupFor('payment')?.pipeline).toContainEqual({
        $project: { idempotencyKey: 0 },
      });
    });

    it('hands the trail to the labeller so ids read as names', async () => {
      const history = [
        {
          action: 'UPDATE',
          changes: [
            {
              field: 'orderStatusId',
              from: new Types.ObjectId(),
              to: new Types.ObjectId(),
            },
          ],
        },
      ];
      orderModel.aggregate.mockResolvedValueOnce([
        { orderCode: 'OR-1', history },
      ]);

      await service.findByCode('OR-1');

      expect(historyLabelService.labelChanges).toHaveBeenCalledWith(
        Order.name,
        history,
      );
    });

    it('404s on an unknown or out-of-scope order code', async () => {
      orderModel.aggregate.mockResolvedValueOnce([]);

      await expect(service.findByCode('OR-NOPE')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('returns a paginated page of orders', async () => {
      orderModel.aggregate
        .mockResolvedValueOnce([{ total: 2 }]) // count
        .mockResolvedValueOnce([{ orderCode: 'OR-1' }, { orderCode: 'OR-2' }]);

      const res = await service.findAll({ page: 1, size: 20 } as never);

      expect(res.total).toBe(2);
      expect(res.data).toHaveLength(2);
      expect(res.nextPage).toBeNull();
      // Count + page only — the status breakdown moved to GET /orders/kpis, so
      // the list no longer pays for an aggregation nobody asked for.
      expect(orderModel.aggregate).toHaveBeenCalledTimes(2);
    });

    it('resolves the orderStatus name filter and applies keyword + dates', async () => {
      orderStatusModel.findOne.mockReturnValueOnce({
        select: () => ({
          lean: () => Promise.resolve({ _id: new Types.ObjectId() }),
        }),
      });
      orderModel.aggregate
        .mockResolvedValueOnce([]) // count -> total 0
        .mockResolvedValueOnce([]); // data

      const res = await service.findAll({
        page: 1,
        size: 20,
        keyword: 'ali.ce',
        orderStatus: OrderStatusEnum.READY,
        startDate: '2026-07-01',
        endDate: '2026-08-01',
      } as never);

      expect(res.total).toBe(0);
      expect(orderStatusModel.findOne).toHaveBeenCalledWith({
        orderStatusName: OrderStatusEnum.READY,
      });
    });
  });

  describe('getOrderKpis', () => {
    // One aggregate call: the per-status counts every KPI is derived from.
    const withCounts = (rows: Array<{ _id: string | null; count: number }>) =>
      orderModel.aggregate.mockResolvedValueOnce(rows);

    it('derives the four headline figures from the status counts', async () => {
      withCounts([
        { _id: 'DRAFT', count: 3 },
        { _id: 'CONFIRMED', count: 5 },
        { _id: 'RECEIVED', count: 4 },
        { _id: 'WASHING', count: 6 },
        { _id: 'READY', count: 8 },
        { _id: 'DELIVERED', count: 14 },
        { _id: 'CANCELLED', count: 2 },
      ]);

      const res = await service.getOrderKpis({} as never);

      expect(res.totalOrders).toBe(42);
      expect(res.inProgress).toBe(15); // confirmed + received + washing
      expect(res.readyForCollection).toBe(8);
      // 14 delivered / (42 - 2 cancelled) = 35%
      expect(res.completionBase).toBe(40);
      expect(res.completionRate).toBe(35);
      expect(orderModel.aggregate).toHaveBeenCalledTimes(1);
    });

    it('excludes drafts from in-progress — they are not on the floor yet', async () => {
      withCounts([
        { _id: 'DRAFT', count: 9 },
        { _id: 'WASHING', count: 1 },
      ]);

      const res = await service.getOrderKpis({} as never);

      expect(res.inProgress).toBe(1);
      expect(res.totalOrders).toBe(10);
    });

    it('reports 0% rather than NaN when nothing could have completed', async () => {
      withCounts([{ _id: 'CANCELLED', count: 4 }]);

      const res = await service.getOrderKpis({} as never);

      expect(res.completionBase).toBe(0);
      expect(res.completionRate).toBe(0);
    });

    it('rounds the completion rate to one decimal', async () => {
      withCounts([
        { _id: 'DELIVERED', count: 1 },
        { _id: 'READY', count: 2 },
      ]);

      const res = await service.getOrderKpis({} as never);

      expect(res.completionRate).toBe(33.3); // 1/3, not 33.33333…
    });

    it('narrows the headline figures on orderStatus but not the breakdown', async () => {
      const statusId = new Types.ObjectId();
      orderStatusModel.findOne.mockReturnValueOnce({
        select: () => ({ lean: () => Promise.resolve({ _id: statusId }) }),
      });
      orderModel.aggregate
        // 1st: every status, filters minus orderStatus — the tab counts.
        .mockResolvedValueOnce([
          { _id: 'READY', count: 2 },
          { _id: 'DELIVERED', count: 3 },
        ])
        // 2nd: narrowed by the status filter — the cards.
        .mockResolvedValueOnce([{ _id: 'READY', count: 2 }]);

      const res = await service.getOrderKpis({
        orderStatus: OrderStatusEnum.READY,
      } as never);

      // Cards follow the filter…
      expect(res.totalOrders).toBe(2);
      expect(res.readyForCollection).toBe(2);
      expect(res.delivered).toBe(0);
      // …while the breakdown still sees the orders behind every other tab.
      expect(res.byOrderStatus.all).toBe(5);
      expect(res.byOrderStatus.delivered).toBe(3);

      const [unscoped] = orderModel.aggregate.mock.calls[0] as [
        Array<Record<string, never>>,
      ];
      const [scoped] = orderModel.aggregate.mock.calls[1] as [
        Array<Record<string, never>>,
      ];
      expect(JSON.stringify(unscoped)).not.toContain(statusId.toString());
      expect(JSON.stringify(scoped)).toContain(statusId.toString());
    });

    it('narrows on paymentStatus, breakdown included', async () => {
      withCounts([{ _id: 'READY', count: 1 }]);

      await service.getOrderKpis({
        paymentStatus: OrderPaymentStatusEnum.UNPAID,
      } as never);

      // In the base $match, so it reaches the breakdown as well as the cards —
      // unlike orderStatus, which is held back.
      const [pipeline] = orderModel.aggregate.mock.calls[0] as [
        Array<Record<string, never>>,
      ];
      expect(JSON.stringify(pipeline)).toContain('"paymentStatus":"UNPAID"');
    });

    it('narrows on pricingModel and pickedUpBy', async () => {
      const agentId = new Types.ObjectId();
      withCounts([{ _id: 'READY', count: 1 }]);

      await service.getOrderKpis({
        pricingModel: PricingModelEnum.PER_KG,
        pickedUpBy: agentId.toString(),
      } as never);

      const [pipeline] = orderModel.aggregate.mock.calls[0] as [
        Array<Record<string, never>>,
      ];
      const stages = JSON.stringify(pipeline);
      expect(stages).toContain('"pricingModel":"PER_KG"');
      expect(stages).toContain(agentId.toString());
    });

    it('resolves officeCode to an id and $ands it in', async () => {
      const officeId = new Types.ObjectId();
      officeModel.findOne.mockReturnValueOnce({
        select: () => ({ lean: () => Promise.resolve({ _id: officeId }) }),
      });
      withCounts([{ _id: 'READY', count: 1 }]);

      await service.getOrderKpis({ officeCode: 'of-dla-01' } as never);

      // Codes are stored upper-case; the caller's casing must not matter.
      expect(officeModel.findOne).toHaveBeenCalledWith({
        officeCode: 'OF-DLA-01',
      });

      const [pipeline] = orderModel.aggregate.mock.calls[0] as [
        Array<Record<string, never>>,
      ];
      // $and, so an office-scoped caller's own officeId cannot overwrite it.
      expect(JSON.stringify(pipeline)).toContain('$and');
      expect(JSON.stringify(pipeline)).toContain(officeId.toString());
    });

    it('matches nothing for an unknown officeCode', async () => {
      // The default mock resolves null — no office by that code.
      withCounts([]);

      await service.getOrderKpis({ officeCode: 'NOPE' } as never);

      const [pipeline] = orderModel.aggregate.mock.calls[0] as [
        Array<Record<string, never>>,
      ];
      // Still an id-shaped match, just one nothing can carry.
      expect(JSON.stringify(pipeline)).toContain('$and');
    });

    it('counts once when no status filter is set', async () => {
      withCounts([{ _id: 'READY', count: 2 }]);

      const res = await service.getOrderKpis({} as never);

      // Both sets are identical without a status filter — no second pass.
      expect(orderModel.aggregate).toHaveBeenCalledTimes(1);
      expect(res.totalOrders).toBe(2);
      expect(res.byOrderStatus.all).toBe(2);
    });

    it('applies the list filters — keyword, dates and customer', async () => {
      withCounts([{ _id: 'READY', count: 1 }]);

      await service.getOrderKpis({
        keyword: 'ali.ce',
        startDate: '2026-07-01',
        endDate: '2026-08-01',
      } as never);

      const [pipeline] = orderModel.aggregate.mock.calls[0] as [
        Array<Record<string, never>>,
      ];
      const stages = JSON.stringify(pipeline);
      expect(stages).toContain('receivedAt');
      // The keyword is escaped before it reaches the regex.
      expect(stages).toContain('ali\\\\.ce');
    });

    it('counts orders whose status row is missing so the total reconciles', async () => {
      withCounts([
        { _id: 'READY', count: 2 },
        { _id: null, count: 3 },
      ]);

      const res = await service.getOrderKpis({} as never);

      expect(res.totalOrders).toBe(5);
      expect(res.readyForCollection).toBe(2);
    });
  });

  describe('exportOrders', () => {
    const row = {
      orderCode: 'OR-1',
      customerName: 'Alice Test',
      customerPhone: '690',
      office: 'DD 1',
      status: 'READY',
      paymentStatus: 'PAID',
      receivedAt: '2026-07-01',
      estimatedDeliveryDate: '2026-07-03',
      deliveredAt: '',
      totalAmount: 1700,
      amountPaid: 1700,
      balanceDue: 0,
      createdBy: 'Mia M',
      pickedUpBy: 'Mia M',
      createdAt: '2026-07-01 10:00:00',
      updatedAt: '2026-07-01 10:00:00',
    };

    it('builds a CSV download with a header and rows', async () => {
      orderModel.aggregate.mockResolvedValue([row]);

      const res = await service.exportOrders({
        format: 'csv',
        page: 1,
        size: 20,
      } as never);

      expect(res.contentType).toBe('text/csv');
      expect(res.filename).toMatch(/^orders-export-\d{8}\.csv$/);
      const text = res.buffer.toString('utf8');
      expect(text).toContain('Order Code');
      expect(text).toContain('OR-1');
      expect(text).toContain('Alice Test');
    });

    it('builds an Excel (xlsx) download', async () => {
      orderModel.aggregate.mockResolvedValue([row]);

      const res = await service.exportOrders({
        format: 'excel',
        page: 1,
        size: 20,
      } as never);

      expect(res.contentType).toContain('spreadsheetml');
      expect(res.filename).toMatch(/\.xlsx$/);
      // XLSX is a zip archive — the first two bytes are the PK signature.
      expect(res.buffer.subarray(0, 2).toString('utf8')).toBe('PK');
    });
  });
});
