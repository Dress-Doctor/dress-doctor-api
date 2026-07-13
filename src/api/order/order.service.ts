import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Currency } from 'src/schema/catalog/currency.schema';
import { Item } from 'src/schema/catalog/item.schema';
import { OrderItem } from 'src/schema/order/order-item.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { OrderStatusEnum } from 'src/schema/order/order.dto';
import { Order } from 'src/schema/order/order.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { User } from 'src/schema/user/user.schema';
import { CreateOrderItemDto } from './dto/create-order-item.dto';
import {
  CreateOrderDto,
  CreateOrderWithPickupDto,
} from './dto/create-order.dto';
import { FindOrderDto } from './dto/find-order.dto';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { PickupStatusEnum } from 'src/schema/pickup/pickup.dto';
import {
  OrderItemParamsDto,
  UpdateOrderItemDto,
} from './dto/update-order-item.dto';
import { OrderEvents, type OrderStatusChangedEvent } from './order.events';

/**
 * Legal next-states per status. Any transition not listed here is rejected with
 * INVALID_STATUS_TRANSITION. DELIVERED and CANCELLED are terminal.
 */
const LEGAL_TRANSITIONS: Record<OrderStatusEnum, OrderStatusEnum[]> = {
  [OrderStatusEnum.DRAFT]: [
    OrderStatusEnum.CONFIRMED,
    OrderStatusEnum.CANCELLED,
  ],
  [OrderStatusEnum.CONFIRMED]: [
    OrderStatusEnum.RECEIVED,
    OrderStatusEnum.CANCELLED,
  ],
  [OrderStatusEnum.RECEIVED]: [
    OrderStatusEnum.WASHING,
    OrderStatusEnum.CANCELLED,
  ],
  [OrderStatusEnum.WASHING]: [OrderStatusEnum.READY, OrderStatusEnum.CANCELLED],
  [OrderStatusEnum.READY]: [
    OrderStatusEnum.DELIVERED,
    OrderStatusEnum.CANCELLED,
  ],
  [OrderStatusEnum.DELIVERED]: [],
  [OrderStatusEnum.CANCELLED]: [],
};

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<Order>,

    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    private readonly codeService: CodeGeneratorService,
    private readonly appUtilService: AppUtilService,

    @InjectModel(Item.name) private readonly itemModel: Model<Item>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Currency.name) private readonly currencyModel: Model<Currency>,

    @InjectModel(OrderItem.name)
    private readonly orderItemModel: Model<OrderItem>,

    @InjectModel(OrderStatus.name)
    private readonly orderStatusModel: Model<OrderStatus>,

    @InjectModel(PickupRequest.name)
    private readonly pickupRequestModel: Model<PickupRequest>,

    @InjectModel(PickupStatus.name)
    private readonly pickupStatusModel: Model<PickupStatus>,

    private readonly eventEmitter: EventEmitter2,
  ) {}

  private can(action: CaslActionsDto, subject: CaslSubjectsDto) {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;

    if (!ability.can(action, subject)) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} ${log} is`);
      throw new BadRequestException(`You are ${log}`);
    }
  }

  async createOrderWithPickup(data: CreateOrderWithPickupDto) {
    this.can('CREATE', 'Order');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const customerId = new Types.ObjectId(data.customerId);
    const customer = await this.userModel.findById(customerId);
    if (!customer) {
      this.logger.error(`${base} invalid customer id ${data.customerId}`);
      throw new BadRequestException('Invalid customer id');
    }

    const currencyId = new Types.ObjectId(data.currencyId);
    const currency = await this.currencyModel.findById(currencyId);
    if (!currency) {
      this.logger.error(`${base} invalid currency id ${data.currencyId}`);
      throw new BadRequestException('Invalid currency id');
    }

    const pickupRequestId = new Types.ObjectId(data.pickupRequestId);
    const pickupRequest = await this.pickupRequestModel
      .findById(pickupRequestId)
      .populate<{
        pickupStatusId: PickupStatus;
      }>({ model: PickupStatus.name, path: 'pickupStatusId' });
    if (!pickupRequest) {
      this.logger.error(
        `${base} invalid pickup request id ${data.pickupRequestId}`,
      );
      throw new BadRequestException('Invalid pickup request id');
    }

    const orderStatusDraft = OrderStatusEnum.DRAFT;
    const orderStatus = await this.orderStatusModel.findOne({
      orderStatusName: orderStatusDraft,
    });
    if (!orderStatus) {
      this.logger.error(
        `${base} order status ${orderStatusDraft} not found in database`,
      );
      throw new BadRequestException('Order status not found');
    }

    if (
      pickupRequest.pickupStatusId.pickupStatusName !==
      PickupStatusEnum.ASSIGNED.toString()
    ) {
      this.logger.error(
        `${base} you can only create order for pickup with status ${PickupStatusEnum.ASSIGNED.toString()} `,
      );
      throw new BadRequestException(
        `You can only create order for pick with status ${PickupStatusEnum.ASSIGNED.toString()}`,
      );
    }
    const existingOrder = await this.orderModel.findOne({
      customerId,
      pickupRequestId,
      orderStatusId: orderStatus._id,
    });
    if (existingOrder) {
      this.logger.error(
        `${base} this customer with id ${data.customerId} can only have one draft order at a time`,
      );
      throw new BadRequestException(
        'A customer can only have one draft order at a time',
      );
    }

    await this.orderModel.findOneAndUpdate(
      { customerId: customerId, pickupRequestId: pickupRequestId },
      {
        ...data,
        customerId,
        currencyId,
        pickupRequestId,
        orderStatusId: orderStatus._id,
        orderCode: await this.codeService.generateOrderReference(),
      },
      {
        context: { changedBy: new Types.ObjectId(this.req.user.userId) },
        upsert: true,
        returnDocument: 'after',
      } as never,
    );

    this.logger.log(
      `${base} has successfully created order for pickup request ${data.pickupRequestId}`,
    );
    return 'Order created successfully';
  }

  async createOrder(data: CreateOrderDto) {
    this.can('CREATE', 'Order');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const customerId = new Types.ObjectId(data.customerId);
    const customer = await this.userModel.findById(customerId);
    if (!customer) {
      this.logger.error(`${base} invalid customer id ${data.customerId}`);
      throw new BadRequestException('Invalid customer id');
    }

    const currencyId = new Types.ObjectId(data.currencyId);
    const currency = await this.currencyModel.findById(currencyId);
    if (!currency) {
      this.logger.error(`${base} invalid currency id ${data.currencyId}`);
      throw new BadRequestException('Invalid currency id');
    }

    const orderStatusDraft = OrderStatusEnum.DRAFT;
    const orderStatus = await this.orderStatusModel.findOne({
      orderStatusName: orderStatusDraft,
    });
    if (!orderStatus) {
      this.logger.error(
        `${base} order status ${orderStatusDraft} not found in database`,
      );
      throw new BadRequestException('Order status not found');
    }

    const existingOrder = await this.orderModel.findOne({
      customerId,
      orderStatusId: orderStatus._id,
    });
    if (existingOrder) {
      this.logger.error(
        `${base} this customer with id ${data.customerId} can only have one draft order at a time`,
      );
      throw new BadRequestException('A customer can only have one draft order');
    }

    await this.orderModel.findOneAndUpdate(
      { customerId, orderStatusId: orderStatus._id },
      {
        ...data,
        customerId,
        currencyId,
        orderStatusId: orderStatus._id,
        orderCode: await this.codeService.generateOrderReference(),
      },
      {
        context: { changedBy: new Types.ObjectId(this.req.user.userId) },
        upsert: true,
        returnDocument: 'after',
      } as never,
    );

    this.logger.log(
      `${base} has successfully created order for customer ${data.customerId}`,
    );
    return 'Order created successfully';
  }

  async findAll({ page, size, ...query }: FindOrderDto) {
    this.can('READ', 'Order');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const logBase = `[${platform}] ${phone}`;

    const whereClause: Record<string, unknown> = {};
    const customerId = query.customerId;
    if (customerId) whereClause['customerId'] = new Types.ObjectId(customerId);

    const pickupRequestId = query.pickupRequestId;
    if (pickupRequestId)
      whereClause['pickupRequestId'] = new Types.ObjectId(pickupRequestId);

    const orderStatusId = query.orderStatusId;
    if (orderStatusId)
      whereClause['orderStatusId'] = new Types.ObjectId(orderStatusId);

    const orderCode = query.orderCode;
    if (orderCode) whereClause['orderCode'] = orderCode;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);
    const total = await this.orderModel.countDocuments(whereClause);
    const data = await this.orderModel.aggregate([
      { $match: whereClause },
      { $sort: sort },
      { $skip: skip },
      { $limit: size },

      {
        $lookup: {
          as: 'orderStatus',
          foreignField: '_id',
          from: 'order_status',
          localField: 'orderStatusId',
        },
      },
      { $unwind: { path: '$orderStatus', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'order_item',
          localField: '_id',
          foreignField: 'orderId',
          as: 'orderItems',
          pipeline: [
            {
              $lookup: {
                from: 'item',
                localField: 'itemId',
                foreignField: '_id',
                as: 'item',
                pipeline: [
                  {
                    $lookup: {
                      from: 'service',
                      localField: 'serviceId',
                      foreignField: '_id',
                      as: 'service',
                    },
                  },
                  {
                    $unwind: {
                      path: '$service',
                      preserveNullAndEmptyArrays: true,
                    },
                  },

                  {
                    $lookup: {
                      from: 'service_type',
                      localField: 'serviceTypeId',
                      foreignField: '_id',
                      as: 'serviceType',
                    },
                  },
                  {
                    $unwind: {
                      path: '$serviceType',
                      preserveNullAndEmptyArrays: true,
                    },
                  },

                  {
                    $lookup: {
                      from: 'currency',
                      localField: 'currencyId',
                      foreignField: '_id',
                      as: 'currency',
                    },
                  },
                  {
                    $unwind: {
                      path: '$currency',
                      preserveNullAndEmptyArrays: true,
                    },
                  },
                ],
              },
            },
            {
              $unwind: {
                path: '$item',
                preserveNullAndEmptyArrays: true,
              },
            },
          ],
        },
      },
    ]);

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all items`);
    return { total, data, nextPage };
  }

  async createOrderItem(orderId: string, data: CreateOrderItemDto) {
    this.can('CREATE', 'OrderItem');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const order = await this.orderModel.findById(orderId);
    if (!order) {
      this.logger.error(`${base} invalid orderId ${orderId}`);
      throw new BadRequestException('The order Id provided is invalid');
    }

    // lookup draft status
    const draftStatus = await this.orderStatusModel.findOne({
      orderStatusName: OrderStatusEnum.DRAFT,
    });
    if (!draftStatus) {
      this.logger.error(`${base} draft order status not found`);
      throw new BadRequestException('Draft order status not configured');
    }

    if (order.orderStatusId.toString() !== draftStatus._id.toString()) {
      this.logger.error(
        `${base} cannot add item to order ${order.orderCode} because it is not in DRAFT status`,
      );
      throw new BadRequestException(
        'Can only add items to orders in draft status',
      );
    }

    const item = await this.itemModel.findById(data.itemId);
    if (!item) {
      this.logger.error(`${base} invalid itemId ${data.itemId}`);
      throw new BadRequestException('The provided item Id is invalid');
    }

    if (data.unitPrice < item.priceLow) {
      this.logger.error(
        `${base} unitPrice ${data.unitPrice} is lower than price low ${item.priceLow}`,
      );
      throw new BadRequestException(
        `Unit price cannot be lower than the min price for ${item.itemName}`,
      );
    }

    const orderItemExist = await this.orderItemModel.findOne({
      itemId: item._id,
      orderId: order._id,
    });
    if (orderItemExist) {
      this.logger.error(`${base} ${item.itemName} already exist on oder`);
      throw new BadRequestException(`${item.itemName} already exist on order`);
    }

    const userId = new Types.ObjectId(this.req.user.userId);
    await this.orderItemModel.findOneAndUpdate(
      { itemId: item._id, orderId: order._id },
      {
        itemId: item._id,
        orderId: order._id,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
      },
      {
        context: { changedBy: userId },
        upsert: true,
        returnDocument: 'after',
      } as never,
    );

    const baseAmount = data.unitPrice * data.quantity;
    const orderAmount = baseAmount + order.orderAmount;
    const totalAmount = baseAmount + order.fee - order.discountAmount;
    await this.orderModel.findOneAndUpdate(
      { _id: order._id },
      { orderAmount, totalAmount },
      {
        context: { changedBy: userId },
        upsert: true,
        returnDocument: 'after',
      } as never,
    );

    this.logger.log(
      `${base} has successfully created order item for order with code ${order.orderCode}`,
    );
    return `${item.itemName} added successfully`;
  }

  async updateOrderItem(params: OrderItemParamsDto, data: UpdateOrderItemDto) {
    this.can('UPDATE', 'OrderItem');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const orderId = new Types.ObjectId(params.orderId);
    const order = await this.orderModel.findById(orderId);
    if (!order) {
      this.logger.error(`${base} invalid orderId ${params.orderId}`);
      throw new BadRequestException('Invalid orderid');
    }

    // lookup draft status
    const draftStatus = await this.orderStatusModel.findOne({
      orderStatusName: OrderStatusEnum.DRAFT,
    });
    if (!draftStatus) {
      this.logger.error(`${base} draft order status not found`);
      throw new BadRequestException('Draft order status not configured');
    }

    if (order.orderStatusId.toString() !== draftStatus._id.toString()) {
      this.logger.error(
        `${base} cannot update item to order ${order.orderCode} because it is not in DRAFT status`,
      );
      throw new BadRequestException(
        'Can only update items to orders in draft status',
      );
    }

    const itemId = new Types.ObjectId(params.itemId);
    const item = await this.itemModel.findById(itemId);
    if (!item) {
      this.logger.error(`${base} invalid itemId ${params.itemId}`);
      throw new BadRequestException('Invalid itemId');
    }

    const orderItem = await this.orderItemModel.findOne({ itemId, orderId });
    if (!orderItem) {
      this.logger.error(
        `${base} not record found for orderId ${params.orderId} and itemId ${params.itemId}`,
      );
      throw new NotFoundException(
        `${item.itemName} is not part of this order. Please refresh the list`,
      );
    }

    const userId = new Types.ObjectId(this.req.user.userId);
    const updatedItem = (await this.orderItemModel.findOneAndUpdate(
      { itemId, orderId },
      data,
      { context: { changedBy: userId }, returnDocument: 'after' } as never,
    )) as unknown as OrderItem | null;

    if (!updatedItem) {
      throw new NotFoundException('Order item update failed');
    }

    const oldPrice = orderItem.unitPrice * orderItem.quantity;
    const newPrice = updatedItem.unitPrice * updatedItem.quantity;

    const orderAmount = order.orderAmount - oldPrice + newPrice;
    const totalAmount = orderAmount + order.fee - order.discountAmount;
    await this.orderModel.findOneAndUpdate(
      { _id: order._id },
      { orderAmount, totalAmount },
      {
        context: { changedBy: userId },
        upsert: true,
        returnDocument: 'after',
      } as never,
    );

    this.logger.log(`${base} ${item.itemName} updated successfully`);
    return `${item.itemName} updated successfully`;
  }

  async deleteOrderItem(params: OrderItemParamsDto) {
    this.can('DELETE', 'OrderItem');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const orderId = new Types.ObjectId(params.orderId);
    const order = await this.orderModel.findById(orderId);
    if (!order) {
      this.logger.error(`${base} invalid orderId ${params.orderId}`);
      throw new BadRequestException('Invalid orderid');
    }

    const itemId = new Types.ObjectId(params.itemId);
    const item = await this.itemModel.findById(itemId);
    if (!item) {
      this.logger.error(`${base} invalid itemId ${params.itemId}`);
      throw new BadRequestException('Invalid itemId');
    }

    const orderItem = await this.orderItemModel.findOne({ itemId, orderId });
    if (!orderItem) {
      this.logger.error(
        `${base} not record found for orderId ${params.orderId} and itemId ${params.itemId}`,
      );
      throw new NotFoundException(
        `${item.itemName} is not part of this order. Please refresh the list`,
      );
    }

    // lookup draft status
    const draftStatus = await this.orderStatusModel.findOne({
      orderStatusName: OrderStatusEnum.DRAFT,
    });
    if (!draftStatus) {
      this.logger.error(`${base} draft order status not found`);
      throw new BadRequestException('Draft order status not configured');
    }

    if (order.orderStatusId.toString() !== draftStatus._id.toString()) {
      this.logger.error(
        `${base} cannot delete item to order ${order.orderCode} because it is not in DRAFT status`,
      );
      throw new BadRequestException(
        'Can only delete items to orders in draft status',
      );
    }

    const userId = new Types.ObjectId(this.req.user.userId);
    await this.orderItemModel.findOneAndDelete({ itemId, orderId }, {
      context: { changedBy: userId },
      upsert: true,
      returnDocument: 'after',
    } as never);

    const deletedPrice = orderItem.unitPrice * orderItem.quantity;
    const orderAmount = order.orderAmount - deletedPrice;
    const totalAmount = orderAmount + order.fee - order.discountAmount;
    await this.orderModel.findOneAndUpdate(
      { _id: order._id },
      { orderAmount, totalAmount },
      {
        context: { changedBy: userId },
        upsert: true,
        returnDocument: 'after',
      } as never,
    );

    this.logger.log(
      `${base} has successfully deleted order item for order with code ${order.orderCode}`,
    );
    return `${item.itemName} deleted successfully`;
  }

  /**
   * Single guarded status transition. Rejects any move not permitted by
   * LEGAL_TRANSITIONS with INVALID_STATUS_TRANSITION, runs status-specific
   * preconditions, mirrors the pickup side effects, and emits
   * order.status_changed. All the per-action methods below delegate here.
   */
  private async transition(
    orderId: string,
    target: OrderStatusEnum,
    action: CaslActionsDto = 'UPDATE',
  ) {
    this.can(action, 'Order');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const order = await this.orderModel
      .findById(new Types.ObjectId(orderId))
      .populate<{ orderStatusId: OrderStatus }>({
        model: OrderStatus.name,
        path: 'orderStatusId',
      });
    if (!order) {
      this.logger.error(`${base} invalid orderId ${orderId}`);
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Order not found',
      });
    }

    const current = order.orderStatusId.orderStatusName as OrderStatusEnum;
    if (!(LEGAL_TRANSITIONS[current] ?? []).includes(target)) {
      this.logger.error(
        `${base} illegal transition ${current}->${target} for ${order.orderCode}`,
      );
      throw new ConflictException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `An order cannot move from ${current} to ${target}`,
      });
    }

    // Precondition: an order must have at least one item to be confirmed.
    if (target === OrderStatusEnum.CONFIRMED) {
      const itemCount = await this.orderItemModel.countDocuments({
        orderId: order._id,
      });
      if (!itemCount) {
        this.logger.error(`${base} order ${order.orderCode} has no items`);
        throw new BadRequestException({
          code: 'ORDER_EMPTY',
          message: 'Order must contain at least one item before confirmation',
        });
      }
    }

    const targetStatus = await this.orderStatusModel.findOne({
      orderStatusName: target,
    });
    if (!targetStatus) {
      this.logger.error(`${base} ${target} order status not found`);
      throw new BadRequestException(`${target} order status not configured`);
    }

    const userId = new Types.ObjectId(this.req.user.userId);
    await this.orderModel.findOneAndUpdate(
      { _id: order._id },
      { orderStatusId: targetStatus._id },
      { context: { changedBy: userId }, returnDocument: 'after' } as never,
    );

    await this.syncPickupOnTransition(order.pickupRequestId, target, userId);

    const event: OrderStatusChangedEvent = {
      orderId: order._id,
      from: current,
      to: target,
      changedBy: userId,
    };
    this.eventEmitter.emit(OrderEvents.statusChanged, event);

    this.logger.log(`${base} order ${order.orderCode} ${current}->${target}`);
  }

  /** Keep the linked pickup request in step with the order's lifecycle. */
  private async syncPickupOnTransition(
    pickupRequestId: Types.ObjectId | undefined,
    target: OrderStatusEnum,
    userId: Types.ObjectId,
  ) {
    if (!pickupRequestId) return;

    if (target === OrderStatusEnum.CONFIRMED) {
      const [pickedUp, assigned] = await Promise.all([
        this.pickupStatusModel.findOne({
          pickupStatusName: PickupStatusEnum.PICKED_UP,
        }),
        this.pickupStatusModel.findOne({
          pickupStatusName: PickupStatusEnum.ASSIGNED,
        }),
      ]);
      await this.pickupRequestModel.findOneAndUpdate(
        { _id: pickupRequestId, pickupStatusId: assigned?._id },
        { pickupStatusId: pickedUp?._id },
        { context: { changedBy: userId }, returnDocument: 'after' } as never,
      );
      return;
    }

    if (target === OrderStatusEnum.CANCELLED) {
      const cancelled = await this.pickupStatusModel.findOne({
        pickupStatusName: PickupStatusEnum.CANCELLED,
      });
      if (cancelled) {
        await this.pickupRequestModel.findOneAndUpdate(
          { _id: pickupRequestId },
          { pickupStatusId: cancelled._id },
          { context: { changedBy: userId }, returnDocument: 'after' } as never,
        );
      }
    }
  }

  async confirmOrder(orderId: string) {
    await this.transition(orderId, OrderStatusEnum.CONFIRMED, 'CONFIRM');
    return 'Order confirmed successfully';
  }

  async receiveOrder(orderId: string) {
    await this.transition(orderId, OrderStatusEnum.RECEIVED);
    return 'Order received successfully';
  }

  async washOrder(orderId: string) {
    await this.transition(orderId, OrderStatusEnum.WASHING);
    return 'Order is now being washed';
  }

  async readyOrder(orderId: string) {
    await this.transition(orderId, OrderStatusEnum.READY);
    return 'Order is ready for delivery';
  }

  async deliverOrder(orderId: string) {
    await this.transition(orderId, OrderStatusEnum.DELIVERED);
    return 'Order delivered successfully';
  }

  async cancelOrder(orderId: string) {
    await this.transition(orderId, OrderStatusEnum.CANCELLED);
    return 'Order cancelled successfully';
  }
}
