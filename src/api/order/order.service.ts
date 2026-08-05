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
import { Model, PipelineStage, Types } from 'mongoose';
import { Workbook } from 'exceljs';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { scopeFilter, scopePermitsCustomer } from 'src/helper/casl/casl-scope';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Currency } from 'src/schema/catalog/currency.schema';
import { Item } from 'src/schema/catalog/item.schema';
import { OrderItem } from 'src/schema/order/order-item.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import {
  OrderItemConditionEnum,
  OrderStatusEnum,
  PricingModelEnum,
} from 'src/schema/order/order.dto';
import { Order } from 'src/schema/order/order.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { User } from 'src/schema/user/user.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { PromoCode } from 'src/schema/promo/promo-code.schema';
import { PromoCodeUsage } from 'src/schema/promo/promo-code-usage.schema';
import { Subscription } from 'src/schema/subscription/subscription.schema';
import { type PaginationDto } from 'src/dto/request-data.dto';
import { PricingService } from '../pricing/pricing.service';
import { CreateOrderItemDto } from './dto/create-order-item.dto';
import {
  CreateOrderDto,
  CreateOrderWithPickupDto,
} from './dto/create-order.dto';
import { UpdateOrderDraftDto } from './dto/update-order-draft.dto';
import { FindOrderDto } from './dto/find-order.dto';
import { ExportOrderDto, OrderExportFormatEnum } from './dto/export-order.dto';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { PickupStatusEnum } from 'src/schema/pickup/pickup.dto';
import {
  OrderItemParamsDto,
  UpdateOrderItemDto,
} from './dto/update-order-item.dto';
import {
  OrderEvents,
  type OrderCreatedEvent,
  type OrderStatusChangedEvent,
} from './order.events';

/**
 * Allow-list of non-sensitive User fields for any user joined into an order
 * (customer, creator, pickup agent). passwordHash / any secret is never
 * projected — never switch this to an exclusion projection.
 */
const SAFE_USER_PROJECTION = {
  firstName: 1,
  lastName: 1,
  phone: 1,
  whatsappPhone: 1,
  email: 1,
  gender: 1,
  preferredLanguage: 1,
  isActive: 1,
  userTypeId: 1,
} as const;

// One flat row per order for the CSV/Excel export.
interface OrderExportRow {
  orderCode: string;
  customerName: string;
  customerPhone: string;
  office: string;
  status: string;
  paymentStatus: string;
  receivedAt: Date | null;
  estimatedDeliveryDate: Date | null;
  deliveredAt: Date | null;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  createdBy: string;
  pickedUpBy: string;
  createdAt: string;
  updatedAt: string;
}

// Column order + headers, shared by both CSV and Excel so the two formats stay
// identical. `key` maps to a field on OrderExportRow.
const ORDER_EXPORT_COLUMNS: { header: string; key: keyof OrderExportRow }[] = [
  { header: 'Order Code', key: 'orderCode' },
  { header: 'Customer', key: 'customerName' },
  { header: 'Phone', key: 'customerPhone' },
  { header: 'Office', key: 'office' },
  { header: 'Status', key: 'status' },
  { header: 'Payment Status', key: 'paymentStatus' },
  { header: 'Received At', key: 'receivedAt' },
  { header: 'Estimated Delivery', key: 'estimatedDeliveryDate' },
  { header: 'Delivered At', key: 'deliveredAt' },
  { header: 'Total Amount', key: 'totalAmount' },
  { header: 'Amount Paid', key: 'amountPaid' },
  { header: 'Balance Due', key: 'balanceDue' },
  { header: 'Created By', key: 'createdBy' },
  { header: 'Picked Up By', key: 'pickedUpBy' },
  { header: 'Created At', key: 'createdAt' },
  { header: 'Updated At', key: 'updatedAt' },
];

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

    @InjectModel(Customer.name)
    private readonly customerModel: Model<Customer>,

    @InjectModel(PromoCode.name)
    private readonly promoCodeModel: Model<PromoCode>,

    @InjectModel(PromoCodeUsage.name)
    private readonly promoUsageModel: Model<PromoCodeUsage>,

    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<Subscription>,

    private readonly pricingService: PricingService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Recompute the order's price snapshot from its current inputs (items, weight,
   * manual discount, promo) via the pricing engine and write it onto the order +
   * its lines. PURE snapshot — NO side effects: it must never touch subscription
   * remainingQuota or write PromoCodeUsage (those happen once, at confirm),
   * otherwise repeated draft edits would over-decrement quota and burn promo
   * uses. Called after every draft mutation so the snapshot never drifts.
   */
  private async reprice(orderId: Types.ObjectId, changedBy: Types.ObjectId) {
    const order = await this.orderModel.findById(orderId);
    if (!order) return;

    const items = await this.orderItemModel.find({ orderId });
    const pricing = await this.pricingService.priceOrder({
      pricingModel: order.pricingModel,
      officeId: this.req.data.officeId?.toString(),
      customerId: order.customerId.toString(),
      totalWeightKg: order.totalWeightKg,
      promoCode: order.promoCode,
      manualDiscount: order.manualDiscount,
      items: items.map((i) => ({
        itemId: i.itemId.toString(),
        serviceTypeId: i.serviceTypeId.toString(),
        quantity: i.quantity,
      })),
    });

    // Snapshot resolved unitPrice/lineTotal onto each line (Per Piece prices;
    // other models keep them at 0). Order of pricing.lines matches items.
    await Promise.all(
      items.map((item, idx) =>
        this.orderItemModel.updateOne(
          { _id: item._id },
          {
            unitPrice: pricing.lines[idx]?.unitPrice ?? 0,
            lineTotal: pricing.lines[idx]?.lineTotal ?? 0,
          },
        ),
      ),
    );

    const combinedDiscount = pricing.manualDiscount + pricing.promoDiscount;
    // Reward redemption is applied transactionally by the redeem path and is
    // NOT a pricing input — preserve it on top of the fresh snapshot (floored
    // at 0 if a draft edit shrank the subtotal below the redeemed amount).
    // ?? 0: pre-Phase-3 orders have no rewardDiscount field.
    const totalAmount = Math.max(
      0,
      pricing.total - (order.rewardDiscount ?? 0),
    );
    await this.orderModel.findOneAndUpdate(
      { _id: orderId },
      {
        orderAmount: pricing.subtotal,
        manualDiscount: pricing.manualDiscount,
        promoDiscount: pricing.promoDiscount,
        discountAmount: combinedDiscount,
        totalAmount,
        promoCodeId: pricing.promoCodeId ?? null,
        subscriptionId: pricing.subscriptionId ?? null,
        quotaConsumed: pricing.quotaConsumed,
        balanceDue: Math.max(0, totalAmount - order.amountPaid),
      },
      { context: { changedBy }, returnDocument: 'after' } as never,
    );
  }

  /**
   * Apply the one-time side effects of confirming an order: decrement the
   * subscription's remainingQuota by the snapshotted quotaConsumed and record
   * the promo redemption. Runs exactly once because the transition guard only
   * permits DRAFT→CONFIRMED (a confirmed order can't be re-confirmed).
   */
  private async finalizeOnConfirm(order: Order) {
    if (order.subscriptionId && order.quotaConsumed > 0) {
      await this.subscriptionModel.updateOne(
        { _id: order.subscriptionId },
        { $inc: { remainingQuota: -order.quotaConsumed } },
      );
    }

    if (order.promoCodeId) {
      await this.promoUsageModel.create({
        promoCodeId: order.promoCodeId,
        userId: order.customerId,
        orderId: order._id,
        discountApplied: order.promoDiscount,
        useAt: new Date(),
      });
      await this.promoCodeModel.updateOne(
        { _id: order.promoCodeId },
        { $inc: { usedCount: 1 } },
      );
    }
  }

  /** Update draft-only inputs (weight/manualDiscount/promo) and reprice. */
  async updateOrderDraft(orderId: string, data: UpdateOrderDraftDto) {
    this.can('UPDATE', 'Order');
    const id = new Types.ObjectId(orderId);
    const changedBy = new Types.ObjectId(this.req.user.userId);

    const order = await this.orderModel
      .findOne({ _id: id, ...this.orderScope('UPDATE') })
      .populate<{ orderStatusId: OrderStatus }>({
        model: OrderStatus.name,
        path: 'orderStatusId',
      });
    if (!order) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Order not found',
      });
    }
    const current = order.orderStatusId.orderStatusName as OrderStatusEnum;
    if (current !== OrderStatusEnum.DRAFT) {
      throw new BadRequestException({
        code: 'ORDER_NOT_DRAFT',
        message: 'Only draft orders can be edited',
      });
    }

    // manualDiscount is permissioned separately from ordinary edits.
    if (data.manualDiscount !== undefined) this.can('UPDATE', 'Payment');

    const update: Record<string, unknown> = {};
    if (data.totalWeightKg !== undefined)
      update.totalWeightKg = data.totalWeightKg;
    if (data.manualDiscount !== undefined)
      update.manualDiscount = data.manualDiscount;
    if (data.promoCode !== undefined) update.promoCode = data.promoCode;

    await this.orderModel.updateOne({ _id: id }, update);
    await this.reprice(id, changedBy);
    return 'Order updated successfully';
  }

  /**
   * On order creation: bump the customer's lastOrderAt rollup and emit
   * order.created. totalOrders/totalSpend mature on order paid (§3.6).
   */
  private async onOrderCreated(
    orderId: Types.ObjectId,
    customerId: Types.ObjectId,
    changedBy: Types.ObjectId,
  ) {
    await this.customerModel.findOneAndUpdate(
      { userId: customerId },
      { lastOrderAt: new Date() },
      { context: { changedBy } } as never,
    );

    const event: OrderCreatedEvent = { orderId, customerId, changedBy };
    this.eventEmitter.emit(OrderEvents.created, event);
  }

  async findFlagged({ page, size }: PaginationDto) {
    this.can('READ', 'Order');

    const where = { flagged: true };
    const skip = (page - 1) * size;
    const total = await this.orderModel.countDocuments(where);
    const data = await this.orderModel
      .find(where)
      // Outstanding by amount, then oldest first.
      .sort({ balanceDue: -1, createdAt: 1 })
      .skip(skip)
      .limit(size)
      .populate({ model: OrderStatus.name, path: 'orderStatusId' });

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;
    return { total, data, nextPage };
  }

  private can(action: CaslActionsDto, subject: CaslSubjectsDto) {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;

    if (!ability.can(action, subject)) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} ${log} is`);
      throw new BadRequestException(`You are ${log}`);
    }
  }

  /**
   * Office/self scope filter for by-id Order fetches — so a non-global staff
   * user can't read/mutate another office's order by supplying its id (the
   * record simply isn't found). OrderItem ops scope through their parent order.
   */
  private orderScope(action: CaslActionsDto): Record<string, unknown> {
    return scopeFilter(this.req.user.ability, action, 'Order');
  }

  async createOrderWithPickup(data: CreateOrderWithPickupDto) {
    this.can('CREATE', 'Order');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const customerId = new Types.ObjectId(data.customerId);
    this.assertCreateScope(customerId, base);
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

    this.assertWeightForModel(data.pricingModel, data.totalWeightKg);

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

    const userId = new Types.ObjectId(this.req.user.userId);
    const pickedUpBy = await this.resolvePickedUpBy(
      data.pickedUpBy,
      userId,
      base,
    );
    const created = (await this.orderModel.findOneAndUpdate(
      { customerId: customerId, pickupRequestId: pickupRequestId },
      {
        ...data,
        customerId,
        currencyId,
        pickupRequestId,
        officeId: this.req.data.officeId,
        orderStatusId: orderStatus._id,
        orderCode: await this.codeService.generateOrderReference(),
        createdBy: userId,
        pickedUpBy,
      },
      {
        context: { changedBy: userId },
        upsert: true,
        returnDocument: 'after',
      } as never,
    )) as unknown as Order;

    await this.reprice(created._id, userId);
    await this.onOrderCreated(created._id, customerId, userId);

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
    this.assertCreateScope(customerId, base);
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

    this.assertWeightForModel(data.pricingModel, data.totalWeightKg);

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

    const userId = new Types.ObjectId(this.req.user.userId);
    const pickedUpBy = await this.resolvePickedUpBy(
      data.pickedUpBy,
      userId,
      base,
    );
    const created = (await this.orderModel.findOneAndUpdate(
      { customerId, orderStatusId: orderStatus._id },
      {
        ...data,
        customerId,
        currencyId,
        officeId: this.req.data.officeId,
        orderStatusId: orderStatus._id,
        orderCode: await this.codeService.generateOrderReference(),
        createdBy: userId,
        pickedUpBy,
      },
      {
        context: { changedBy: userId },
        upsert: true,
        returnDocument: 'after',
      } as never,
    )) as unknown as Order;

    await this.reprice(created._id, userId);
    await this.onOrderCreated(created._id, customerId, userId);

    this.logger.log(
      `${base} has successfully created order for customer ${data.customerId}`,
    );
    return 'Order created successfully';
  }

  /**
   * Creation-time self-scope (§2.3 booking): a customer's CREATE Order rule
   * carries { customerId: '$self' } — they can only ever book for themselves,
   * whatever customerId the client sends. Staff rules are unconditioned.
   */
  private assertCreateScope(customerId: Types.ObjectId, logBase: string) {
    if (
      !scopePermitsCustomer(
        this.req.user.ability,
        'CREATE',
        'Order',
        customerId,
      )
    ) {
      this.logger.error(
        `${logBase} tried to create an order for out-of-scope customer ${customerId.toString()}`,
      );
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Customer not found',
      });
    }
  }

  /**
   * Resolve the pickup agent. Optional at creation — defaults to the creator
   * when omitted; when supplied it must reference a real user.
   */
  private async resolvePickedUpBy(
    pickedUpBy: string | undefined,
    fallback: Types.ObjectId,
    logBase: string,
  ): Promise<Types.ObjectId> {
    if (!pickedUpBy) return fallback;
    const id = new Types.ObjectId(pickedUpBy);
    const exists = await this.userModel.exists({ _id: id });
    if (!exists) {
      this.logger.error(`${logBase} invalid pickedUpBy ${pickedUpBy}`);
      throw new BadRequestException({
        code: 'INVALID_PICKUP_AGENT',
        message: 'Invalid pickup agent (pickedUpBy) user id',
      });
    }
    return id;
  }

  /** PER_KG needs a positive weight (else it silently prices to 0). */
  private assertWeightForModel(model: PricingModelEnum, weight?: number) {
    if (model === PricingModelEnum.PER_KG && (!weight || weight <= 0)) {
      throw new BadRequestException({
        code: 'WEIGHT_REQUIRED',
        message: 'A total weight (kg) is required for Per KG pricing',
      });
    }
  }

  // Builds the shared aggregation filter stages from the query params so the
  // list, its counts, and the CSV/Excel export all match on the exact same set.
  // `filterStages` covers customer/office joins + date window + keyword; the
  // status filter is returned separately (`statusStages`) so the per-status
  // breakdown can span every status while the list still narrows to one.
  private async buildOrderFilterStages(
    query: Omit<FindOrderDto, 'page' | 'size' | 'sort'>,
  ): Promise<{ filterStages: PipelineStage[]; statusStages: PipelineStage[] }> {
    const whereClause: Record<string, unknown> = {};
    const customerId = query.customerId;
    if (customerId) whereClause['customerId'] = new Types.ObjectId(customerId);

    const pickupRequestId = query.pickupRequestId;
    if (pickupRequestId)
      whereClause['pickupRequestId'] = new Types.ObjectId(pickupRequestId);

    // Filter by status name (not id): resolve the name to its id. Kept OUT of
    // whereClause so the byOrderStatus breakdown can span every status (the
    // status filter only narrows the list + total, not the facet counts).
    // An unknown name yields a non-existent id so the list comes back empty.
    const statusStages: PipelineStage[] = [];
    if (query.orderStatus) {
      const status = await this.orderStatusModel
        .findOne({ orderStatusName: query.orderStatus })
        .select('_id')
        .lean();
      statusStages.push({
        $match: { orderStatusId: status?._id ?? new Types.ObjectId() },
      });
    }

    const orderCode = query.orderCode;
    if (orderCode) whereClause['orderCode'] = orderCode;

    // Received-date window. Both bounds are optional; with neither we default
    // to the last 30 days so the list never does an unbounded scan.
    const now = new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const endDate = query.endDate ? new Date(query.endDate) : now;
    whereClause['receivedAt'] = { $gte: startDate, $lte: endDate };

    // Auto-scope: office staff see their office's orders; a customer sees only
    // their own (via the seeded CASL conditions), enforced as a query filter.
    const scope = scopeFilter(this.req.user.ability, 'READ', 'Order');
    const baseMatch = { ...whereClause, ...scope };

    // Customer join runs BEFORE the keyword filter so free-text can match the
    // customer's phone/name too. Allow-list projection — passwordHash / any
    // secret is never returned; never switch to an exclusion projection.
    const customerLookup: PipelineStage[] = [
      {
        $lookup: {
          from: 'user',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer',
          pipeline: [{ $project: SAFE_USER_PROJECTION }],
        },
      },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    ];

    // Office join also runs before the keyword filter so free-text can match
    // the office name/code. Allow-list projection — the signedLink carries an
    // HMAC and must never be exposed here.
    const officeLookup: PipelineStage[] = [
      {
        $lookup: {
          as: 'office',
          from: 'office',
          foreignField: '_id',
          localField: 'officeId',
          pipeline: [
            {
              $project: {
                officeTypeId: 1,
                officeName: 1,
                officeCode: 1,
                slug: 1,
                address: 1,
                city: 1,
                region: 1,
                isActive: 1,
              },
            },
          ],
        },
      },
      { $unwind: { path: '$office', preserveNullAndEmptyArrays: true } },
    ];

    // Filter stages shared by the count and the data query so paging is exact.
    const filterStages: PipelineStage[] = [
      { $match: baseMatch },
      ...customerLookup,
      ...officeLookup,
    ];

    if (query.keyword?.trim()) {
      const escaped = query.keyword
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      filterStages.push({
        $match: {
          $or: [
            { orderCode: rx },
            { 'customer.phone': rx },
            { 'customer.whatsappPhone': rx },
            { 'customer.firstName': rx },
            { 'customer.lastName': rx },
            { 'office.officeName': rx },
            { 'office.officeCode': rx },
            // Full "first last" name search.
            {
              $expr: {
                $regexMatch: {
                  input: {
                    $concat: [
                      { $ifNull: ['$customer.firstName', ''] },
                      ' ',
                      { $ifNull: ['$customer.lastName', ''] },
                    ],
                  },
                  regex: escaped,
                  options: 'i',
                },
              },
            },
          ],
        },
      });
    }

    return { filterStages, statusStages };
  }

  async findAll({ page, size, ...query }: FindOrderDto) {
    this.can('READ', 'Order');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const logBase = `[${platform}] ${phone}`;

    const { filterStages, statusStages } =
      await this.buildOrderFilterStages(query);

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const countResult = await this.orderModel.aggregate<{ total: number }>([
      ...filterStages,
      ...statusStages,
      { $count: 'total' },
    ]);
    const total = countResult[0]?.total ?? 0;

    // Per-status breakdown over the same filters (date range / keyword /
    // customer / office scope) but WITHOUT the status filter, so every bucket
    // stays meaningful. `all` is the sum across statuses.
    const statusCounts = await this.orderModel.aggregate<{
      _id: string | null;
      count: number;
    }>([
      ...filterStages,
      {
        $lookup: {
          as: 'os',
          from: 'order_status',
          localField: 'orderStatusId',
          foreignField: '_id',
          pipeline: [{ $project: { orderStatusName: 1 } }],
        },
      },
      { $unwind: { path: '$os', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$os.orderStatusName', count: { $sum: 1 } } },
    ]);

    const byOrderStatus: Record<string, number> = {
      all: 0,
      draft: 0,
      confirmed: 0,
      received: 0,
      washing: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
    };
    for (const row of statusCounts) {
      const key = row._id?.toLowerCase();
      if (key && key in byOrderStatus) byOrderStatus[key] += row.count;
      byOrderStatus.all += row.count;
    }

    const data = await this.orderModel.aggregate([
      ...filterStages,
      ...statusStages,
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

      // Attach the order's currency — only the useful display fields.
      {
        $lookup: {
          as: 'currency',
          from: 'currency',
          foreignField: '_id',
          localField: 'currencyId',
          pipeline: [
            {
              $project: {
                isoCode: 1,
                name: 1,
                symbol: 1,
                numericCode: 1,
                decimalPlaces: 1,
              },
            },
          ],
        },
      },
      { $unwind: { path: '$currency', preserveNullAndEmptyArrays: true } },

      // The order's creator and pickup agent (both Users). Same allow-list as
      // the customer — passwordHash / any secret is never returned.
      {
        $lookup: {
          as: 'createdByUser',
          from: 'user',
          foreignField: '_id',
          localField: 'createdBy',
          pipeline: [{ $project: SAFE_USER_PROJECTION }],
        },
      },
      { $unwind: { path: '$createdByUser', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'pickedUpByUser',
          from: 'user',
          foreignField: '_id',
          localField: 'pickedUpBy',
          pipeline: [{ $project: SAFE_USER_PROJECTION }],
        },
      },
      {
        $unwind: { path: '$pickedUpByUser', preserveNullAndEmptyArrays: true },
      },

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
    return { total, byOrderStatus, data, nextPage };
  }

  // Export the filtered orders (same params as findAll, no pagination) as a
  // CSV or Excel file. Returns the raw bytes + filename + content-type; the
  // controller streams them as an attachment.
  async exportOrders({ format, ...query }: ExportOrderDto): Promise<{
    buffer: Buffer;
    filename: string;
    contentType: string;
  }> {
    // Bulk export is gated on its own EXPORT action (not READ) so it can be
    // restricted to reporting/oversight roles. The rows are still office/self
    // scoped by buildOrderFilterStages via the READ conditions.
    this.can('EXPORT', 'Order');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const logBase = `[${platform}] ${phone}`;

    const { filterStages, statusStages } =
      await this.buildOrderFilterStages(query);

    const rows = await this.orderModel.aggregate<OrderExportRow>([
      ...filterStages,
      ...statusStages,
      {
        $lookup: {
          as: 'orderStatus',
          from: 'order_status',
          localField: 'orderStatusId',
          foreignField: '_id',
          pipeline: [{ $project: { orderStatusName: 1 } }],
        },
      },
      { $unwind: { path: '$orderStatus', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          as: 'createdByUser',
          from: 'user',
          localField: 'createdBy',
          foreignField: '_id',
          pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
        },
      },
      { $unwind: { path: '$createdByUser', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          as: 'pickedUpByUser',
          from: 'user',
          localField: 'pickedUpBy',
          foreignField: '_id',
          pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
        },
      },
      {
        $unwind: { path: '$pickedUpByUser', preserveNullAndEmptyArrays: true },
      },
      { $sort: { receivedAt: -1 } },
      {
        $project: {
          _id: 0,
          orderCode: 1,
          customerName: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ['$customer.firstName', ''] },
                  ' ',
                  { $ifNull: ['$customer.lastName', ''] },
                ],
              },
            },
          },
          customerPhone: { $ifNull: ['$customer.phone', ''] },
          office: { $ifNull: ['$office.officeName', ''] },
          status: { $ifNull: ['$orderStatus.orderStatusName', ''] },
          paymentStatus: { $ifNull: ['$paymentStatus', ''] },
          receivedAt: { $ifNull: ['$receivedAt', null] },
          estimatedDeliveryDate: { $ifNull: ['$estimatedDeliveryDate', null] },
          deliveredAt: { $ifNull: ['$deliveredAt', null] },
          totalAmount: { $ifNull: ['$totalAmount', 0] },
          amountPaid: { $ifNull: ['$amountPaid', 0] },
          balanceDue: { $ifNull: ['$balanceDue', 0] },
          createdBy: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ['$createdByUser.firstName', ''] },
                  ' ',
                  { $ifNull: ['$createdByUser.lastName', ''] },
                ],
              },
            },
          },
          pickedUpBy: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ['$pickedUpByUser.firstName', ''] },
                  ' ',
                  { $ifNull: ['$pickedUpByUser.lastName', ''] },
                ],
              },
            },
          },
          // System audit timestamps — full precision (date + time), unlike the
          // business date columns which are day-granular.
          createdAt: {
            $dateToString: {
              date: '$createdAt',
              format: '%Y-%m-%d %H:%M:%S',
              onNull: '',
            },
          },
          updatedAt: {
            $dateToString: {
              date: '$updatedAt',
              format: '%Y-%m-%d %H:%M:%S',
              onNull: '',
            },
          },
        },
      },
    ]);

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    let result: { buffer: Buffer; filename: string; contentType: string };
    if (format === OrderExportFormatEnum.EXCEL) {
      result = {
        buffer: await this.buildOrdersExcel(rows),
        filename: `orders-export-${stamp}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    } else {
      result = {
        buffer: this.buildOrdersCsv(rows),
        filename: `orders-export-${stamp}.csv`,
        contentType: 'text/csv',
      };
    }

    this.logger.log(`${logBase} exported ${rows.length} orders as ${format}`);
    return result;
  }

  // Renders one export cell: dates as YYYY-MM-DD, null/undefined as empty.
  private formatExportCell(
    value: OrderExportRow[keyof OrderExportRow],
  ): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value);
  }

  private buildOrdersCsv(rows: OrderExportRow[]): Buffer {
    // RFC-4180 escaping: wrap in quotes and double any embedded quote.
    const escape = (value: string): string => `"${value.replace(/"/g, '""')}"`;
    const lines = [
      ORDER_EXPORT_COLUMNS.map((c) => escape(c.header)).join(','),
      ...rows.map((row) =>
        ORDER_EXPORT_COLUMNS.map((c) =>
          escape(this.formatExportCell(row[c.key])),
        ).join(','),
      ),
    ];
    // Leading BOM so Excel opens UTF-8 (accented names) correctly.
    return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
  }

  private async buildOrdersExcel(rows: OrderExportRow[]): Promise<Buffer> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Orders');
    sheet.columns = ORDER_EXPORT_COLUMNS.map((c) => ({
      header: c.header,
      key: c.key,
      width: 18,
    }));
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) {
      sheet.addRow(
        ORDER_EXPORT_COLUMNS.reduce<Record<string, string>>((acc, c) => {
          acc[c.key] = this.formatExportCell(row[c.key]);
          return acc;
        }, {}),
      );
    }
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  async createOrderItem(orderId: string, data: CreateOrderItemDto) {
    this.can('CREATE', 'OrderItem');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(orderId),
      ...this.orderScope('UPDATE'),
    });
    if (!order) {
      this.logger.error(`${base} invalid/out-of-scope orderId ${orderId}`);
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Order not found',
      });
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

    const userId = new Types.ObjectId(this.req.user.userId);
    // Per-garment row: the same item may appear multiple times in one order with
    // different condition/colour, so we insert rather than upsert-by-(orderId,
    // itemId). unitPrice/lineTotal are NOT taken from the client — reprice()
    // resolves them server-side from the catalog and snapshots them.
    const orderItem = new this.orderItemModel({
      itemId: item._id,
      orderId: order._id,
      serviceTypeId: new Types.ObjectId(data.serviceTypeId),
      quantity: data.quantity,
      unitPrice: 0,
      lineTotal: 0,
      condition: data.condition ?? OrderItemConditionEnum.NORMAL,
      colour: data.colour,
    });
    orderItem.$locals.changedBy = userId;
    await orderItem.save();

    await this.reprice(order._id, userId);

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
    const order = await this.orderModel.findOne({
      _id: orderId,
      ...this.orderScope('UPDATE'),
    });
    if (!order) {
      this.logger.error(
        `${base} invalid/out-of-scope orderId ${params.orderId}`,
      );
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Order not found',
      });
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

    // Target the specific per-garment row by its own id (not the catalog itemId,
    // which several rows may share).
    const orderItemId = new Types.ObjectId(params.orderItemId);
    const orderItem = await this.orderItemModel.findOne({
      _id: orderItemId,
      orderId,
    });
    if (!orderItem) {
      this.logger.error(
        `${base} no order item ${params.orderItemId} on order ${params.orderId}`,
      );
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'This item is not part of this order. Please refresh the list',
      });
    }

    const update: Record<string, unknown> = { ...data };
    if (data.serviceTypeId)
      update.serviceTypeId = new Types.ObjectId(data.serviceTypeId);

    const userId = new Types.ObjectId(this.req.user.userId);
    await this.orderItemModel.findOneAndUpdate(
      { _id: orderItemId, orderId },
      update,
      { context: { changedBy: userId }, returnDocument: 'after' } as never,
    );

    await this.reprice(order._id, userId);

    this.logger.log(`${base} order item ${params.orderItemId} updated`);
    return 'Order item updated successfully';
  }

  async deleteOrderItem(params: OrderItemParamsDto) {
    this.can('DELETE', 'OrderItem');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const orderId = new Types.ObjectId(params.orderId);
    const order = await this.orderModel.findOne({
      _id: orderId,
      ...this.orderScope('UPDATE'),
    });
    if (!order) {
      this.logger.error(
        `${base} invalid/out-of-scope orderId ${params.orderId}`,
      );
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Order not found',
      });
    }

    // Target the specific per-garment row by its own id.
    const orderItemId = new Types.ObjectId(params.orderItemId);
    const orderItem = await this.orderItemModel.findOne({
      _id: orderItemId,
      orderId,
    });
    if (!orderItem) {
      this.logger.error(
        `${base} no order item ${params.orderItemId} on order ${params.orderId}`,
      );
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'This item is not part of this order. Please refresh the list',
      });
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
    await this.orderItemModel.findOneAndDelete({ _id: orderItemId, orderId }, {
      context: { changedBy: userId },
      returnDocument: 'after',
    } as never);

    await this.reprice(order._id, userId);

    this.logger.log(
      `${base} deleted order item ${params.orderItemId} from ${order.orderCode}`,
    );
    return 'Order item deleted successfully';
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
      .findOne({ _id: new Types.ObjectId(orderId), ...this.orderScope(action) })
      .populate<{ orderStatusId: OrderStatus }>({
        model: OrderStatus.name,
        path: 'orderStatusId',
      });
    if (!order) {
      this.logger.error(`${base} invalid/out-of-scope orderId ${orderId}`);
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
    const statusUpdate: Record<string, unknown> = {
      orderStatusId: targetStatus._id,
    };
    // Stamp the actual delivery date once, on entry into DELIVERED.
    if (target === OrderStatusEnum.DELIVERED) {
      statusUpdate.deliveredAt = new Date();
    }
    await this.orderModel.findOneAndUpdate({ _id: order._id }, statusUpdate, {
      context: { changedBy: userId },
      returnDocument: 'after',
    } as never);

    // One-time confirm side effects (quota decrement + promo usage). Safe from
    // double-application: the guard only permits DRAFT→CONFIRMED once.
    if (target === OrderStatusEnum.CONFIRMED) {
      await this.finalizeOnConfirm(order as unknown as Order);
    }

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
