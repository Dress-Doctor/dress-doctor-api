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
import { OrderItemHistory } from 'src/schema/order/order-item-history.schema';
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
import { HistoryActionEnum } from 'src/schema/admin/admin.dto';
import { OrderEvents } from './order.events';
import {
  OrderService,
  TransitionKindEnum,
  availableTransitionsFrom,
  classifyTransition,
} from './order.service';

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
  let promoUsageModel: { create: jest.Mock; deleteOne: jest.Mock };
  let promoCodeModel: { updateOne: jest.Mock };
  let customerModel: { findOneAndUpdate: jest.Mock };
  let orderItemHistoryModel: { aggregate: jest.Mock };
  let pickupRequestModel: { findOne: jest.Mock };
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
    promoUsageModel = {
      create: jest.fn().mockResolvedValue({}),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    promoCodeModel = {
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    customerModel = { findOneAndUpdate: jest.fn().mockResolvedValue({}) };
    orderItemHistoryModel = { aggregate: jest.fn().mockResolvedValue([]) };
    // createOrderWithPickup reads the pickup via findOne({...}).populate(...).
    pickupRequestModel = { findOne: jest.fn() };
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
            data: { platform: 'WEB', reason: 'because I said so' },
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
        {
          provide: getModelToken(OrderItemHistory.name),
          useValue: orderItemHistoryModel,
        },
        { provide: getModelToken(Office.name), useValue: officeModel },
        { provide: getModelToken(OfficeUser.name), useValue: {} },
        {
          provide: getModelToken(PickupRequest.name),
          useValue: pickupRequestModel,
        },
        { provide: getModelToken(PickupStatus.name), useValue: {} },
        {
          provide: getModelToken(Customer.name),
          // onOrderCreated bumps the customer's lastOrderAt rollup, and a
          // customer move rebuilds it on both sides.
          useValue: customerModel,
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
      createdAt: new Date('2026-03-04T09:15:00.000Z'),
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

    it("stamps lastOrderAt with the order's own createdAt", async () => {
      // The same field `recomputeLastOrderAt` rebuilds the rollup from. Stamp
      // a fresh `new Date()` here instead and the value shifts by the width of
      // the write the first time the order changes customer.
      await service.createOrder(dto());

      expect(customerModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        { lastOrderAt: created.createdAt },
        expect.anything(),
      );
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

  describe('createOrderWithPickup', () => {
    const created = {
      _id: new Types.ObjectId(),
      orderCode: 'OR-000123',
      amountPaid: 0,
      createdAt: new Date('2026-03-04T09:15:00.000Z'),
    };
    const customerId = new Types.ObjectId();
    const pickupRequestId = new Types.ObjectId();

    const dto = (over: Record<string, unknown> = {}) =>
      ({
        customerId: customerId.toString(),
        currencyId: new Types.ObjectId().toString(),
        pickupRequestId: pickupRequestId.toString(),
        pricingModel: PricingModelEnum.PER_PIECE,
        estimatedDeliveryDate: new Date(),
        ...over,
      }) as never;

    // The pickup the caller names: assigned, and the customer's own.
    const setPickup = (over: Record<string, unknown> = {}) =>
      pickupRequestModel.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          _id: pickupRequestId,
          reference: 'PU-A4F92C',
          customerId,
          pickupStatusId: { pickupStatusName: 'ASSIGNED' },
          ...over,
        }),
      });

    beforeEach(() => {
      setPickup();
      // No order on this pickup, and no open draft for this customer.
      orderModel.findOne.mockResolvedValue(null);
      orderModel.findOneAndUpdate.mockResolvedValue(created);
      orderModel.findById.mockResolvedValue({
        ...created,
        pricingModel: PricingModelEnum.PER_PIECE,
        customerId,
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

    it('books the order and its garments, exactly like the no-pickup path', async () => {
      const line = {
        itemId: new Types.ObjectId().toString(),
        serviceTypeId: new Types.ObjectId().toString(),
        quantity: 2,
      };

      const res = await service.createOrderWithPickup(dto({ items: [line] }));

      expect(res).toEqual({
        message: 'Order created successfully',
        data: { _id: created._id, orderCode: 'OR-000123' },
      });
      expect(savedOrderItems).toHaveLength(1);
      const [, update] = orderModel.findOneAndUpdate.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(update).toMatchObject({ pickupRequestId, customerId });
      expect(update).not.toHaveProperty('items');
    });

    it('reads the pickup through the caller scope, not by bare id', async () => {
      await service.createOrderWithPickup(dto());

      const [filter] = pickupRequestModel.findOne.mock.calls[0] as [
        Record<string, unknown>,
      ];
      expect(filter._id).toEqual(pickupRequestId);
    });

    it('refuses a pickup that is not ASSIGNED yet', async () => {
      setPickup({ pickupStatusId: { pickupStatusName: 'CONFIRMED' } });

      await expect(service.createOrderWithPickup(dto())).rejects.toMatchObject({
        response: { code: 'PICKUP_NOT_ASSIGNED' },
      });
      expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('refuses a second order on the same pickup, whatever status the first reached', async () => {
      // A DELIVERED order already exists for this pickup.
      orderModel.findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(),
        orderCode: 'OR-000001',
      });

      await expect(service.createOrderWithPickup(dto())).rejects.toMatchObject({
        response: { code: 'PICKUP_ORDER_EXISTS' },
      });
      expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('refuses a pickup that belongs to another customer', async () => {
      setPickup({ customerId: new Types.ObjectId() });

      await expect(service.createOrderWithPickup(dto())).rejects.toMatchObject({
        response: { code: 'PICKUP_CUSTOMER_MISMATCH' },
      });
      expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('applies the customer-wide draft rule to this path too', async () => {
      // First findOne (order on the pickup) finds nothing; the second (open
      // draft for the customer) finds one.
      orderModel.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: new Types.ObjectId() });

      await expect(service.createOrderWithPickup(dto())).rejects.toMatchObject({
        response: { code: 'DRAFT_EXISTS' },
      });
      expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
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

    it('rejects a move back into DRAFT', async () => {
      setOrder(OrderStatusEnum.CONFIRMED);

      await expect(
        service.transitionOrder(
          '507f1f77bcf86cd799439011',
          OrderStatusEnum.DRAFT,
        ),
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

    /**
     * The edit itself is the FIRST findOneAndUpdate of the call; reprice's
     * snapshot follows it.
     */
    const editWrite = () =>
      orderModel.findOneAndUpdate.mock.calls[0] as unknown as [
        unknown,
        { $set?: Record<string, unknown>; $unset?: Record<string, unknown> },
        { context?: { reason?: string; changedBy?: unknown } },
      ];

    it('clears the agreed price when the draft sends 0', async () => {
      await service.updateOrderDraft('507f1f77bcf86cd799439011', {
        orderAmount: 0,
      });

      const [, update] = editWrite();
      expect(update.$unset).toEqual({ manualOrderAmount: 1 });
    });

    it('writes the edit through the hooked path, carrying the reason', async () => {
      // updateOne is invisible to the history hook, which is attached to
      // findOneAndUpdate. An edit that went that way left no audit entry and
      // dropped the x-change-reason the caller was obliged to send.
      await service.updateOrderDraft('507f1f77bcf86cd799439011', {
        note: 'No starch on the blue shirt',
      });

      expect(orderModel.updateOne).not.toHaveBeenCalled();

      const [, update, options] = editWrite();
      expect(update.$set).toEqual({ note: 'No starch on the blue shirt' });
      expect(options.context?.reason).toBe('because I said so');
      expect(options.context?.changedBy).toBeDefined();
    });

    it('records a cleared note as an edit rather than as nothing', async () => {
      await service.updateOrderDraft('507f1f77bcf86cd799439011', {
        note: '  ',
      });

      const [, update, options] = editWrite();
      expect(update.$unset).toEqual({ note: 1 });
      expect(update.$set).toBeUndefined();
      expect(options.context?.reason).toBe('because I said so');
    });

    it('skips the write entirely when the body asks for nothing', async () => {
      // Mongo rejects an empty update operator; the reprice still runs.
      await service.updateOrderDraft('507f1f77bcf86cd799439011', {});

      expect(orderModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const [, update] = editWrite();
      expect(update.$set).toBeUndefined();
      expect(update.$unset).toBeUndefined();
    });

    it('edits and reprices inside one transaction', async () => {
      // The reprice can refuse what the edit asked for (PRICE_NOT_FOUND on a
      // switch to PER_PIECE), and a rejected reprice must take the edit with
      // it rather than leave a new pricing model beside stale amounts.
      await service.updateOrderDraft('507f1f77bcf86cd799439011', {
        note: 'Handle with care',
      });

      const [, , editOptions] = orderModel.findOneAndUpdate.mock.calls[0] as [
        unknown,
        unknown,
        { session?: unknown },
      ];
      const [, , repriceOptions] = orderModel.findOneAndUpdate.mock
        .calls[1] as [unknown, unknown, { session?: unknown }];
      expect(editOptions.session).toBeDefined();
      expect(repriceOptions.session).toBe(editOptions.session);
    });
  });

  describe('editing a draft beyond its pricing inputs', () => {
    const ORDER_ID = '507f1f77bcf86cd799439011';

    /** The order under edit; a second findOne looks for a rival draft. */
    const editing = (extra: Record<string, unknown> = {}) =>
      orderModel.findOne.mockReturnValueOnce({
        populate: jest
          .fn()
          .mockResolvedValue(orderWithStatus(OrderStatusEnum.DRAFT, extra)),
      });

    const editWrite = () =>
      orderModel.findOneAndUpdate.mock.calls[0] as unknown as [
        unknown,
        { $set?: Record<string, unknown> },
        unknown,
      ];

    beforeEach(() => {
      orderModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(),
        pricingModel: 'PER_PIECE',
        customerId: new Types.ObjectId(),
        totalWeightKg: 0,
        manualDiscount: 0,
        amountPaid: 0,
      });
      pricingService.priceOrder.mockResolvedValue({
        pricingModel: 'PER_PIECE',
        lines: [],
        subtotal: 0,
        manualDiscount: 0,
        promoDiscount: 0,
        total: 0,
        currencyId: new Types.ObjectId(),
        promoCodeId: null,
        subscriptionId: null,
        quotaConsumed: 0,
      });
    });

    /**
     * `recomputeLastOrderAt` reads the customer's newest remaining order:
     * findOne(...).sort(...).select('createdAt').
     */
    const newestOrder = (createdAt: Date | null) =>
      orderModel.findOne.mockReturnValueOnce({
        sort: () => ({
          select: () => Promise.resolve(createdAt ? { createdAt } : null),
        }),
      });

    it('moves the draft to a customer who holds none', async () => {
      editing();
      // The rival-draft lookup finds nothing.
      orderModel.findOne.mockResolvedValueOnce(null);
      newestOrder(new Date('2026-01-01T00:00:00.000Z')); // customer left
      newestOrder(new Date('2026-02-01T00:00:00.000Z')); // customer gained
      const customerId = new Types.ObjectId();

      await service.updateOrderDraft(ORDER_ID, {
        customerId: customerId.toString(),
      });

      const [, update] = editWrite();
      expect(update.$set?.customerId).toEqual(customerId);
    });

    it('rebuilds lastOrderAt on both customers after a move', async () => {
      // The customer an order leaves may still hold older ones, so the rollup
      // is recomputed from what remains rather than blindly bumped.
      const previous = new Types.ObjectId();
      const next = new Types.ObjectId();
      const olderOrder = new Date('2026-01-01T00:00:00.000Z');
      const movedOrder = new Date('2026-02-01T00:00:00.000Z');

      editing({ customerId: previous });
      orderModel.findOne.mockResolvedValueOnce(null);
      newestOrder(olderOrder);
      newestOrder(movedOrder);

      await service.updateOrderDraft(ORDER_ID, { customerId: next.toString() });

      expect(customerModel.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: previous },
        { lastOrderAt: olderOrder },
        expect.anything(),
      );
      expect(customerModel.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: next },
        { lastOrderAt: movedOrder },
        expect.anything(),
      );
    });

    it('clears lastOrderAt for a customer left with no orders at all', async () => {
      // Keeping the date of an order that is no longer theirs would hold them
      // out of the inactivity scan on the strength of someone else's laundry.
      const previous = new Types.ObjectId();
      editing({ customerId: previous });
      orderModel.findOne.mockResolvedValueOnce(null);
      newestOrder(null);
      newestOrder(new Date('2026-02-01T00:00:00.000Z'));

      await service.updateOrderDraft(ORDER_ID, {
        customerId: new Types.ObjectId().toString(),
      });

      expect(customerModel.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: previous },
        { $unset: { lastOrderAt: 1 } },
        expect.anything(),
      );
    });

    it('leaves the rollups alone when the customer is unchanged', async () => {
      const customerId = new Types.ObjectId();
      editing({ customerId });

      await service.updateOrderDraft(ORDER_ID, {
        customerId: customerId.toString(),
        note: 'Same customer, new note',
      });

      expect(customerModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('refuses a customer who already holds a draft', async () => {
      // Otherwise the edit would make a state booking itself refuses to
      // create: two drafts for one customer.
      editing();
      orderModel.findOne.mockResolvedValueOnce({ _id: new Types.ObjectId() });

      await expect(
        service.updateOrderDraft(ORDER_ID, {
          customerId: new Types.ObjectId().toString(),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('does not look for a rival draft when the customer is unchanged', async () => {
      const customerId = new Types.ObjectId();
      editing({ customerId });

      await service.updateOrderDraft(ORDER_ID, {
        customerId: customerId.toString(),
      });

      // Only the order under edit was fetched.
      expect(orderModel.findOne).toHaveBeenCalledTimes(1);
    });

    it('refuses a switch to per-kg with no weight on file', async () => {
      editing({ pricingModel: PricingModelEnum.PER_PIECE, totalWeightKg: 0 });

      await expect(
        service.updateOrderDraft(ORDER_ID, {
          pricingModel: PricingModelEnum.PER_KG,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('refuses to clear the weight of an order priced by the kilo', async () => {
      // The same mistake from the other direction: the model stays, the
      // weight it needs goes.
      editing({ pricingModel: PricingModelEnum.PER_KG, totalWeightKg: 20.5 });

      await expect(
        service.updateOrderDraft(ORDER_ID, { totalWeightKg: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('takes a weight and a switch to per-kg together', async () => {
      editing({ pricingModel: PricingModelEnum.PER_PIECE, totalWeightKg: 0 });

      await service.updateOrderDraft(ORDER_ID, {
        pricingModel: PricingModelEnum.PER_KG,
        totalWeightKg: 20.5,
      });

      const [, update] = editWrite();
      expect(update.$set).toMatchObject({
        pricingModel: PricingModelEnum.PER_KG,
        totalWeightKg: 20.5,
      });
    });

    it('refuses an unknown pickup agent', async () => {
      editing();
      userModel.exists.mockResolvedValueOnce(null);

      await expect(
        service.updateOrderDraft(ORDER_ID, {
          pickedUpBy: new Types.ObjectId().toString(),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('refuses an unknown currency', async () => {
      editing();
      currencyModel.findById.mockResolvedValueOnce(null);

      await expect(
        service.updateOrderDraft(ORDER_ID, {
          currencyId: new Types.ObjectId().toString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('carries the dates through as sent', async () => {
      editing();
      const receivedAt = new Date('2026-08-01T09:00:00.000Z');
      const estimatedDeliveryDate = new Date('2026-08-05T09:00:00.000Z');

      await service.updateOrderDraft(ORDER_ID, {
        receivedAt,
        estimatedDeliveryDate,
      });

      const [, update] = editWrite();
      expect(update.$set).toEqual({ receivedAt, estimatedDeliveryDate });
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

  describe('workflow rules', () => {
    const S = OrderStatusEnum;

    // Steps may be skipped in both directions: a live order is set to whatever
    // status it is really in.
    it.each([
      [S.DRAFT, S.CONFIRMED],
      [S.DRAFT, S.READY],
      [S.DRAFT, S.DELIVERED],
      [S.CONFIRMED, S.RECEIVED],
      [S.CONFIRMED, S.DELIVERED],
      [S.READY, S.RECEIVED],
      [S.WASHING, S.CONFIRMED],
    ])('%s → %s is an ordinary move', (from, to) => {
      expect(classifyTransition(from, to)).toBe(TransitionKindEnum.NORMAL);
    });

    it.each([S.DRAFT, S.CONFIRMED, S.RECEIVED, S.WASHING, S.READY])(
      'an order can be cancelled from %s',
      (from) => {
        expect(classifyTransition(from, S.CANCELLED)).toBe(
          TransitionKindEnum.CANCELLATION,
        );
      },
    );

    it.each([
      [S.DELIVERED, S.CANCELLED],
      [S.CANCELLED, S.DRAFT],
      [S.DELIVERED, S.READY],
      [S.CANCELLED, S.CONFIRMED],
    ])('%s → %s is refused: terminal', (from, to) => {
      expect(classifyTransition(from, to)).toBeUndefined();
    });

    it.each([S.CONFIRMED, S.RECEIVED, S.WASHING, S.READY])(
      '%s → DRAFT is refused: a live order never goes back to a draft',
      (from) => {
        expect(classifyTransition(from, S.DRAFT)).toBeUndefined();
      },
    );

    it('refuses a move to the status the order is already in', () => {
      expect(classifyTransition(S.WASHING, S.WASHING)).toBeUndefined();
      expect(classifyTransition(S.DRAFT, S.DRAFT)).toBeUndefined();
    });

    it('publishes what is reachable from a status', () => {
      expect(availableTransitionsFrom(S.WASHING)).toEqual({
        allowed: [S.CONFIRMED, S.RECEIVED, S.READY, S.DELIVERED, S.CANCELLED],
      });
      expect(availableTransitionsFrom(S.DRAFT)).toEqual({
        allowed: [
          S.CONFIRMED,
          S.RECEIVED,
          S.WASHING,
          S.READY,
          S.DELIVERED,
          S.CANCELLED,
        ],
      });
      expect(availableTransitionsFrom(S.DELIVERED)).toEqual({ allowed: [] });
      expect(availableTransitionsFrom(S.CANCELLED)).toEqual({ allowed: [] });
    });
  });

  describe('transitionOrder', () => {
    const lastContext = () => {
      const calls = orderModel.findOneAndUpdate.mock.calls as unknown as Array<
        [unknown, unknown, { context?: Record<string, unknown> }]
      >;
      return calls[0][2].context ?? {};
    };

    it('moves an order forward and records a plain update', async () => {
      setOrder(OrderStatusEnum.RECEIVED);

      const msg = await service.transitionOrder(
        '507f1f77bcf86cd799439011',
        OrderStatusEnum.WASHING,
      );

      expect(msg).toBe('Order moved to WASHING');
      expect(lastContext()).toMatchObject({
        action: HistoryActionEnum.UPDATE,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        OrderEvents.statusChanged,
        expect.objectContaining({ kind: TransitionKindEnum.NORMAL }),
      );
    });

    it('walks a status back as an ordinary move', async () => {
      setOrder(OrderStatusEnum.WASHING);

      const msg = await service.transitionOrder(
        '507f1f77bcf86cd799439011',
        OrderStatusEnum.RECEIVED,
      );

      expect(msg).toBe('Order moved to RECEIVED');
      expect(lastContext()).toMatchObject({
        action: HistoryActionEnum.UPDATE,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        OrderEvents.statusChanged,
        expect.objectContaining({ kind: TransitionKindEnum.NORMAL }),
      );
    });

    it('records a cancellation under its own action', async () => {
      setOrder(OrderStatusEnum.WASHING);

      await service.transitionOrder(
        '507f1f77bcf86cd799439011',
        OrderStatusEnum.CANCELLED,
      );

      expect(lastContext()).toMatchObject({ action: HistoryActionEnum.CANCEL });
    });

    it('carries the caller’s reason into the audit context', async () => {
      setOrder(OrderStatusEnum.RECEIVED);

      await service.transitionOrder(
        '507f1f77bcf86cd799439011',
        OrderStatusEnum.WASHING,
      );

      expect(lastContext()).toMatchObject({ reason: 'because I said so' });
    });

    it('refuses a move into DRAFT without touching the order', async () => {
      setOrder(OrderStatusEnum.RECEIVED);

      await expect(
        service.transitionOrder(
          '507f1f77bcf86cd799439011',
          OrderStatusEnum.DRAFT,
        ),
      ).rejects.toThrow(ConflictException);
      expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('skips ahead when the bag is further along than the console says', async () => {
      setOrder(OrderStatusEnum.RECEIVED);

      await expect(
        service.transitionOrder(
          '507f1f77bcf86cd799439011',
          OrderStatusEnum.DELIVERED,
        ),
      ).resolves.toBe('Order moved to DELIVERED');
    });

    it('refuses to cancel a delivered order', async () => {
      setOrder(OrderStatusEnum.DELIVERED);

      await expect(
        service.transitionOrder(
          '507f1f77bcf86cd799439011',
          OrderStatusEnum.CANCELLED,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('tells a refused caller what it could have asked for', async () => {
      setOrder(OrderStatusEnum.RECEIVED);

      await expect(
        service.transitionOrder(
          '507f1f77bcf86cd799439011',
          OrderStatusEnum.DRAFT,
        ),
      ).rejects.toMatchObject({
        response: {
          code: 'INVALID_STATUS_TRANSITION',
          allowed: [
            OrderStatusEnum.CONFIRMED,
            OrderStatusEnum.WASHING,
            OrderStatusEnum.READY,
            OrderStatusEnum.DELIVERED,
            OrderStatusEnum.CANCELLED,
          ],
        },
      });
    });

    it('demands garments of an empty draft going live, whatever the target', async () => {
      setOrder(OrderStatusEnum.DRAFT);
      orderItemModel.countDocuments.mockResolvedValue(0);

      await expect(
        service.transitionOrder(
          '507f1f77bcf86cd799439011',
          OrderStatusEnum.RECEIVED,
        ),
      ).rejects.toMatchObject({ response: { code: 'ORDER_EMPTY' } });
    });

    it('never demands garments of an order already past DRAFT', async () => {
      setOrder(OrderStatusEnum.RECEIVED);
      orderItemModel.countDocuments.mockResolvedValue(0);

      await expect(
        service.transitionOrder(
          '507f1f77bcf86cd799439011',
          OrderStatusEnum.CONFIRMED,
        ),
      ).resolves.toBe('Order moved to CONFIRMED');
    });

    it('lets an empty draft be cancelled', async () => {
      setOrder(OrderStatusEnum.DRAFT);
      orderItemModel.countDocuments.mockResolvedValue(0);

      await expect(
        service.transitionOrder(
          '507f1f77bcf86cd799439011',
          OrderStatusEnum.CANCELLED,
        ),
      ).resolves.toBe('Order cancelled successfully');
    });
  });

  describe('releasing what confirming reserved', () => {
    const committed = (status: OrderStatusEnum) =>
      setOrder(status, {
        quotaConsumed: 3,
        subscriptionId: new Types.ObjectId(),
        promoCodeId: new Types.ObjectId(),
      });

    it('hands quota and the promo use back when a confirmed order is cancelled', async () => {
      committed(OrderStatusEnum.CONFIRMED);

      await service.transitionOrder(
        '507f1f77bcf86cd799439011',
        OrderStatusEnum.CANCELLED,
      );

      expect(subscriptionModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        { $inc: { remainingQuota: 3 } },
        expect.anything(),
      );
      expect(promoUsageModel.deleteOne).toHaveBeenCalled();
      expect(promoCodeModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        { $inc: { usedCount: -1 } },
        expect.anything(),
      );
    });

    it('releases the same commitments when a started order is cancelled', async () => {
      committed(OrderStatusEnum.WASHING);

      await service.transitionOrder(
        '507f1f77bcf86cd799439011',
        OrderStatusEnum.CANCELLED,
      );

      expect(subscriptionModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        { $inc: { remainingQuota: 3 } },
        expect.anything(),
      );
    });

    it('releases nothing when a draft is cancelled — it never took anything', async () => {
      committed(OrderStatusEnum.DRAFT);

      await service.transitionOrder(
        '507f1f77bcf86cd799439011',
        OrderStatusEnum.CANCELLED,
      );

      expect(subscriptionModel.updateOne).not.toHaveBeenCalled();
      expect(promoUsageModel.deleteOne).not.toHaveBeenCalled();
    });

    it('leaves usedCount alone when there was no usage row to delete', async () => {
      committed(OrderStatusEnum.CONFIRMED);
      promoUsageModel.deleteOne.mockResolvedValue({ deletedCount: 0 });

      await service.transitionOrder(
        '507f1f77bcf86cd799439011',
        OrderStatusEnum.CANCELLED,
      );

      expect(promoCodeModel.updateOne).not.toHaveBeenCalled();
    });

    it('moving between live statuses never releases anything', async () => {
      committed(OrderStatusEnum.RECEIVED);

      await service.transitionOrder(
        '507f1f77bcf86cd799439011',
        OrderStatusEnum.CONFIRMED,
      );

      expect(subscriptionModel.updateOne).not.toHaveBeenCalled();
      expect(promoUsageModel.deleteOne).not.toHaveBeenCalled();
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

    it('joins the pickup request, status named, on every row', async () => {
      orderModel.aggregate
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([{ orderCode: 'OR-1' }]);

      await service.findAll({ page: 1, size: 20 } as never);

      // Second call is the page itself; the first only counts.
      const [pipeline] = orderModel.aggregate.mock.calls[1] as [
        Record<string, { from?: string; pipeline?: unknown[] }>[],
      ];
      const pickup = pipeline.find(
        (stage) => stage.$lookup?.from === 'pickup_request',
      )?.$lookup;

      expect(pickup).toBeDefined();
      // The status arrives as a name, not another id for the client to resolve.
      expect(pickup?.pipeline).toContainEqual(
        expect.objectContaining({
          $lookup: expect.objectContaining({
            from: 'pickup_status',
          }) as unknown,
        }),
      );

      const projection = pickup?.pipeline?.find(
        (stage): stage is { $project: Record<string, unknown> } =>
          typeof stage === 'object' && stage !== null && '$project' in stage,
      )?.$project;

      // An allow-list: the pickup's own reference, address, date and status —
      // never the internal apiClientId.
      expect(projection).toBeDefined();
      expect(projection).toHaveProperty('reference');
      expect(projection).toHaveProperty('pickupAddress');
      expect(projection).toHaveProperty('pickupDate');
      expect(projection).toHaveProperty('pickupStatus');
      expect(projection).not.toHaveProperty('apiClientId');
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

  describe('findOrderItemHistory', () => {
    const ORDER_ID = new Types.ObjectId();

    it('reads the trail through the snapshot, not the surviving lines', async () => {
      // A removed garment's row is deleted outright, so its id is no longer on
      // the order. Matching on the snapshot is what keeps that entry readable.
      orderModel.findOne.mockReturnValue({
        select: () => Promise.resolve({ _id: ORDER_ID, orderCode: 'OR-TEST' }),
      });

      await service.findOrderItemHistory({ orderId: ORDER_ID.toString() });

      const [pipeline] = orderItemHistoryModel.aggregate.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      expect(pipeline[0]).toEqual({
        $match: { 'snapshot.orderId': ORDER_ID },
      });
    });

    it('never returns the stored snapshot itself', async () => {
      orderModel.findOne.mockReturnValue({
        select: () => Promise.resolve({ _id: ORDER_ID, orderCode: 'OR-TEST' }),
      });

      await service.findOrderItemHistory({ orderId: ORDER_ID.toString() });

      const [pipeline] = orderItemHistoryModel.aggregate.mock.calls[0] as [
        Record<string, Record<string, unknown>>[],
      ];
      const projection = pipeline.find((stage) => stage.$project)?.$project;
      expect(projection).toBeDefined();
      expect(projection).not.toHaveProperty('snapshot');
      // The summary fields are read off it instead.
      expect(projection?.quantity).toBe('$snapshot.quantity');
    });

    it('labels the foreign keys the trail carries', async () => {
      const entries = [{ changes: [{ field: 'serviceTypeId' }] }];
      orderModel.findOne.mockReturnValue({
        select: () => Promise.resolve({ _id: ORDER_ID, orderCode: 'OR-TEST' }),
      });
      orderItemHistoryModel.aggregate.mockResolvedValue(entries);

      const res = await service.findOrderItemHistory({
        orderId: ORDER_ID.toString(),
      });

      expect(historyLabelService.labelChanges).toHaveBeenCalledWith(
        OrderItem.name,
        entries,
      );
      expect(res).toBe(entries);
    });

    it("refuses an order outside the caller's scope", async () => {
      // The scope filter is what makes the id unguessable-in-practice: an
      // order the caller may not read simply is not found.
      orderModel.findOne.mockReturnValue({
        select: () => Promise.resolve(null),
      });

      await expect(
        service.findOrderItemHistory({ orderId: ORDER_ID.toString() }),
      ).rejects.toThrow(NotFoundException);
      expect(orderItemHistoryModel.aggregate).not.toHaveBeenCalled();
    });
  });
});
