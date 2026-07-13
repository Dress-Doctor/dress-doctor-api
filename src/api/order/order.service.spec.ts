import { BadRequestException, ConflictException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Currency } from 'src/schema/catalog/currency.schema';
import { Item } from 'src/schema/catalog/item.schema';
import { OrderItem } from 'src/schema/order/order-item.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { OrderStatusEnum } from 'src/schema/order/order.dto';
import { Order } from 'src/schema/order/order.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { User } from 'src/schema/user/user.schema';
import { OrderEvents } from './order.events';
import { OrderService } from './order.service';

describe('OrderService', () => {
  let service: OrderService;
  let orderModel: {
    findById: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let orderItemModel: { countDocuments: jest.Mock };
  let orderStatusModel: { findOne: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const orderWithStatus = (status: OrderStatusEnum) => ({
    _id: new Types.ObjectId(),
    orderCode: 'OR-TEST',
    pickupRequestId: undefined,
    orderStatusId: { orderStatusName: status },
  });

  const setOrder = (status: OrderStatusEnum) =>
    orderModel.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(orderWithStatus(status)),
    });

  beforeEach(async () => {
    orderModel = {
      findById: jest.fn(),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
    };
    orderItemModel = { countDocuments: jest.fn().mockResolvedValue(1) };
    orderStatusModel = {
      findOne: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: CodeGeneratorService, useValue: {} },
        { provide: AppUtilService, useValue: {} },
        {
          provide: REQUEST,
          useValue: {
            data: { platform: 'WEB' },
            user: {
              phone: '600',
              userId: new Types.ObjectId().toString(),
              ability: { can: () => true },
            },
          },
        },
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: getModelToken(Item.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: getModelToken(Currency.name), useValue: {} },
        { provide: getModelToken(OrderItem.name), useValue: orderItemModel },
        {
          provide: getModelToken(OrderStatus.name),
          useValue: orderStatusModel,
        },
        { provide: getModelToken(PickupRequest.name), useValue: {} },
        { provide: getModelToken(PickupStatus.name), useValue: {} },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = await module.resolve<OrderService>(OrderService);
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
});
