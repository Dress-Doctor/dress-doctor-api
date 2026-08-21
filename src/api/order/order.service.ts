import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  ClientSession,
  Connection,
  Model,
  PipelineStage,
  Types,
} from 'mongoose';
import { Workbook } from 'exceljs';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import {
  applyAuditLocals,
  auditContext,
} from 'src/helper/service/audit-context';
import { HistoryActionEnum } from 'src/schema/admin/admin.dto';
import { scopeFilter, scopePermitsCustomer } from 'src/helper/casl/casl-scope';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import {
  HistoryLabelService,
  type HistoryChange,
} from 'src/helper/service/history-label.service';
import { Currency } from 'src/schema/catalog/currency.schema';
import { Item } from 'src/schema/catalog/item.schema';
import { OrderItemHistory } from 'src/schema/order/order-item-history.schema';
import { OrderItem } from 'src/schema/order/order-item.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import {
  OrderItemConditionEnum,
  OrderStatusEnum,
  PricingModelEnum,
} from 'src/schema/order/order.dto';
import { OfficeUser } from 'src/schema/office/office-user.schema';
import { Office } from 'src/schema/office/office.schema';
import { Order } from 'src/schema/order/order.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { User } from 'src/schema/user/user.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { PromoCode } from 'src/schema/promo/promo-code.schema';
import { PromoCodeUsage } from 'src/schema/promo/promo-code-usage.schema';
import { Subscription } from 'src/schema/subscription/subscription.schema';
import { type PaginationDto } from 'src/dto/request-data.dto';
import { PricingService } from '../pricing/pricing.service';
import {
  CreateOrderItemDto,
  OrderParamsDto,
} from './dto/create-order-item.dto';
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
 * Whether a failure is Mongo refusing to open a transaction at all, rather
 * than the transaction body failing. A standalone mongod reports it one of two
 * ways depending on driver version, and neither carries a usable error code.
 */
function isTransactionUnsupported(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('does not support retryable writes') ||
    message.includes('Transaction numbers are only allowed on a replica set')
  );
}

/** Order counts per status, plus `all` across every status. */
export type OrderStatusCounts = {
  all: number;
  draft: number;
  confirmed: number;
  received: number;
  washing: number;
  ready: number;
  delivered: number;
  cancelled: number;
};

/** Headline figures for the orders dashboard, over the list's own filters. */
export type OrderKpis = {
  totalOrders: number;
  inProgress: number;
  readyForCollection: number;
  delivered: number;
  cancelled: number;
  /** Orders that could have completed (all − cancelled) — the rate's divisor. */
  completionBase: number;
  /** Percentage, one decimal place. 0 when nothing could have completed. */
  completionRate: number;
  /**
   * Counts across every status, over the filters minus `orderStatus` — so a
   * status tab strip keeps its numbers whichever tab is selected. Unlike the
   * figures above, this does not narrow when `orderStatus` is set.
   */
  byOrderStatus: OrderStatusCounts;
};

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

/**
 * Allow-list of Office fields safe to return with an order. The office's
 * `signedLink` carries an HMAC and must never be exposed here.
 */
const SAFE_OFFICE_PROJECTION = {
  officeTypeId: 1,
  officeName: 1,
  officeCode: 1,
  slug: 1,
  address: 1,
  city: 1,
  region: 1,
  isActive: 1,
} as const;

/**
 * Customer join. On the list it runs BEFORE the keyword filter so free-text
 * can match the customer's phone/name too; the detail view reuses it so both
 * shape the customer the same way.
 */
const CUSTOMER_LOOKUP: PipelineStage[] = [
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

/** Office join — same story as the customer join above. */
const OFFICE_LOOKUP: PipelineStage[] = [
  {
    $lookup: {
      as: 'office',
      from: 'office',
      foreignField: '_id',
      localField: 'officeId',
      pipeline: [{ $project: SAFE_OFFICE_PROJECTION }],
    },
  },
  { $unwind: { path: '$office', preserveNullAndEmptyArrays: true } },
];

/**
 * The pickup request the order came from, with its status named. Shared by the
 * list and the detail view so both say the same thing about a pickup.
 *
 * The projection is an allow-list: where and when we were asked to collect,
 * and where that request stands. The request also carries `apiClientId`,
 * `officeId`, `customerId` and `confirmedBy` — the first is internal, the rest
 * the order already holds.
 */
const PICKUP_REQUEST_LOOKUP: PipelineStage[] = [
  {
    $lookup: {
      as: 'pickupRequest',
      from: 'pickup_request',
      localField: 'pickupRequestId',
      foreignField: '_id',
      pipeline: [
        {
          $lookup: {
            as: 'pickupStatus',
            from: 'pickup_status',
            localField: 'pickupStatusId',
            foreignField: '_id',
            pipeline: [{ $project: { pickupStatusName: 1 } }],
          },
        },
        {
          $unwind: {
            path: '$pickupStatus',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            note: 1,
            createdAt: 1,
            reference: 1,
            pickupDate: 1,
            pickupTime: 1,
            pickupStatus: 1,
            pickupAddress: 1,
            pickupStatusId: 1,
          },
        },
      ],
    },
  },
  { $unwind: { path: '$pickupRequest', preserveNullAndEmptyArrays: true } },
];

/**
 * The order's garment lines, each resolved against the shared catalog: item →
 * service, service type and currency. Shared by the list and the detail view.
 */
const ORDER_ITEMS_LOOKUP: PipelineStage[] = [
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
];

/**
 * How many audit entries the detail view carries. An order that has been
 * edited hundreds of times is a data problem, not a page that should return
 * hundreds of rows — the newest ones are the ones anybody reads.
 */
const ORDER_HISTORY_LIMIT = 100;

/**
 * One field the audit trail saw change, flattened out of `changedFields`.
 * `from`/`to` are the values exactly as stored; when the field references
 * another document, HistoryLabelService adds the readable label beside them.
 */
export type OrderHistoryChange = HistoryChange;

/**
 * One audit entry on the detail view: who changed what, when. Deliberately
 * WITHOUT the stored `snapshot` — a full copy of the order per entry, which
 * would dwarf the order itself and says nothing the changes don't.
 */
export type OrderHistoryEntry = {
  _id: Types.ObjectId;
  action: HistoryActionEnum;
  changes: OrderHistoryChange[];
  changedBy?: Types.ObjectId;
  changedByUser?: Record<string, unknown>;
  createdAt: Date;
};

/**
 * One audit entry on a garment line. Everything `OrderHistoryEntry` carries,
 * plus which line it was about — and, because a line can be removed and its
 * row deleted outright, what that line looked like at the time: a trail that
 * said only "a garment was removed" would name nothing a reader could check.
 */
export type OrderItemHistoryEntry = OrderHistoryEntry & {
  orderItemId: Types.ObjectId;
  item?: { _id: Types.ObjectId; itemName?: string };
  quantity?: number;
  colour?: string;
  condition?: string;
};

/**
 * One order with every join a detail screen needs, plus its audit trail.
 * Loose on the order's own fields (the aggregation returns the document as
 * stored) and precise about what the endpoint adds on top.
 */
export type OrderDetail = Record<string, unknown> & {
  _id: Types.ObjectId;
  orderCode: string;
  history: OrderHistoryEntry[];
  /** The order status row, joined; carries the name the workflow keys off. */
  orderStatus?: { orderStatusName?: string };
  /** Every status this order may be moved to. Filled in on read. */
  availableTransitions?: { allowed: OrderStatusEnum[] };
};

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
 * What a status move means. Two kinds, because only two consequences differ:
 * the work carries on, or it is called off and the commitments it took are
 * handed back.
 */
export enum TransitionKindEnum {
  /** Any move along the lifecycle, in either direction. */
  NORMAL = 'NORMAL',
  /** The work is called off. Possible from anywhere not already finished. */
  CANCELLATION = 'CANCELLATION',
}

/**
 * The lifecycle, stated as the only two things actually forbidden.
 *
 * Staff routinely find an order is two steps further along than the console
 * says — the bag was washed and shelved while nobody was at a screen. Walking
 * it there one step at a time cost more than the ordering ever bought, so a
 * live order may now be set to whatever status it is really in.
 *
 * What stays closed:
 * - DELIVERED and CANCELLED are terminal. The laundry is out of the building
 *   or the work was called off; nothing moves either.
 * - DRAFT is never a destination. A draft is editable and has spent nothing:
 *   letting a live order fall back into one would reopen its garments and let
 *   its subscription quota and promo be spent a second time.
 */
const TERMINAL_STATUSES: readonly OrderStatusEnum[] = [
  OrderStatusEnum.DELIVERED,
  OrderStatusEnum.CANCELLED,
];

/** Statuses no order may be moved *to* — see the note above. */
const UNREACHABLE_STATUSES: readonly OrderStatusEnum[] = [
  OrderStatusEnum.DRAFT,
];

/** Every move available from a status — published to clients on the detail read. */
export function availableTransitionsFrom(status: OrderStatusEnum): {
  allowed: OrderStatusEnum[];
} {
  if (TERMINAL_STATUSES.includes(status)) return { allowed: [] };

  return {
    allowed: Object.values(OrderStatusEnum).filter(
      (candidate) =>
        candidate !== status && !UNREACHABLE_STATUSES.includes(candidate),
    ),
  };
}

/**
 * What kind of move `current → target` is, or undefined when it is no legal
 * move at all. The caller names a target, never a kind, so nothing about how
 * the move is recorded is left to the client.
 */
export function classifyTransition(
  current: OrderStatusEnum,
  target: OrderStatusEnum,
): TransitionKindEnum | undefined {
  if (!availableTransitionsFrom(current).allowed.includes(target)) {
    return undefined;
  }

  return target === OrderStatusEnum.CANCELLED
    ? TransitionKindEnum.CANCELLATION
    : TransitionKindEnum.NORMAL;
}

/** The audit action a move of each kind is recorded under. */
const HISTORY_ACTION_BY_KIND: Record<TransitionKindEnum, HistoryActionEnum> = {
  [TransitionKindEnum.NORMAL]: HistoryActionEnum.UPDATE,
  [TransitionKindEnum.CANCELLATION]: HistoryActionEnum.CANCEL,
};

/** What the API says back, so a correction does not read like progress. */
const TRANSITION_MESSAGES: Record<
  TransitionKindEnum,
  (target: OrderStatusEnum) => string
> = {
  [TransitionKindEnum.NORMAL]: (target) => `Order moved to ${target}`,
  [TransitionKindEnum.CANCELLATION]: () => 'Order cancelled successfully',
};

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<Order>,

    @InjectConnection() private readonly connection: Connection,

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

    @InjectModel(OrderItemHistory.name)
    private readonly orderItemHistoryModel: Model<OrderItemHistory>,

    @InjectModel(Office.name) private readonly officeModel: Model<Office>,

    @InjectModel(OfficeUser.name)
    private readonly officeUserModel: Model<OfficeUser>,

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
    private readonly historyLabelService: HistoryLabelService,
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
  private async reprice(
    orderId: Types.ObjectId,
    changedBy: Types.ObjectId,
    session?: ClientSession,
  ) {
    // Session passed as an option rather than chained via .session(): when it
    // is undefined this is exactly the query it always was.
    const order = await this.orderModel.findById(orderId, null, { session });
    if (!order) return;

    const items = await this.orderItemModel.find({ orderId }, null, {
      session,
    });
    const pricing = await this.pricingService.priceOrder({
      pricingModel: order.pricingModel,
      officeId: this.req.data.officeId?.toString(),
      customerId: order.customerId.toString(),
      totalWeightKg: order.totalWeightKg,
      // An agreed price outranks the rate card on every reprice, not just the
      // first — otherwise the next item added would silently undo it.
      orderAmount: order.manualOrderAmount,
      promoCode: order.promoCode,
      manualDiscount: order.manualDiscount,
      items: items.map((i) => ({
        itemId: i.itemId.toString(),
        serviceTypeId: i.serviceTypeId.toString(),
        quantity: i.quantity,
        // An agreed unit price outranks the price list on every reprice, not
        // just the first — otherwise the next garment added would silently
        // undo it. 0 means nobody agreed one, so the engine prices the line.
        unitPrice: i.unitPrice > 0 ? i.unitPrice : undefined,
      })),
    });

    // Snapshot resolved unitPrice/lineTotal onto each line (Per Piece prices;
    // other models keep them at 0). Order of pricing.lines matches items.
    // Sequential rather than Promise.all: when a session is threaded through,
    // Mongo rejects concurrent operations on it.
    for (const [idx, item] of items.entries()) {
      await this.orderItemModel.updateOne(
        { _id: item._id },
        {
          unitPrice: pricing.lines[idx]?.unitPrice ?? 0,
          lineTotal: pricing.lines[idx]?.lineTotal ?? 0,
        },
        { session },
      );
    }

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
      {
        context: auditContext(this.req, changedBy),
        returnDocument: 'after',
        session,
      } as never,
    );
  }

  /**
   * Write an order and the garments booked with it as one unit.
   *
   * The order upsert, its item rows and the price snapshot all land inside a
   * single transaction, so a counter that books six garments never ends up with
   * an order holding four — the whole intake either exists or it doesn't. That
   * matters more here than on the per-item endpoint because a half-filled DRAFT
   * has no screen that can repair it yet.
   *
   * Callers are expected to have already run `assertItemsExist()`, which turns
   * the one vague failure (a bad itemId) into a named rejection; everything
   * else the engine refuses rolls back from in here.
   */
  private async commitOrderWithItems(params: {
    filter: Record<string, unknown>;
    update: Record<string, unknown>;
    items: CreateOrderItemDto[];
    userId: Types.ObjectId;
  }): Promise<Order> {
    const { filter, update, items, userId } = params;

    let created: Order | undefined;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        created = (await this.orderModel.findOneAndUpdate(filter, update, {
          context: auditContext(this.req, userId),
          upsert: true,
          returnDocument: 'after',
          session,
        } as never)) as unknown as Order;

        // Saved one at a time, and deliberately not in a Promise.all: a Mongo
        // session cannot carry concurrent operations. save() (rather than
        // insertMany) is what keeps the post('save') history hook firing, and
        // $locals is how that hook learns who to attribute the row to — the
        // same shape createOrderItem() uses. lineTotal is a placeholder;
        // reprice() computes it right after.
        for (const item of this.mergeLines(items)) {
          const row = new this.orderItemModel({
            orderId: created._id,
            itemId: new Types.ObjectId(item.itemId),
            serviceTypeId: new Types.ObjectId(item.serviceTypeId),
            quantity: item.quantity,
            unitPrice: item.unitPrice ?? 0,
            lineTotal: 0,
            condition: item.condition ?? OrderItemConditionEnum.NORMAL,
            colour: item.colour,
          });
          applyAuditLocals(row, this.req, userId);
          await row.save({ session });
        }

        await this.reprice(created._id, userId, session);
      });
    } catch (err) {
      // A standalone mongod cannot open a transaction at all. That is a
      // deployment problem, not a bad request, and it takes down every
      // multi-document write (payments and rewards included) — so say which
      // one it is rather than letting it surface as an anonymous 500.
      if (isTransactionUnsupported(err)) {
        this.logger.error(
          'Cannot create an order: this MongoDB deployment does not support ' +
            'transactions. Point DATABASE_URL at a replica set — e.g. ' +
            '?replicaSet=rs0&directConnection=true — and restart.',
        );
        throw new ServiceUnavailableException({
          code: 'TRANSACTIONS_UNSUPPORTED',
          message:
            'Orders cannot be created because the database is not configured ' +
            'for transactions. Please contact support.',
        });
      }
      throw err;
    } finally {
      await session.endSession();
    }

    // withTransaction resolves only once its body has run to completion, so a
    // missing order here means the upsert returned nothing rather than that
    // the transaction failed — a state the caller must not carry on from.
    if (!created) {
      throw new BadRequestException({
        code: 'ORDER_NOT_CREATED',
        message: 'Order could not be created',
      });
    }
    return created;
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

    // manualDiscount is permissioned separately from ordinary edits. So is a
    // hand-set price: both move what the customer owes.
    if (data.manualDiscount !== undefined) this.can('UPDATE', 'Payment');
    if (data.orderAmount !== undefined) this.can('UPDATE', 'Payment');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const update: Record<string, unknown> = {};
    const unset: Record<string, unknown> = {};
    /** Set only on a real move, and only to rebuild both rollups afterwards. */
    let movedFrom: Types.ObjectId | undefined;

    // Who the order is for. Every rule creation applies applies here too: the
    // caller's own scope, the customer has to exist, and a customer may hold
    // one draft at a time — otherwise moving a draft onto someone who already
    // has one would make a state the booking path refuses to create.
    if (data.customerId !== undefined) {
      const customerId = new Types.ObjectId(data.customerId);
      this.assertCustomerScope(customerId, 'UPDATE', base);

      const customer = await this.userModel.findById(customerId);
      if (!customer) {
        this.logger.error(`${base} invalid customer id ${data.customerId}`);
        throw new BadRequestException('Invalid customer id');
      }

      if (!customerId.equals(order.customerId)) {
        movedFrom = order.customerId;
        const existingDraft = await this.orderModel.findOne({
          customerId,
          _id: { $ne: id },
          orderStatusId: order.orderStatusId._id,
        });
        if (existingDraft) {
          this.logger.error(
            `${base} customer ${data.customerId} already holds a draft order`,
          );
          throw new BadRequestException({
            code: 'DRAFT_EXISTS',
            field: 'customerId',
            message: 'A customer can only have one draft order',
          });
        }
      }
      update.customerId = customerId;
    }

    // Refused rather than quietly rewritten to the caller's own office, for
    // the same reason as at creation: filing it somewhere other than the
    // client was told is the worse failure.
    if (data.officeId !== undefined) {
      update.officeId = await this.resolveOfficeId(data.officeId, base);
    }

    if (data.currencyId !== undefined) {
      const currencyId = new Types.ObjectId(data.currencyId);
      const currency = await this.currencyModel.findById(currencyId);
      if (!currency) {
        this.logger.error(`${base} invalid currency id ${data.currencyId}`);
        throw new BadRequestException('Invalid currency id');
      }
      update.currencyId = currencyId;
    }

    if (data.pickedUpBy !== undefined) {
      update.pickedUpBy = await this.resolvePickedUpBy(
        data.pickedUpBy,
        order.pickedUpBy,
        base,
      );
    }

    if (data.pricingModel !== undefined)
      update.pricingModel = data.pricingModel;
    if (data.receivedAt !== undefined) update.receivedAt = data.receivedAt;
    if (data.estimatedDeliveryDate !== undefined) {
      update.estimatedDeliveryDate = data.estimatedDeliveryDate;
    }

    // Weight and pricing model are checked against each other as the order
    // will stand, not as it arrived: switching to PER_KG with no weight on
    // file, and clearing the weight of an order already priced by the kilo,
    // are the same mistake seen from two directions.
    this.assertWeightForModel(
      data.pricingModel ?? order.pricingModel,
      data.totalWeightKg ?? order.totalWeightKg,
    );

    if (data.totalWeightKg !== undefined)
      update.totalWeightKg = data.totalWeightKg;
    // 0 hands pricing back to the engine — there is no "free order" reading to
    // lose here, since FREE is a pricing model of its own.
    if (data.orderAmount !== undefined) {
      if (data.orderAmount > 0) update.manualOrderAmount = data.orderAmount;
      else unset.manualOrderAmount = 1;
    }
    if (data.manualDiscount !== undefined)
      update.manualDiscount = data.manualDiscount;
    if (data.promoCode !== undefined) update.promoCode = data.promoCode;
    // An empty string clears it — the customer withdrawing an instruction is
    // as real an edit as adding one. It has to be an explicit $unset:
    // `note: undefined` is stripped from the update, so the old text survives.
    if (data.note !== undefined) {
      const note = data.note.trim();
      if (note) update.note = note;
      else unset.note = 1;
    }

    // findOneAndUpdate rather than updateOne, and with the audit context: the
    // history hook is attached to findOneAndUpdate alone, so an updateOne here
    // wrote the edit and told the trail nothing — an operator who rewrote a
    // note or corrected a weight left no record, and the x-change-reason the
    // guard obliged them to send was thrown away. Only a change that moved
    // money showed up at all, and only because reprice() writes it below.
    //
    // Mongo rejects an empty operator, so each half is included only when it
    // has keys, and a body that asked for nothing skips the write entirely
    // rather than sending `{}`.
    //
    // The edit and the reprice share a transaction because the reprice can
    // legitimately refuse what the edit asked for — PER_PIECE with a garment
    // that has no price row comes back PRICE_NOT_FOUND. Without the session
    // the new pricing model would already be on the order, sitting beside
    // amounts computed under the old one.
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        if (Object.keys(update).length || Object.keys(unset).length) {
          await this.orderModel.findOneAndUpdate(
            { _id: id },
            {
              ...(Object.keys(update).length ? { $set: update } : {}),
              ...(Object.keys(unset).length ? { $unset: unset } : {}),
            },
            {
              context: auditContext(this.req, changedBy),
              returnDocument: 'after',
              session,
            } as never,
          );
        }
        await this.reprice(id, changedBy, session);
      });
    } catch (err) {
      // Same deployment problem as creation: a standalone mongod cannot open a
      // transaction at all, and that is worth naming rather than serving as an
      // anonymous 500.
      if (isTransactionUnsupported(err)) {
        this.logger.error(
          'Cannot edit an order: this MongoDB deployment does not support ' +
            'transactions. Point DATABASE_URL at a replica set — e.g. ' +
            '?replicaSet=rs0&directConnection=true — and restart.',
        );
        throw new ServiceUnavailableException({
          code: 'TRANSACTIONS_UNSUPPORTED',
          message:
            'Orders cannot be edited because the database is not configured ' +
            'for transactions. Please contact support.',
        });
      }
      throw err;
    } finally {
      await session.endSession();
    }

    // After the transaction, like the create path's rollup: the listeners and
    // the customer rollups react to an order that exists in its new shape, so
    // they must not run for an edit that ends up rolled back. Both sides are
    // rebuilt — the customer who gained the order and the one who lost it.
    if (movedFrom) {
      await Promise.all([
        this.recomputeLastOrderAt(movedFrom, changedBy),
        this.recomputeLastOrderAt(
          update.customerId as Types.ObjectId,
          changedBy,
        ),
      ]);
    }

    this.logger.log(`${base} edited draft order ${order.orderCode}`);
    return 'Order updated successfully';
  }

  /**
   * Recompute a customer's `lastOrderAt` from the orders they actually hold.
   *
   * Creation can bump the rollup blindly — a new order is always the newest.
   * A move cannot: the customer an order leaves may still have older orders,
   * so the truthful value is the newest `createdAt` remaining to them, and
   * none at all means the field goes away rather than keeping the date of an
   * order that is no longer theirs.
   */
  private async recomputeLastOrderAt(
    customerId: Types.ObjectId,
    changedBy: Types.ObjectId,
  ) {
    const latest = await this.orderModel
      .findOne({ customerId })
      .sort({ createdAt: -1 })
      .select('createdAt');

    await this.customerModel.findOneAndUpdate(
      { userId: customerId },
      latest
        ? { lastOrderAt: (latest as unknown as { createdAt: Date }).createdAt }
        : { $unset: { lastOrderAt: 1 } },
      { context: auditContext(this.req, changedBy) } as never,
    );
  }

  /**
   * On order creation: bump the customer's lastOrderAt rollup and emit
   * order.created. totalOrders/totalSpend mature on order paid (§3.6).
   *
   * `orderedAt` is the order's own `createdAt`, not the clock reading at this
   * line: `recomputeLastOrderAt` rebuilds the rollup from exactly that field,
   * so stamping anything else here would make the value drift by the width of
   * the write the first time an order moved between customers.
   */
  private async onOrderCreated(
    orderId: Types.ObjectId,
    customerId: Types.ObjectId,
    changedBy: Types.ObjectId,
    orderedAt: Date,
  ) {
    await this.customerModel.findOneAndUpdate(
      { userId: customerId },
      { lastOrderAt: orderedAt },
      { context: auditContext(this.req, changedBy) } as never,
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
    const { items = [], ...order } = data;
    if (items.length) this.can('CREATE', 'OrderItem');
    // Same rule as the per-item endpoint: hand-set prices are permissioned.
    if (items.some((i) => i.unitPrice !== undefined)) {
      this.can('UPDATE', 'Payment');
    }

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const customerId = new Types.ObjectId(data.customerId);
    this.assertCustomerScope(customerId, 'CREATE', base);
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
    // Scoped like every other by-id read: a pickup outside the caller's office
    // simply isn't found, so its id can't be used to book into another office.
    const pickupRequest = await this.pickupRequestModel
      .findOne({
        _id: pickupRequestId,
        ...scopeFilter(this.req.user.ability, 'READ', 'PickupRequest'),
      })
      .populate<{
        pickupStatusId: PickupStatus;
      }>({ model: PickupStatus.name, path: 'pickupStatusId' });
    if (!pickupRequest) {
      this.logger.error(
        `${base} invalid pickup request id ${data.pickupRequestId}`,
      );
      throw new BadRequestException('Invalid pickup request id');
    }

    // The order is the pickup's order: it must be for the customer who asked
    // for the collection, whatever customerId the client sent.
    if (pickupRequest.customerId.toString() !== customerId.toString()) {
      this.logger.error(
        `${base} pickup ${pickupRequest.reference} belongs to another customer`,
      );
      throw new BadRequestException({
        code: 'PICKUP_CUSTOMER_MISMATCH',
        field: 'customerId',
        message: 'This pickup request belongs to another customer',
      });
    }

    this.assertWeightForModel(data.pricingModel, data.totalWeightKg);
    await this.assertItemsExist(items, base);

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

    // A pickup is bookable once an agent is on it: CONFIRMED says the customer
    // wants it, ASSIGNED says someone is going. Anyone may raise the order —
    // the counter, a supervisor, the agent — it is the pickup's state that
    // gates it, never who is asking.
    if (
      pickupRequest.pickupStatusId.pickupStatusName !==
      PickupStatusEnum.ASSIGNED.toString()
    ) {
      this.logger.error(
        `${base} pickup ${pickupRequest.reference} is ${pickupRequest.pickupStatusId.pickupStatusName}, not ${PickupStatusEnum.ASSIGNED}`,
      );
      throw new BadRequestException({
        code: 'PICKUP_NOT_ASSIGNED',
        field: 'pickupRequestId',
        message: `An order can only be created for a pickup in ${PickupStatusEnum.ASSIGNED} status`,
      });
    }

    // One pickup, one order — at any status, for any customer. The draft check
    // below would let a second order through the moment the first left DRAFT,
    // and the collection was only ever going to become one order.
    const existingPickupOrder = await this.orderModel.findOne({
      pickupRequestId,
    });
    if (existingPickupOrder) {
      this.logger.error(
        `${base} pickup ${pickupRequest.reference} already has order ${existingPickupOrder.orderCode}`,
      );
      throw new BadRequestException({
        code: 'PICKUP_ORDER_EXISTS',
        field: 'pickupRequestId',
        message: 'This pickup request already has an order',
      });
    }

    // Same rule as booking without a pickup: one open draft per customer, so
    // the two paths cannot be played off against each other to hold two.
    const existingOrder = await this.orderModel.findOne({
      customerId,
      orderStatusId: orderStatus._id,
    });
    if (existingOrder) {
      this.logger.error(
        `${base} this customer with id ${data.customerId} can only have one draft order at a time`,
      );
      throw new BadRequestException({
        code: 'DRAFT_EXISTS',
        field: 'customerId',
        message: 'A customer can only have one draft order at a time',
      });
    }

    const userId = new Types.ObjectId(this.req.user.userId);
    const pickedUpBy = await this.resolvePickedUpBy(
      data.pickedUpBy,
      userId,
      base,
    );
    const created = await this.commitOrderWithItems({
      items,
      userId,
      filter: { customerId: customerId, pickupRequestId: pickupRequestId },
      update: {
        ...order,
        customerId,
        currencyId,
        pickupRequestId,
        // The posted amount is an input to pricing, not the priced result —
        // reprice() writes `orderAmount` itself, right after this.
        manualOrderAmount: data.orderAmount,
        // After the spread, so the raw string from the DTO never survives.
        officeId: await this.resolveOfficeId(data.officeId, base),
        orderStatusId: orderStatus._id,
        orderCode: await this.codeService.generateOrderReference(),
        createdBy: userId,
        pickedUpBy,
      },
    });

    // Outside the transaction: the listeners react to an order that exists, so
    // they must not fire for one that ends up rolled back.
    await this.onOrderCreated(
      created._id,
      customerId,
      userId,
      (created as unknown as { createdAt: Date }).createdAt,
    );

    this.logger.log(
      `${base} has successfully created order for pickup request ${data.pickupRequestId} with ${items.length} item(s)`,
    );
    return {
      message: 'Order created successfully',
      data: { _id: created._id, orderCode: created.orderCode },
    };
  }

  async createOrder(data: CreateOrderDto) {
    this.can('CREATE', 'Order');
    const { items = [], ...order } = data;
    if (items.length) this.can('CREATE', 'OrderItem');
    // Same rule as the per-item endpoint: hand-set prices are permissioned.
    if (items.some((i) => i.unitPrice !== undefined)) {
      this.can('UPDATE', 'Payment');
    }

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const customerId = new Types.ObjectId(data.customerId);
    this.assertCustomerScope(customerId, 'CREATE', base);
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
    await this.assertItemsExist(items, base);

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
      throw new BadRequestException({
        code: 'DRAFT_EXISTS',
        field: 'customerId',
        message: 'A customer can only have one draft order',
      });
    }

    const userId = new Types.ObjectId(this.req.user.userId);
    const pickedUpBy = await this.resolvePickedUpBy(
      data.pickedUpBy,
      userId,
      base,
    );
    const created = await this.commitOrderWithItems({
      items,
      userId,
      filter: { customerId, orderStatusId: orderStatus._id },
      update: {
        ...order,
        customerId,
        currencyId,
        // The posted amount is an input to pricing, not the priced result —
        // reprice() writes `orderAmount` itself, right after this.
        manualOrderAmount: data.orderAmount,
        // After the spread, so the raw string from the DTO never survives.
        officeId: await this.resolveOfficeId(data.officeId, base),
        orderStatusId: orderStatus._id,
        orderCode: await this.codeService.generateOrderReference(),
        createdBy: userId,
        pickedUpBy,
      },
    });

    // Outside the transaction: the listeners react to an order that exists, so
    // they must not fire for one that ends up rolled back.
    await this.onOrderCreated(
      created._id,
      customerId,
      userId,
      (created as unknown as { createdAt: Date }).createdAt,
    );

    this.logger.log(
      `${base} has successfully created order for customer ${data.customerId} with ${items.length} item(s)`,
    );
    return {
      message: 'Order created successfully',
      data: { _id: created._id, orderCode: created.orderCode },
    };
  }

  /**
   * Self-scope on the customer an order names (§2.3 booking): a customer's own
   * Order rules carry { customerId: '$self' } — they can only ever book for,
   * or move an order to, themselves, whatever customerId the client sends.
   * Staff rules are unconditioned.
   *
   * The action is passed in because the two paths are permissioned separately:
   * booking is CREATE, moving an existing draft to another customer is UPDATE.
   */
  private assertCustomerScope(
    customerId: Types.ObjectId,
    action: 'CREATE' | 'UPDATE',
    logBase: string,
  ) {
    if (
      !scopePermitsCustomer(this.req.user.ability, action, 'Order', customerId)
    ) {
      this.logger.error(
        `${logBase} tried to ${action === 'CREATE' ? 'create an order' : 'move an order'} for out-of-scope customer ${customerId.toString()}`,
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

  /**
   * Which office an order being created belongs to.
   *
   * Omitted, it is the office the request is already operating in. Supplied, it
   * has to be one the caller actually works at — staff can be posted to more
   * than one office, so membership is read from `office_user` rather than
   * inferred from the single office on the request. A global role (no office
   * condition on its CREATE rules) may book anywhere.
   *
   * An office the caller has no posting to is refused rather than quietly
   * rewritten to their own: filing the order somewhere other than the client
   * was told is the worse of the two failures.
   */
  private async resolveOfficeId(
    officeId: string | undefined,
    logBase: string,
  ): Promise<Types.ObjectId | undefined> {
    const own = this.req.data.officeId;
    if (!officeId) return own;

    const requested = new Types.ObjectId(officeId);

    const exists = await this.officeModel.exists({ _id: requested });
    if (!exists) {
      this.logger.error(`${logBase} invalid officeId ${officeId}`);
      throw new BadRequestException({
        code: 'INVALID_OFFICE',
        message: 'Invalid office id',
      });
    }

    if (own && requested.equals(own)) return requested;

    // `{}` means no conditions at all — unrestricted, i.e. a GLOBAL role.
    const scope = scopeFilter(this.req.user.ability, 'CREATE', 'Order');
    if (Object.keys(scope).length === 0) return requested;

    const posted = await this.officeUserModel.exists({
      officeId: requested,
      userId: new Types.ObjectId(this.req.user.userId),
      isActive: true,
    });
    if (!posted) {
      this.logger.error(
        `${logBase} tried to create an order for office ${officeId} they are not posted to`,
      );
      throw new BadRequestException({
        code: 'OFFICE_OUT_OF_SCOPE',
        message: 'You do not have access to this office',
      });
    }

    return requested;
  }

  /**
   * The identity of a garment line: item, service type, condition and colour.
   * Two lines that agree on all four are the same thing counted twice, so they
   * collapse into one row with a higher quantity rather than sitting next to
   * each other identically. Differ in any of them — a white shirt and a blue
   * one, normal and stained — and they stay separate, which is what
   * per-garment rows are for.
   *
   * Colour is compared case- and whitespace-insensitively: "Navy Blue" and
   * "navy blue" are one colour, and nobody at a counter should have to make
   * them agree.
   */
  private lineKey(line: {
    itemId: Types.ObjectId | string;
    serviceTypeId: Types.ObjectId | string;
    condition?: OrderItemConditionEnum;
    colour?: string;
  }): string {
    return [
      line.itemId.toString(),
      line.serviceTypeId.toString(),
      line.condition ?? OrderItemConditionEnum.NORMAL,
      (line.colour ?? '').trim().toLowerCase(),
    ].join('|');
  }

  /**
   * Fold repeated garments in one request into single lines. The client merges
   * as it goes so the basket reads right, but the endpoint cannot assume it
   * did — and the same request may legitimately arrive twice on a retry.
   *
   * A later line's agreed unit price wins: it is the more recent thing the
   * operator typed for that garment.
   */
  private mergeLines(items: CreateOrderItemDto[]): CreateOrderItemDto[] {
    const merged = new Map<string, CreateOrderItemDto>();
    for (const item of items) {
      const key = this.lineKey(item);
      const seen = merged.get(key);
      if (!seen) {
        merged.set(key, { ...item });
        continue;
      }
      seen.quantity += item.quantity;
      if (item.unitPrice !== undefined) seen.unitPrice = item.unitPrice;
    }
    return [...merged.values()];
  }

  /**
   * Check every garment booked with an order references a real catalog item,
   * in one query rather than one per line.
   *
   * Pricing failures (no price row for a PER_PIECE line, no active
   * subscription) are left to the transaction in `commitOrderWithItems()` to
   * roll back — they already produce a precise error from the engine. This
   * only covers the one case the engine would report vaguely: a bad itemId,
   * which is worth naming.
   */
  private async assertItemsExist(items: CreateOrderItemDto[], logBase: string) {
    if (!items.length) return;

    const ids = [...new Set(items.map((item) => item.itemId))];
    const found = await this.itemModel
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .select('_id');
    if (found.length === ids.length) return;

    const known = new Set(found.map((item) => item._id.toString()));
    const unknown = ids.filter((id) => !known.has(id));
    this.logger.error(`${logBase} invalid itemId(s) ${unknown.join(', ')}`);
    throw new BadRequestException({
      code: 'INVALID_ITEM',
      message: `Invalid item id(s): ${unknown.join(', ')}`,
    });
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
  // list, the KPI counts, and the CSV/Excel export all match on the exact same
  // set. `filterStages` covers customer/office joins + date window + keyword;
  // the status filter is returned separately (`statusStages`) so a caller can
  // take the filters without it — the KPI endpoint counts every status.
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
    // whereClause so a caller that wants the filters minus the status — the
    // KPI counts — can simply drop `statusStages`.
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

    // A plain field match, unlike orderStatus: paymentStatus is stored on the
    // order (computed from its payments), so there is no name to resolve. It
    // stays in whereClause, which means it narrows the KPI breakdown too — it
    // is one of the filters those counts are meant to describe.
    if (query.paymentStatus) whereClause['paymentStatus'] = query.paymentStatus;

    // Same story: both are stored on the order, so both are plain matches.
    if (query.pricingModel) whereClause['pricingModel'] = query.pricingModel;
    if (query.pickedUpBy)
      whereClause['pickedUpBy'] = new Types.ObjectId(query.pickedUpBy);

    // Office by human-readable code, resolved to its id so the match rides the
    // officeId indexes. An unknown code yields an id that matches nothing,
    // which is the same shape of answer as an office with no orders.
    let officeIdFilter: Types.ObjectId | undefined;
    if (query.officeCode) {
      const office = await this.officeModel
        .findOne({ officeCode: query.officeCode.trim().toUpperCase() })
        .select('_id')
        .lean();
      officeIdFilter = office?._id ?? new Types.ObjectId();
    }

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
    const baseMatch: Record<string, unknown> = { ...whereClause, ...scope };

    // $and rather than another key on baseMatch: the scope may already pin
    // officeId, and a spread would let one silently replace the other. A
    // scoped user asking for someone else's office must get nothing back, not
    // their own office's orders relabelled as the answer.
    if (officeIdFilter) baseMatch.$and = [{ officeId: officeIdFilter }];

    // Filter stages shared by the count and the data query so paging is exact.
    // The customer/office joins run BEFORE the keyword filter so free-text can
    // match the customer's phone/name and the office name/code too.
    const filterStages: PipelineStage[] = [
      { $match: baseMatch },
      ...CUSTOMER_LOOKUP,
      ...OFFICE_LOOKUP,
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

  /**
   * Per-status counts over whatever pipeline stages the caller hands in, so
   * the buckets always describe exactly the set those stages match.
   *
   * `all` sums every order matched, including any whose status row is missing
   * — a count that skipped them would not reconcile with the list's own total.
   */
  private async countByStatus(
    filterStages: PipelineStage[],
  ): Promise<OrderStatusCounts> {
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

    const byOrderStatus: OrderStatusCounts = {
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
      if (key && key in byOrderStatus)
        byOrderStatus[key as keyof OrderStatusCounts] += row.count;
      byOrderStatus.all += row.count;
    }

    return byOrderStatus;
  }

  /**
   * Headline numbers for the orders dashboard, over the exact same filters as
   * the list — every param, `orderStatus` included — so the cards always
   * describe the set the table is showing. Filter to READY and every figure
   * but `readyForCollection` is 0, because nothing else is in that set.
   *
   * `byOrderStatus` is the one deliberate exception: it always spans every
   * status, taking the filters minus `orderStatus`. It is what a status tab
   * strip counts off, and a breakdown that collapsed to the selected tab could
   * never tell you what the other tabs hold — you would lose the numbers the
   * moment you used them.
   */
  async getOrderKpis(query: FindOrderDto): Promise<OrderKpis> {
    this.can('READ', 'Order');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { filterStages, statusStages } =
      await this.buildOrderFilterStages(query);

    // Across every status: the tab counts.
    const byOrderStatus = await this.countByStatus(filterStages);

    // Narrowed by the status filter too: the cards. With no status filter the
    // two sets are identical, so the second aggregation is skipped.
    const scoped = statusStages.length
      ? await this.countByStatus([...filterStages, ...statusStages])
      : byOrderStatus;

    // What is physically on the floor: taken in, being worked, not yet ready.
    const inProgress = scoped.confirmed + scoped.received + scoped.washing;

    // Cancelled orders never had a chance to complete, so counting them as
    // failures would punish the rate for work that was called off.
    const completionBase = scoped.all - scoped.cancelled;
    const completionRate =
      completionBase > 0
        ? Math.round((scoped.delivered / completionBase) * 1000) / 10
        : 0;

    this.logger.log(`[${platform}] ${phone} has successfully retrieved kpis`);

    return {
      totalOrders: scoped.all,
      inProgress,
      readyForCollection: scoped.ready,
      delivered: scoped.delivered,
      cancelled: scoped.cancelled,
      completionBase,
      completionRate,
      byOrderStatus,
    };
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

      ...ORDER_ITEMS_LOOKUP,
      ...PICKUP_REQUEST_LOOKUP,
    ]);

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all items`);
    return { total, data, nextPage };
  }

  /**
   * One order, addressed by its human-readable code — everything a detail
   * screen shows in a single round trip: the customer, office, currency,
   * status, creator and pickup agent, the garment lines resolved against the
   * catalog, the linked pickup request, the promo/subscription it was priced
   * against, its payments, and its audit trail.
   *
   * The trail carries only what changed (field, from, to) and who changed it.
   * The stored `snapshot` — a full copy of the order per entry — is
   * deliberately dropped: it would dwarf the order itself and adds nothing a
   * reader of the timeline needs.
   *
   * Office/self scoped through the same READ conditions as the list, so an
   * order belonging to another office simply isn't found rather than being
   * readable by anyone who can guess a code.
   */
  async findByCode(orderCode: string): Promise<OrderDetail> {
    this.can('READ', 'Order');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const code = orderCode.trim();
    const scope = scopeFilter(this.req.user.ability, 'READ', 'Order');

    const [order] = await this.orderModel.aggregate<OrderDetail>([
      { $match: { orderCode: code, ...scope } },
      { $limit: 1 },

      ...CUSTOMER_LOOKUP,
      ...OFFICE_LOOKUP,

      {
        $lookup: {
          as: 'orderStatus',
          from: 'order_status',
          localField: 'orderStatusId',
          foreignField: '_id',
        },
      },
      { $unwind: { path: '$orderStatus', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'currency',
          from: 'currency',
          localField: 'currencyId',
          foreignField: '_id',
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

      // Creator and pickup agent (both Users) — same allow-list as the
      // customer; passwordHash / any secret is never returned.
      {
        $lookup: {
          as: 'createdByUser',
          from: 'user',
          localField: 'createdBy',
          foreignField: '_id',
          pipeline: [{ $project: SAFE_USER_PROJECTION }],
        },
      },
      { $unwind: { path: '$createdByUser', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'pickedUpByUser',
          from: 'user',
          localField: 'pickedUpBy',
          foreignField: '_id',
          pipeline: [{ $project: SAFE_USER_PROJECTION }],
        },
      },
      {
        $unwind: { path: '$pickedUpByUser', preserveNullAndEmptyArrays: true },
      },

      ...ORDER_ITEMS_LOOKUP,
      ...PICKUP_REQUEST_LOOKUP,

      // What the order was priced against: the applied promo and, for the
      // Subscription model, the enrolment its quota was drawn from.
      {
        $lookup: {
          as: 'promo',
          from: 'promo_code',
          localField: 'promoCodeId',
          foreignField: '_id',
          pipeline: [
            {
              $project: {
                promoCodeName: 1,
                discountType: 1,
                discountValue: 1,
                stackable: 1,
                expiresAt: 1,
                isActive: 1,
              },
            },
          ],
        },
      },
      { $unwind: { path: '$promo', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'subscription',
          from: 'subscription',
          localField: 'subscriptionId',
          foreignField: '_id',
          pipeline: [
            {
              $project: {
                planId: 1,
                status: 1,
                quotaType: 1,
                billingCycle: 1,
                remainingQuota: 1,
              },
            },
          ],
        },
      },
      { $unwind: { path: '$subscription', preserveNullAndEmptyArrays: true } },

      // Payments against this order, newest first, with the method/type names
      // and who took the money.
      {
        $lookup: {
          as: 'payments',
          from: 'payment',
          localField: '_id',
          foreignField: 'orderId',
          pipeline: [
            { $sort: { paidAt: -1 } },
            {
              $lookup: {
                as: 'paymentMethod',
                from: 'payment_method',
                localField: 'paymentMethodId',
                foreignField: '_id',
                pipeline: [{ $project: { paymentMethodName: 1 } }],
              },
            },
            {
              $unwind: {
                path: '$paymentMethod',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                as: 'paymentType',
                from: 'payment_type',
                localField: 'paymentTypeId',
                foreignField: '_id',
                pipeline: [{ $project: { paymentTypeName: 1 } }],
              },
            },
            {
              $unwind: {
                path: '$paymentType',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                as: 'receivedByUser',
                from: 'user',
                localField: 'receivedBy',
                foreignField: '_id',
                pipeline: [{ $project: SAFE_USER_PROJECTION }],
              },
            },
            {
              $unwind: {
                path: '$receivedByUser',
                preserveNullAndEmptyArrays: true,
              },
            },
            // The idempotency key is a client secret of sorts and the audit
            // trail's business is elsewhere — neither belongs on this screen.
            { $project: { idempotencyKey: 0 } },
          ],
        },
      },

      // The audit trail: what changed, by whom, newest first. `changedFields`
      // is an object keyed by field name, so it is turned into a flat array a
      // timeline can render directly. `snapshot` is never projected.
      {
        $lookup: {
          as: 'history',
          from: 'order_history',
          localField: '_id',
          foreignField: 'orderId',
          pipeline: [
            { $sort: { createdAt: -1 } },
            { $limit: ORDER_HISTORY_LIMIT },
            {
              $lookup: {
                as: 'changedByUser',
                from: 'user',
                localField: 'changedBy',
                foreignField: '_id',
                pipeline: [{ $project: SAFE_USER_PROJECTION }],
              },
            },
            {
              $unwind: {
                path: '$changedByUser',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                action: 1,
                reason: 1,
                createdAt: 1,
                changedBy: 1,
                changedByUser: 1,
                changes: {
                  $map: {
                    as: 'change',
                    input: {
                      $objectToArray: { $ifNull: ['$changedFields', {}] },
                    },
                    in: {
                      field: '$$change.k',
                      from: '$$change.v.from',
                      to: '$$change.v.to',
                    },
                  },
                },
              },
            },
          ],
        },
      },
    ]);

    if (!order) {
      this.logger.error(`${base} unknown/out-of-scope order code ${code}`);
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Order not found',
      });
    }

    // `orderStatusId: 6a58…53d → 6a58…53e` means nothing to a reader, so every
    // foreign key in the trail gets its label attached (CONFIRMED → RECEIVED).
    // Generic, off the schema's own `ref`s — no per-field mapping to maintain.
    await this.historyLabelService.labelChanges(Order.name, order.history);

    // What this order can do next, decided here rather than by each client
    // keeping its own copy of the workflow — one of which will drift.
    const status = order.orderStatus?.orderStatusName as
      | OrderStatusEnum
      | undefined;
    order.availableTransitions = status
      ? availableTransitionsFrom(status)
      : { allowed: [] };

    this.logger.log(`${base} has successfully retrieved order ${code}`);
    return order;
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
    // A hand-set price moves what the customer owes, so it carries the same
    // permission as a manual discount rather than riding on "can add a line".
    if (data.unitPrice !== undefined) this.can('UPDATE', 'Payment');
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

    // Adding a garment the order already carries — same item, service type,
    // condition and colour — counts it again rather than laying a second,
    // identical row beside the first. Anything that differs is still its own
    // row; that is what per-garment rows are for.
    const key = this.lineKey(data);
    const siblings = await this.orderItemModel.find({
      orderId: order._id,
      itemId: item._id,
      serviceTypeId: new Types.ObjectId(data.serviceTypeId),
    });
    const existing = siblings.find((row) => this.lineKey(row) === key);

    if (existing) {
      existing.quantity += data.quantity;
      // A freshly agreed price replaces the old one; omitting it keeps
      // whatever the line was already worth.
      if (data.unitPrice !== undefined) existing.unitPrice = data.unitPrice;
      applyAuditLocals(existing, this.req, userId);
      await existing.save();
    } else {
      const orderItem = new this.orderItemModel({
        itemId: item._id,
        orderId: order._id,
        serviceTypeId: new Types.ObjectId(data.serviceTypeId),
        quantity: data.quantity,
        // lineTotal is a placeholder — reprice() computes it right after.
        unitPrice: data.unitPrice ?? 0,
        lineTotal: 0,
        condition: data.condition ?? OrderItemConditionEnum.NORMAL,
        colour: data.colour,
      });
      applyAuditLocals(orderItem, this.req, userId);
      await orderItem.save();
    }

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
      {
        context: auditContext(this.req, userId),
        returnDocument: 'after',
      } as never,
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
      context: auditContext(this.req, userId),
      returnDocument: 'after',
    } as never);

    await this.reprice(order._id, userId);

    this.logger.log(
      `${base} deleted order item ${params.orderItemId} from ${order.orderCode}`,
    );
    return 'Order item deleted successfully';
  }

  /**
   * The audit trail of an order's garments: every line added, corrected or
   * removed, newest first.
   *
   * Read through the history rows' own `snapshot.orderId` rather than through
   * the order's surviving lines, because a removed garment's row is deleted
   * outright — walking the lines that remain would hide exactly the change an
   * operator opens this to check, and a garment that was added and taken away
   * again would leave no trace at all.
   *
   * `snapshot` itself is never returned: it is a full copy of the line per
   * entry and says nothing the changes and the summary fields don't.
   */
  async findOrderItemHistory({
    orderId,
  }: OrderParamsDto): Promise<OrderItemHistoryEntry[]> {
    // The trail of a line is the order's own data, so it is readable by whoever
    // may read the order — no separate ability, and no view of a line for
    // someone who cannot see the order it belongs to.
    this.can('READ', 'Order');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const id = new Types.ObjectId(orderId);
    const order = await this.orderModel
      .findOne({ _id: id, ...this.orderScope('READ') })
      .select('_id orderCode');

    if (!order) {
      this.logger.error(`${base} invalid/out-of-scope orderId ${orderId}`);
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Order not found',
      });
    }

    const history =
      await this.orderItemHistoryModel.aggregate<OrderItemHistoryEntry>([
        { $match: { 'snapshot.orderId': id } },
        { $sort: { createdAt: -1 } },
        { $limit: ORDER_HISTORY_LIMIT },
        {
          $lookup: {
            as: 'changedByUser',
            from: 'user',
            localField: 'changedBy',
            foreignField: '_id',
            pipeline: [{ $project: SAFE_USER_PROJECTION }],
          },
        },
        {
          $unwind: {
            path: '$changedByUser',
            preserveNullAndEmptyArrays: true,
          },
        },
        // The garment is named from the snapshot, not from the line: the line
        // may be gone, and on an entry that changed the garment's own fields
        // the snapshot is what that entry was actually about.
        {
          $lookup: {
            as: 'item',
            from: 'item',
            localField: 'snapshot.itemId',
            foreignField: '_id',
            pipeline: [{ $project: { itemName: 1 } }],
          },
        },
        { $unwind: { path: '$item', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            action: 1,
            reason: 1,
            createdAt: 1,
            changedBy: 1,
            changedByUser: 1,
            orderItemId: 1,
            item: 1,
            // A CREATE and a DELETE carry no changed fields — the line simply
            // began or ended — so the entry states what it was.
            quantity: '$snapshot.quantity',
            colour: '$snapshot.colour',
            condition: '$snapshot.condition',
            changes: {
              $map: {
                as: 'change',
                input: {
                  $objectToArray: { $ifNull: ['$changedFields', {}] },
                },
                in: {
                  field: '$$change.k',
                  from: '$$change.v.from',
                  to: '$$change.v.to',
                },
              },
            },
          },
        },
      ]);

    // `serviceTypeId: 6a58…aa5 → 6a58…aa7` means nothing to a reader; the same
    // generic labelling the order's trail gets, off OrderItem's own refs.
    await this.historyLabelService.labelChanges(OrderItem.name, history);

    this.logger.log(
      `${base} retrieved ${history.length} garment history entrie(s) for ${order.orderCode}`,
    );
    return history;
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
  ): Promise<TransitionKindEnum> {
    // Every move — forward, corrected or cancelled — is an UPDATE on the
    // order. Confirming used to demand a separate CONFIRM action that was
    // never seeded as a permission row, so in practice only a Manager
    // (`manage all`) could confirm anything.
    const action: CaslActionsDto = 'UPDATE';
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
    const kind = classifyTransition(current, target);
    if (!kind) {
      this.logger.error(
        `${base} illegal transition ${current}->${target} for ${order.orderCode}`,
      );
      throw new ConflictException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `An order cannot move from ${current} to ${target}`,
        // What the caller could have asked for instead, so a client does not
        // have to keep its own copy of the workflow to recover from this.
        allowed: availableTransitionsFrom(current).allowed,
      });
    }

    const isCancelling = kind === TransitionKindEnum.CANCELLATION;
    /**
     * A draft has spent nothing yet, so the quota and promo it was priced
     * against are taken the moment it goes live — whichever status it is set
     * to. DRAFT is unreachable afterwards, which is what makes "once" true.
     */
    const goesLive = current === OrderStatusEnum.DRAFT && !isCancelling;

    // Precondition: an order must hold at least one garment before it leaves
    // DRAFT for anywhere but CANCELLED. Keyed on leaving the draft rather than
    // on arriving at CONFIRMED, because a draft can now be set straight to
    // RECEIVED and an empty order is no more sound there.
    if (goesLive) {
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
      // The kind rides into the audit trail: a cancellation is recorded as
      // CANCEL, so a timeline never reads calling the work off as progress.
      context: auditContext(this.req, userId, HISTORY_ACTION_BY_KIND[kind]),
      returnDocument: 'after',
    } as never);

    // Quota decrement + promo usage, taken once as the draft goes live and
    // handed back only if the order is later cancelled.
    if (goesLive) {
      await this.finalizeOnConfirm(order as unknown as Order);
    }
    if (this.releasesCommitments(current, kind)) {
      await this.releaseOnUnconfirm(order as unknown as Order, userId);
    }

    await this.syncPickupOnTransition(order.pickupRequestId, target, userId);

    const event: OrderStatusChangedEvent = {
      orderId: order._id,
      from: current,
      to: target,
      kind,
      changedBy: userId,
    };
    this.eventEmitter.emit(OrderEvents.statusChanged, event);

    this.logger.log(
      `${base} order ${order.orderCode} ${current}->${target} (${kind})`,
    );
    return kind;
  }

  /**
   * Whether this move gives back what going live took: the subscription quota
   * the order reserved and the promo redemption it burned.
   *
   * Only a cancellation does, and only once the order had gone live —
   * cancelling straight out of DRAFT reverses nothing, because a draft never
   * took anything in the first place.
   */
  private releasesCommitments(
    current: OrderStatusEnum,
    kind: TransitionKindEnum,
  ): boolean {
    if (current === OrderStatusEnum.DRAFT) return false;
    return kind === TransitionKindEnum.CANCELLATION;
  }

  /**
   * The exact inverse of `finalizeOnConfirm()`: hand the subscription quota
   * back, drop the promo redemption and un-count it.
   *
   * Written in one transaction because these are two collections plus the
   * order's own row — a half-applied release would either strand quota nobody
   * can use or leave a promo code counted against a customer who never got it.
   */
  private async releaseOnUnconfirm(order: Order, changedBy: Types.ObjectId) {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        if (order.subscriptionId && order.quotaConsumed > 0) {
          await this.subscriptionModel.updateOne(
            { _id: order.subscriptionId },
            { $inc: { remainingQuota: order.quotaConsumed } },
            { session },
          );
        }

        if (order.promoCodeId) {
          const { deletedCount } = await this.promoUsageModel.deleteOne(
            { orderId: order._id, promoCodeId: order.promoCodeId },
            { session },
          );
          // Only give the use back if one was actually recorded, or a repeated
          // release would drive usedCount below the number of real redemptions.
          if (deletedCount) {
            await this.promoCodeModel.updateOne(
              { _id: order.promoCodeId },
              { $inc: { usedCount: -1 } },
              { session },
            );
          }
        }
      });
    } catch (err) {
      if (isTransactionUnsupported(err)) {
        this.logger.error(
          'Cannot release order commitments: this MongoDB deployment does ' +
            'not support transactions. Point DATABASE_URL at a replica set.',
        );
        throw new ServiceUnavailableException({
          code: 'TRANSACTIONS_UNSUPPORTED',
          message:
            'The order could not be updated because the database is not ' +
            'configured for transactions. Please contact support.',
        });
      }
      throw err;
    } finally {
      await session.endSession();
    }

    this.logger.log(
      `released commitments for order ${order.orderCode} by ${changedBy.toString()}`,
    );
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
        {
          context: auditContext(this.req, userId),
          returnDocument: 'after',
        } as never,
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
          {
            context: auditContext(this.req, userId),
            returnDocument: 'after',
          } as never,
        );
      }
    }
  }

  /**
   * Move an order to `target`, whatever kind of move that turns out to be.
   * The single entry point behind POST /orders/:orderId/transitions; the named
   * methods below are thin aliases kept for the existing verb routes.
   */
  async transitionOrder(orderId: string, target: OrderStatusEnum) {
    const kind = await this.transition(orderId, target);
    return TRANSITION_MESSAGES[kind](target);
  }

  async confirmOrder(orderId: string) {
    await this.transition(orderId, OrderStatusEnum.CONFIRMED);
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
