import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
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
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { SAFE_OFFICE_PROJECTION } from 'src/helper/projection/office.projection';
import { SAFE_USER_PROJECTION } from 'src/helper/projection/user.projection';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import {
  applyAuditLocals,
  auditContext,
} from 'src/helper/service/audit-context';
import { AppUtilService } from 'src/helper/service/app-util.service';
import {
  buildExportCsv,
  buildExportExcel,
  type ExportColumn,
} from 'src/helper/service/export-file.service';
import { scopeFilter } from 'src/helper/casl/casl-scope';
import {
  HistoryLabelService,
  type HistoryEntryLike,
} from 'src/helper/service/history-label.service';
import { Currency } from 'src/schema/catalog/currency.schema';
import { Office } from 'src/schema/office/office.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { OrderPaymentStatusEnum } from 'src/schema/order/order.dto';
import { Order } from 'src/schema/order/order.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { PaymentMethod } from 'src/schema/payment/payment-method.schema';
import { PaymentType } from 'src/schema/payment/payment-type.schema';
import {
  PaymentPeriodEnum,
  PaymentTypeEnum,
} from 'src/schema/payment/payment.dto';
import { paymentHistorySchemaName } from 'src/schema/payment/payment-history.schema';
import { Payment } from 'src/schema/payment/payment.schema';
import { OrderEvents, type OrderPaidEvent } from '../order/order.events';
import {
  computePaymentStatus,
  computeFlagged,
  computePaymentPeriod,
} from './payment-status.util';
import { OrderParamsDto } from '../order/dto/create-order-item.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import {
  ExportPaymentDto,
  PaymentExportFormatEnum,
} from './dto/export-payment.dto';
import { FindPaymentDto } from './dto/find-payment.dto';
import { PaymentEvents, type PaymentRecordedEvent } from './payment.events';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';

/** Payments counted per type — the breakdown behind the KPI cards. */
export type PaymentTypeCounts = {
  payment: number;
  refund: number;
};

/** Headline figures for the payments dashboard, over the list's own filters. */
export type PaymentKpis = {
  /** Net of the matched payments — refunds subtract. Integer XAF. */
  totalAmount: number;
  /** How many payment records matched, refunds included — not an amount. */
  totalPayments: number;
  /** Net of the payments booked to the order's own month. */
  totalCurrent: number;
  /** Net of the payments clearing an earlier month's balance. */
  totalPrior: number;
  /** Records counted per type. A type with no records comes back as 0. */
  byPaymentType: PaymentTypeCounts;
};

/**
 * Type name → KPI key. Payment types are a closed set the money math itself
 * depends on — unlike the methods, which are catalog rows that come and go —
 * so mapping them explicitly is safe and keeps the two spellings in one place.
 */
const TYPE_KPI_KEYS: Record<PaymentTypeEnum, keyof PaymentTypeCounts> = {
  [PaymentTypeEnum.PAYMENT]: 'payment',
  [PaymentTypeEnum.REFUND]: 'refund',
};

/**
 * How many trail entries a detail read returns. A payment is written once and
 * rarely touched again, so this is a guard against a pathological row rather
 * than a page size anyone will hit.
 */
const PAYMENT_HISTORY_LIMIT = 100;

/** One entry of the audit trail, flattened for a timeline to render. */
export type PaymentHistoryEntry = HistoryEntryLike & {
  action: string;
  reason?: string;
  createdAt: Date;
};

/** One payment with every foreign key resolved, plus its trail. */
export type PaymentDetail = Record<string, unknown> & {
  reference: string;
  history: PaymentHistoryEntry[];
};

/** One row of the payments export — every column is already display-ready. */
type PaymentExportRow = {
  reference: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  office: string;
  paymentType: string;
  paymentMethod: string;
  paymentPeriod: string;
  amount: number;
  currency: string;
  paidAt: Date | null;
  transactionRef: string;
  receivedBy: string;
  note: string;
  createdAt: string;
};

// Column order + headers, shared by both CSV and Excel so the two formats stay
// identical. `key` maps to a field on PaymentExportRow.
const PAYMENT_EXPORT_COLUMNS: ExportColumn<PaymentExportRow>[] = [
  { header: 'Reference', key: 'reference' },
  { header: 'Order Code', key: 'orderCode' },
  { header: 'Customer', key: 'customerName' },
  { header: 'Phone', key: 'customerPhone' },
  { header: 'Office', key: 'office' },
  { header: 'Payment Type', key: 'paymentType' },
  { header: 'Payment Method', key: 'paymentMethod' },
  { header: 'Period', key: 'paymentPeriod' },
  { header: 'Amount', key: 'amount' },
  { header: 'Currency', key: 'currency' },
  { header: 'Paid At', key: 'paidAt' },
  { header: 'Transaction Ref', key: 'transactionRef' },
  { header: 'Received By', key: 'receivedBy' },
  { header: 'Note', key: 'note' },
  { header: 'Created At', key: 'createdAt' },
];

/**
 * Order join. Like the customer join it runs BEFORE the free-text filter, so
 * `q` can match the order's code — which lives on the order, not the payment.
 *
 * `as` is the local field itself, so the id is replaced by the document it
 * points at: the same shape `populate()` produced before.
 */
const ORDER_LOOKUP: PipelineStage[] = [
  {
    $lookup: {
      as: 'orderId',
      from: 'order',
      localField: 'orderId',
      foreignField: '_id',
    },
  },
  { $unwind: { path: '$orderId', preserveNullAndEmptyArrays: true } },
];

/**
 * Customer join. Same story as the order join: it runs before the free-text
 * filter so `q` can reach the customer's name, email and phone.
 */
const CUSTOMER_LOOKUP: PipelineStage[] = [
  {
    $lookup: {
      from: 'user',
      as: 'customerId',
      localField: 'customerId',
      foreignField: '_id',
      pipeline: [{ $project: SAFE_USER_PROJECTION }],
    },
  },
  { $unwind: { path: '$customerId', preserveNullAndEmptyArrays: true } },
];

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,

    @InjectModel(PaymentType.name)
    private readonly paymentTypeModel: Model<PaymentType>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,

    @Inject(REQUEST) private readonly req: AppRequestWithUser,

    @InjectModel(PaymentMethod.name)
    private readonly paymentMethodModel: Model<PaymentMethod>,

    @InjectModel(Currency.name) private readonly currencyModel: Model<Currency>,

    @InjectModel(Office.name) private readonly officeModel: Model<Office>,

    private readonly codeService: CodeGeneratorService,

    private readonly historyLabelService: HistoryLabelService,

    @InjectConnection() private readonly connection: Connection,
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

  /**
   * Resolve the name/code filters to the ids the payment actually stores, so
   * every match rides an index instead of a post-join scan.
   *
   * An unknown name or code yields a fresh ObjectId that matches nothing —
   * "no payments" is the honest answer for an office or a method that does not
   * exist, and it never widens the result the way dropping the filter would.
   */
  private async buildPaymentMatch(
    query: Omit<FindPaymentDto, 'page' | 'size' | 'sort'>,
  ): Promise<{
    match: Record<string, unknown>;
    typeStages: PipelineStage.Match[];
  }> {
    const whereClause: Record<string, unknown> = {};

    if (query.orderCode) {
      const order = await this.orderModel
        .findOne({ orderCode: query.orderCode.trim() })
        .select('_id')
        .lean();
      whereClause['orderId'] = order?._id ?? new Types.ObjectId();
    }

    if (query.paymentMethod) {
      const method = await this.paymentMethodModel
        .findOne({ paymentMethodName: query.paymentMethod.trim() })
        .select('_id')
        .lean();
      whereClause['paymentMethodId'] = method?._id ?? new Types.ObjectId();
    }

    // Filter by type name (not id): resolve the name to its id. Kept OUT of
    // whereClause so a caller that wants the filters minus the type — the KPI
    // breakdown behind the tab strip — can simply drop `typeStages`.
    const typeStages: PipelineStage.Match[] = [];
    if (query.paymentType) {
      const type = await this.paymentTypeModel
        .findOne({ paymentTypeName: query.paymentType })
        .select('_id')
        .lean();
      typeStages.push({
        $match: { paymentTypeId: type?._id ?? new Types.ObjectId() },
      });
    }

    let officeIdFilter: Types.ObjectId | undefined;
    if (query.officeCode) {
      const office = await this.officeModel
        .findOne({ officeCode: query.officeCode.trim().toUpperCase() })
        .select('_id')
        .lean();
      officeIdFilter = office?._id ?? new Types.ObjectId();
    }

    // Paid-date window. Both bounds are optional; with neither we default to
    // the last 30 days so the list never does an unbounded scan.
    const now = new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const endDate = this.appUtilService.parseRangeEnd(query.endDate) ?? now;
    whereClause['paidAt'] = { $gte: startDate, $lte: endDate };

    // Auto-scope: office staff → their office's payments; customer → own.
    const scope = scopeFilter(this.req.user.ability, 'READ', 'Payment');
    const match: Record<string, unknown> = { ...whereClause, ...scope };

    // $and rather than another key on match: the scope may already pin
    // officeId, and a spread would let one silently replace the other. A
    // scoped user asking for another office must get nothing back, not their
    // own office's payments relabelled as the answer.
    if (officeIdFilter) match.$and = [{ officeId: officeIdFilter }];

    return { match, typeStages };
  }

  /**
   * The filter half of the list pipeline, shared verbatim by the count, the
   * page itself and the KPIs — so the headline figures always describe exactly
   * the set the table is showing, and paging stays exact.
   *
   * The order and customer joins run first because `q` searches the order's
   * code and the customer's name, email and phone — none of which live on the
   * payment — alongside the payment's own reference.
   */
  private async buildPaymentFilterStages(
    query: Omit<FindPaymentDto, 'page' | 'size' | 'sort'>,
  ): Promise<{
    filterStages: PipelineStage[];
    typeStages: PipelineStage.Match[];
  }> {
    const { match, typeStages } = await this.buildPaymentMatch(query);

    const filterStages: PipelineStage[] = [
      { $match: match },
      ...ORDER_LOOKUP,
      ...CUSTOMER_LOOKUP,
    ];

    // Narrow to one customer through the order they paid for, not through the
    // payment's own `customerId`: that field is optional on the schema, while
    // every payment hangs off exactly one order, so this is the only join that
    // cannot miss a receipt. An unknown code resolves to an id that matches
    // nothing, which is an empty list rather than the whole ledger.
    if (query.customerCode) {
      const customer = await this.customerModel
        .findOne({ customerCode: query.customerCode.trim().toUpperCase() })
        .select('userId')
        .lean();
      filterStages.push({
        $match: {
          'orderId.customerId': customer?.userId ?? new Types.ObjectId(),
        },
      });
    }

    if (query.q && query.q.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      filterStages.push({
        $match: {
          $or: [
            { reference: rx },
            { 'orderId.orderCode': rx },
            { 'customerId.firstName': rx },
            { 'customerId.lastName': rx },
            { 'customerId.email': rx },
            { 'customerId.phone': rx },
            { 'customerId.whatsappPhone': rx },
            // Full "first last" name search.
            {
              $expr: {
                $regexMatch: {
                  input: {
                    $concat: [
                      { $ifNull: ['$customerId.firstName', ''] },
                      ' ',
                      { $ifNull: ['$customerId.lastName', ''] },
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

    return { filterStages, typeStages };
  }

  async findAll({ page, size, ...query }: FindPaymentDto) {
    this.can('READ', 'Payment');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const logBase = `[${platform}] ${phone}`;

    const { filterStages, typeStages } =
      await this.buildPaymentFilterStages(query);
    const listStages = [...filterStages, ...typeStages];

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const countResult = await this.paymentModel.aggregate<{ total: number }>([
      ...listStages,
      { $count: 'total' },
    ]);
    const total = countResult[0]?.total ?? 0;

    // Every join writes back to the id field it read, so `officeId`,
    // `receivedBy`, `currencyId`, `paymentTypeId` and `paymentMethodId` each
    // come back as the document they point at — the shape `populate()`
    // produced, extended to the ones that were only ever raw ids before.
    // `orderId` and `customerId` are already resolved by the filter stages.
    const data = await this.paymentModel.aggregate([
      ...listStages,
      { $sort: sort },
      { $skip: skip },
      { $limit: size },

      {
        $lookup: {
          as: 'officeId',
          from: 'office',
          localField: 'officeId',
          foreignField: '_id',
          pipeline: [{ $project: SAFE_OFFICE_PROJECTION }],
        },
      },
      { $unwind: { path: '$officeId', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'receivedBy',
          from: 'user',
          localField: 'receivedBy',
          foreignField: '_id',
          pipeline: [{ $project: SAFE_USER_PROJECTION }],
        },
      },
      { $unwind: { path: '$receivedBy', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'currencyId',
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
      { $unwind: { path: '$currencyId', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'paymentTypeId',
          from: 'payment_type',
          localField: 'paymentTypeId',
          foreignField: '_id',
        },
      },
      { $unwind: { path: '$paymentTypeId', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'paymentMethodId',
          from: 'payment_method',
          localField: 'paymentMethodId',
          foreignField: '_id',
        },
      },
      {
        $unwind: {
          path: '$paymentMethodId',
          preserveNullAndEmptyArrays: true,
        },
      },
    ]);

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all payments`);
    return { total, data, nextPage };
  }

  /**
   * One payment by its human-readable reference, with every foreign key
   * resolved and its audit trail attached — everything a detail screen shows
   * in a single round trip.
   *
   * Office/self scoped through the same READ conditions as the list, so a
   * payment belonging to another office simply is not found rather than being
   * readable by anyone who can guess a reference.
   *
   * The trail carries only what changed (field, from, to), who changed it and
   * why. The stored `snapshot` — a full copy of the payment per entry — is
   * deliberately dropped: it would dwarf the payment itself and adds nothing a
   * reader of the timeline needs.
   */
  async findByReference(reference: string): Promise<PaymentDetail> {
    this.can('READ', 'Payment');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const code = reference.trim();
    const scope = scopeFilter(this.req.user.ability, 'READ', 'Payment');

    const [payment] = await this.paymentModel.aggregate<PaymentDetail>([
      { $match: { reference: code, ...scope } },
      { $limit: 1 },

      // Every join writes back to the id field it read, so the detail reads
      // the same shape as a list row: `orderId` is the order, `customerId` the
      // customer, and so on.
      ...ORDER_LOOKUP,
      ...CUSTOMER_LOOKUP,

      {
        $lookup: {
          as: 'officeId',
          from: 'office',
          localField: 'officeId',
          foreignField: '_id',
          pipeline: [{ $project: SAFE_OFFICE_PROJECTION }],
        },
      },
      { $unwind: { path: '$officeId', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'receivedBy',
          from: 'user',
          localField: 'receivedBy',
          foreignField: '_id',
          pipeline: [{ $project: SAFE_USER_PROJECTION }],
        },
      },
      { $unwind: { path: '$receivedBy', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'currencyId',
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
      { $unwind: { path: '$currencyId', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'paymentTypeId',
          from: 'payment_type',
          localField: 'paymentTypeId',
          foreignField: '_id',
        },
      },
      { $unwind: { path: '$paymentTypeId', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'paymentMethodId',
          from: 'payment_method',
          localField: 'paymentMethodId',
          foreignField: '_id',
        },
      },
      {
        $unwind: {
          path: '$paymentMethodId',
          preserveNullAndEmptyArrays: true,
        },
      },

      // The audit trail: what changed, by whom, newest first. `changedFields`
      // is an object keyed by field name, so it is turned into a flat array a
      // timeline can render directly. `snapshot` is never projected.
      {
        $lookup: {
          as: 'history',
          from: paymentHistorySchemaName,
          localField: '_id',
          foreignField: 'paymentId',
          pipeline: [
            { $sort: { createdAt: -1 } },
            { $limit: PAYMENT_HISTORY_LIMIT },
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

      // The client-supplied dedupe key is a secret of sorts and the trail's
      // business is elsewhere — neither belongs on this screen.
      { $project: { idempotencyKey: 0 } },
    ]);

    if (!payment) {
      this.logger.error(
        `${base} unknown/out-of-scope payment reference ${code}`,
      );
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Payment not found',
      });
    }

    // `paymentTypeId: 6a58…547 → 6a58…548` means nothing to a reader, so every
    // foreign key in the trail gets its label attached. Generic, off the
    // schema's own `ref`s — no per-field mapping to maintain.
    await this.historyLabelService.labelChanges(Payment.name, payment.history);

    this.logger.log(`${base} has successfully retrieved payment ${code}`);
    return payment;
  }

  /**
   * Headline numbers for the payments dashboard, over the exact same filters
   * as the list — every param included — so the cards always describe the set
   * the table is showing.
   *
   * One `$facet`, not two aggregations: the totals and the per-type breakdown
   * read the same filtered set, so they are computed in a single pass and
   * cannot disagree about what they are counting.
   *
   * Every total is a NET figure: amounts are stored positive with the
   * direction living in the payment's type, so a refund is subtracted rather
   * than added. `totalPayments` is the exception — it counts records, and a
   * refund is a record like any other.
   */
  async getPaymentKpis(query: FindPaymentDto): Promise<PaymentKpis> {
    this.can('READ', 'Payment');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { filterStages, typeStages } =
      await this.buildPaymentFilterStages(query);

    // What the payment is worth to the books: negative for a refund. Joined
    // once, before the facet, so both branches read the same resolved type.
    const signedAmount = {
      $cond: [
        { $eq: ['$pt.paymentTypeName', PaymentTypeEnum.REFUND] },
        { $multiply: ['$amount', -1] },
        '$amount',
      ],
    };

    const sumWhenPeriod = (period: PaymentPeriodEnum) => ({
      $sum: { $cond: [{ $eq: ['$paymentPeriod', period] }, signedAmount, 0] },
    });

    const [facet] = await this.paymentModel.aggregate<{
      totals: {
        totalAmount: number;
        totalPayments: number;
        totalCurrent: number;
        totalPrior: number;
      }[];
      byType: { _id: string | null; count: number }[];
    }>([
      ...filterStages,
      {
        $lookup: {
          as: 'pt',
          from: 'payment_type',
          localField: 'paymentTypeId',
          foreignField: '_id',
          pipeline: [{ $project: { paymentTypeName: 1 } }],
        },
      },
      { $unwind: { path: '$pt', preserveNullAndEmptyArrays: true } },
      {
        $facet: {
          // The cards narrow with the type tab…
          totals: [
            ...typeStages,
            {
              $group: {
                _id: null,
                totalAmount: { $sum: signedAmount },
                totalPayments: { $sum: 1 },
                totalCurrent: sumWhenPeriod(PaymentPeriodEnum.CURRENT),
                totalPrior: sumWhenPeriod(PaymentPeriodEnum.PRIOR),
              },
            },
          ],
          // …the breakdown never does. It is what the tab strip counts off,
          // and a count that collapsed to the selected tab would vanish the
          // moment you used it.
          byType: [
            { $group: { _id: '$pt.paymentTypeName', count: { $sum: 1 } } },
          ],
        },
      },
    ]);

    // Both buckets start at 0 so the shape is the same whether or not either
    // side saw activity — a dashboard card should read "0", not vanish.
    const byPaymentType: PaymentTypeCounts = { payment: 0, refund: 0 };
    for (const row of facet?.byType ?? []) {
      const key = TYPE_KPI_KEYS[row._id as PaymentTypeEnum];
      // A payment whose type row is gone still counts in the totals above,
      // where it is treated as money in — it just has no card to land on.
      if (key) byPaymentType[key] += row.count;
    }

    // $group emits nothing at all for an empty set, so the zeroed totals are
    // the answer for "no payments matched", not a missing one.
    const totals = facet?.totals[0];

    this.logger.log(
      `[${platform}] ${phone} has successfully retrieved payment kpis`,
    );

    return {
      totalAmount: totals?.totalAmount ?? 0,
      totalPayments: totals?.totalPayments ?? 0,
      totalCurrent: totals?.totalCurrent ?? 0,
      totalPrior: totals?.totalPrior ?? 0,
      byPaymentType,
    };
  }

  /**
   * The filtered set as a CSV or Excel download — every row, not a page.
   *
   * Runs the same filter stages as the list, so the file is exactly what the
   * table would show under the same query. `page`/`size` are ignored by
   * design: an export that stopped at 20 rows would be a trap.
   */
  async exportPayments({ format, ...query }: ExportPaymentDto): Promise<{
    buffer: Buffer;
    filename: string;
    contentType: string;
  }> {
    // Bulk export is gated on its own EXPORT action (not READ) so it can be
    // restricted to reporting/finance roles. The rows are still office/self
    // scoped by buildPaymentFilterStages via the READ conditions.
    this.can('EXPORT', 'Payment');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const logBase = `[${platform}] ${phone}`;

    const { filterStages, typeStages } =
      await this.buildPaymentFilterStages(query);

    const rows = await this.paymentModel.aggregate<PaymentExportRow>([
      ...filterStages,
      ...typeStages,
      {
        $lookup: {
          as: 'office',
          from: 'office',
          localField: 'officeId',
          foreignField: '_id',
          pipeline: [{ $project: { officeName: 1 } }],
        },
      },
      { $unwind: { path: '$office', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          as: 'paymentType',
          from: 'payment_type',
          localField: 'paymentTypeId',
          foreignField: '_id',
          pipeline: [{ $project: { paymentTypeName: 1 } }],
        },
      },
      { $unwind: { path: '$paymentType', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          as: 'paymentMethod',
          from: 'payment_method',
          localField: 'paymentMethodId',
          foreignField: '_id',
          pipeline: [{ $project: { paymentMethodName: 1 } }],
        },
      },
      { $unwind: { path: '$paymentMethod', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          as: 'currency',
          from: 'currency',
          localField: 'currencyId',
          foreignField: '_id',
          pipeline: [{ $project: { isoCode: 1 } }],
        },
      },
      { $unwind: { path: '$currency', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          as: 'receivedByUser',
          from: 'user',
          localField: 'receivedBy',
          foreignField: '_id',
          pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
        },
      },
      {
        $unwind: { path: '$receivedByUser', preserveNullAndEmptyArrays: true },
      },
      { $sort: { paidAt: -1 } },
      {
        $project: {
          _id: 0,
          reference: { $ifNull: ['$reference', ''] },
          orderCode: { $ifNull: ['$orderId.orderCode', ''] },
          customerName: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ['$customerId.firstName', ''] },
                  ' ',
                  { $ifNull: ['$customerId.lastName', ''] },
                ],
              },
            },
          },
          customerPhone: { $ifNull: ['$customerId.phone', ''] },
          office: { $ifNull: ['$office.officeName', ''] },
          paymentType: { $ifNull: ['$paymentType.paymentTypeName', ''] },
          paymentMethod: { $ifNull: ['$paymentMethod.paymentMethodName', ''] },
          paymentPeriod: { $ifNull: ['$paymentPeriod', ''] },
          amount: { $ifNull: ['$amount', 0] },
          currency: { $ifNull: ['$currency.isoCode', ''] },
          paidAt: { $ifNull: ['$paidAt', null] },
          transactionRef: { $ifNull: ['$transactionRef', ''] },
          receivedBy: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ['$receivedByUser.firstName', ''] },
                  ' ',
                  { $ifNull: ['$receivedByUser.lastName', ''] },
                ],
              },
            },
          },
          note: { $ifNull: ['$note', ''] },
          // System audit timestamp — full precision (date + time), unlike the
          // business date column, which is day-granular.
          createdAt: {
            $dateToString: {
              date: '$createdAt',
              format: '%Y-%m-%d %H:%M:%S',
              onNull: '',
            },
          },
        },
      },
    ]);

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    let result: { buffer: Buffer; filename: string; contentType: string };
    if (format === PaymentExportFormatEnum.EXCEL) {
      result = {
        buffer: await buildExportExcel(
          rows,
          PAYMENT_EXPORT_COLUMNS,
          'Payments',
        ),
        filename: `payments-export-${stamp}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    } else {
      result = {
        buffer: buildExportCsv(rows, PAYMENT_EXPORT_COLUMNS),
        filename: `payments-export-${stamp}.csv`,
        contentType: 'text/csv',
      };
    }

    this.logger.log(`${logBase} exported ${rows.length} payments as ${format}`);
    return result;
  }

  /**
   * Recomputes an order's money from the payments that exist, rather than by
   * adding a delta.
   *
   * An edit can move an amount in either direction, and a delta applied to a
   * total that has already drifted compounds the drift. Summing the payments
   * makes the order's figures a function of the ledger, so a correction can
   * only bring the two into agreement. Refunds subtract, exactly as the KPIs
   * and the reconcile treat them.
   */
  private async recomputeOrderMoney(
    orderId: Types.ObjectId,
    session: ClientSession,
  ) {
    const order = await this.orderModel
      .findById(orderId)
      .populate<{ orderStatusId: OrderStatus }>({
        model: OrderStatus.name,
        path: 'orderStatusId',
      })
      .session(session);

    if (!order) return;

    const [totals] = await this.paymentModel.aggregate<{ amountPaid: number }>(
      [
        { $match: { orderId } },
        {
          $lookup: {
            as: 'pt',
            from: 'payment_type',
            localField: 'paymentTypeId',
            foreignField: '_id',
            pipeline: [{ $project: { paymentTypeName: 1 } }],
          },
        },
        { $unwind: { path: '$pt', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            amountPaid: {
              $sum: {
                $cond: [
                  { $eq: ['$pt.paymentTypeName', PaymentTypeEnum.REFUND] },
                  { $multiply: ['$amount', -1] },
                  '$amount',
                ],
              },
            },
          },
        },
      ],
      { session },
    );

    const amountPaid = totals?.amountPaid ?? 0;
    const balanceDue = Math.max(0, order.totalAmount - amountPaid);
    const paymentStatus = computePaymentStatus(amountPaid, order.totalAmount);
    const statusName = order.orderStatusId?.orderStatusName ?? '';
    const flagged = computeFlagged(statusName, paymentStatus);

    const userId = new Types.ObjectId(this.req.user.userId);
    await this.orderModel.findOneAndUpdate(
      { _id: orderId },
      { amountPaid, balanceDue, paymentStatus, flagged },
      { session, context: auditContext(this.req, userId) } as never,
    );
  }

  /**
   * Corrects a payment that was recorded wrong, and brings its order's money
   * back in step.
   *
   * Gated on `manage all` — the highest ability there is, and nothing less.
   * Recording money is a counter job; rewriting money already recorded is not:
   * it moves a customer's balance after the fact, so it is reserved for a
   * global administrator rather than granted along with `UPDATE Payment`,
   * which every cashier holds.
   *
   * What may be changed is narrow by design — see UpdatePaymentDto for what is
   * withheld and why. `paymentPeriod` is re-derived whenever `paidAt` moves,
   * so it can never be asserted into the wrong accounting month.
   */
  async updateByReference(
    reference: string,
    data: UpdatePaymentDto,
  ): Promise<PaymentDetail> {
    // Not `UPDATE Payment`: that is the money-authority a cashier carries for
    // an order's own figures. Editing a recorded payment is strictly above it.
    this.can('manage', 'all');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const code = reference.trim();
    const payment = await this.paymentModel.findOne({ reference: code });

    if (!payment) {
      this.logger.error(`${base} unknown payment reference ${code}`);
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Payment not found',
      });
    }

    const update: Record<string, unknown> = {};
    if (data.amount !== undefined) update.amount = data.amount;
    if (data.note !== undefined) update.note = data.note;
    if (data.transactionRef !== undefined)
      update.transactionRef = data.transactionRef;

    if (data.paymentMethodId !== undefined) {
      const methodId = new Types.ObjectId(data.paymentMethodId);
      const method = await this.paymentMethodModel.findById(methodId);
      if (!method) {
        this.logger.error(
          `${base} invalid payment method id ${data.paymentMethodId}`,
        );
        throw new BadRequestException('Invalid payment method id');
      }
      update.paymentMethodId = method._id;
    }

    // The period follows the date it is derived from, so both move together or
    // neither does.
    if (data.paidAt !== undefined) {
      const paidAt = new Date(data.paidAt);
      const order = await this.orderModel
        .findById(payment.orderId)
        .select('receivedAt')
        .lean();

      update.paidAt = paidAt;
      if (order?.receivedAt)
        update.paymentPeriod = computePaymentPeriod(paidAt, order.receivedAt);
    }

    // An empty body would write an audit entry recording that nothing changed.
    if (!Object.keys(update).length) {
      this.logger.error(`${base} empty update for payment ${code}`);
      throw new BadRequestException({
        code: 'NOTHING_TO_UPDATE',
        message: 'Provide at least one field to change',
      });
    }

    const userId = new Types.ObjectId(this.req.user.userId);
    const orderId = payment.orderId;

    // The payment and the order's money move together: a correction that
    // committed one without the other would leave the balance lying.
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.paymentModel.findOneAndUpdate({ _id: payment._id }, update, {
          session,
          returnDocument: 'after',
          context: auditContext(this.req, userId),
        } as never);

        await this.recomputeOrderMoney(orderId, session);
      });
    } finally {
      await session.endSession();
    }

    // No `order.paid` event: that fires when a customer settles up and drives
    // their receipt. A back-office correction that happens to land on PAID is
    // not the customer paying, and must not message them as though it were.
    this.logger.log(
      `${base} corrected payment ${code} (${Object.keys(update).join(', ')})`,
    );

    return await this.findByReference(code);
  }

  async createPaymentForOrder(param: OrderParamsDto, data: CreatePaymentDto) {
    this.can('CREATE', 'Payment');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    // Validate order exists and is in the caller's payment scope — you can't
    // record a payment against another office's order by supplying its id. The
    // caller's Payment { officeId: '$office' } condition matches the order's
    // officeId; a global cashier is unrestricted.
    const orderId = new Types.ObjectId(param.orderId);
    const orderScope = scopeFilter(this.req.user.ability, 'CREATE', 'Payment');
    const order = await this.orderModel
      .findOne({ _id: orderId, ...orderScope })
      .populate<{
        orderStatusId: OrderStatus;
      }>({ model: OrderStatus.name, path: 'orderStatusId' });

    if (!order) {
      this.logger.error(
        `${base} invalid/out-of-scope order id ${param.orderId}`,
      );
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Order not found',
      });
    }

    // Check if order status allows payment (must be CONFIRMED or beyond)
    const orderStatus = order.orderStatusId;
    const statusName = orderStatus.orderStatusName;
    const disallowedStatuses = ['DRAFT', 'CANCELLED'];

    if (!statusName || disallowedStatuses.includes(statusName)) {
      this.logger.error(
        `${base} cannot create payment for order ${order.orderCode} with status ${statusName}`,
      );
      throw new BadRequestException(
        `Cannot create payment for order in ${statusName || 'unknown'} status. Order must be CONFIRMED or beyond.`,
      );
    }

    // Validate payment method exists
    const paymentMethodId = new Types.ObjectId(data.paymentMethodId);
    const paymentMethod =
      await this.paymentMethodModel.findById(paymentMethodId);
    if (!paymentMethod) {
      this.logger.error(
        `${base} invalid payment method id ${data.paymentMethodId}`,
      );
      throw new BadRequestException('Invalid payment method id');
    }

    // Validate payment type exists
    const paymentTypeId = new Types.ObjectId(data.paymentTypeId);
    const paymentType = await this.paymentTypeModel.findById(paymentTypeId);
    if (!paymentType) {
      this.logger.error(
        `${base} invalid payment type id ${data.paymentTypeId}`,
      );
      throw new BadRequestException('Invalid payment type id');
    }

    const isRefund =
      paymentType.paymentTypeName === PaymentTypeEnum.REFUND.toString();

    // Refunds are permissioned and can't precede any payment.
    if (isRefund) {
      this.can('manage', 'Payment');
      if (order.amountPaid === 0) {
        this.logger.error(
          `${base} cannot refund order ${order.orderCode} with no prior payments`,
        );
        throw new BadRequestException({
          code: 'REFUND_WITHOUT_PAYMENT',
          message: 'Cannot refund an order with no prior payments',
        });
      }
    }

    // Idempotency: a retried request carrying the same x-idempotency-key must
    // not double-count. Return the prior result instead of recording again.
    const idempotencyKey = this.getIdempotencyKey();
    if (idempotencyKey) {
      const existing = await this.paymentModel.findOne({ idempotencyKey });
      if (existing) {
        this.logger.log(`${base} idempotent replay for key ${idempotencyKey}`);
        return 'Payment already recorded';
      }
    }

    const currency = await this.currencyModel.findOne({ isoCode: 'XAF' });
    if (!currency) {
      this.logger.error(`${base} XAF currency not found`);
      throw new NotFoundException('XAF currency not found');
    }

    const userId = new Types.ObjectId(this.req.user.userId);
    const reference = await this.codeService.generatePaymentReference();

    // Which accounting month the money belongs to, against the order's own
    // business date (`receivedAt`, when the laundry was taken in). Derived
    // here rather than accepted from the caller so the AR aging can't be
    // asserted into the wrong bucket.
    const paidAt = new Date();
    const paymentPeriod = computePaymentPeriod(paidAt, order.receivedAt);
    const delta = isRefund ? -data.amount : data.amount;
    const newAmountPaid = order.amountPaid + delta;
    const newBalanceDue = Math.max(0, order.totalAmount - newAmountPaid);
    const paymentStatus = computePaymentStatus(
      newAmountPaid,
      order.totalAmount,
    );
    const flagged = computeFlagged(statusName, paymentStatus);

    // Record the payment and recompute the order's money in one transaction so a
    // retry/crash can't leave them inconsistent.
    let paymentId: Types.ObjectId | undefined;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        // Built and saved rather than Model.create()d so `$locals.changedBy`
        // is set before the save: that is the only thing the history hook can
        // read on a create, and without it the PaymentHistory row fails
        // validation and is dropped — a payment with no audit entry at all.
        const payment = new this.paymentModel({
          reference,
          orderId,
          customerId: order.customerId,
          officeId: this.req.data.officeId,
          note: data.note,
          paidAt,
          amount: data.amount,
          paymentPeriod,
          currencyId: currency.id,
          paymentTypeId,
          paymentMethodId: paymentMethod._id,
          transactionRef: data.transactionRef,
          idempotencyKey,
          receivedBy: userId,
        });
        applyAuditLocals(payment, this.req, userId);
        await payment.save({ session });
        paymentId = payment._id;

        await this.orderModel.findOneAndUpdate(
          { _id: orderId },
          {
            amountPaid: newAmountPaid,
            balanceDue: newBalanceDue,
            paymentStatus,
            flagged,
          },
          { session, context: auditContext(this.req, userId) } as never,
        );
      });
    } finally {
      await session.endSession();
    }

    // Emit after commit: payment.recorded always; order.paid when settled.
    const recorded: PaymentRecordedEvent = {
      paymentId: paymentId as Types.ObjectId,
      orderId,
      amount: data.amount,
      isRefund,
    };
    this.eventEmitter.emit(PaymentEvents.recorded, recorded);
    if (paymentStatus === OrderPaymentStatusEnum.PAID) {
      const paid: OrderPaidEvent = { orderId, customerId: order.customerId };
      this.eventEmitter.emit(OrderEvents.paid, paid);
    }

    this.logger.log(
      `${base} recorded payment for order ${order.orderCode} (${paymentStatus})`,
    );
    return 'Payment created successfully';
  }

  /** The x-idempotency-key request header, if present. */
  private getIdempotencyKey(): string | undefined {
    const raw = this.req.headers['x-idempotency-key'];
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  }
}
