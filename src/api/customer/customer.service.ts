import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import {
  applyAuditLocals,
  auditContext,
} from 'src/helper/service/audit-context';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { ActivityService } from 'src/helper/service/activity.service';
import { ActivityKindEnum } from 'src/schema/activity/activity.dto';
import {
  buildExportCsv,
  buildExportExcel,
  type ExportColumn,
} from 'src/helper/service/export-file.service';
import { scopeFilter } from 'src/helper/casl/casl-scope';
import {
  SAFE_OFFICE_PROJECTION,
  SAFE_OFFICE_SELECT,
} from 'src/helper/projection/office.projection';
import {
  SAFE_USER_PROJECTION,
  SAFE_USER_SELECT,
} from 'src/helper/projection/user.projection';
import { maskPhone } from 'src/helper/pii';
import { phoneQuery, toE164Digits } from 'src/helper/phone';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Customer } from 'src/schema/user/customer.schema';
import { followUpSchemaName } from 'src/schema/follow-up/follow-up.schema';
import { Referral, referralSchemaName } from 'src/schema/user/referral.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { UserTypeEum } from 'src/schema/user/user.dto';
import { User } from 'src/schema/user/user.schema';
import { Office, officeSchemaName } from 'src/schema/office/office.schema';
import { Order, orderSchemaName } from 'src/schema/order/order.schema';
import { orderItemSchemaName } from 'src/schema/order/order-item.schema';
import {
  OrderPaymentStatusEnum,
  OrderStatusEnum,
} from 'src/schema/order/order.dto';
import {
  OrderStatus,
  orderStatusSchemaName,
} from 'src/schema/order/order-status.schema';
import { Payment, paymentSchemaName } from 'src/schema/payment/payment.schema';
import { PaymentTypeEnum } from 'src/schema/payment/payment.dto';
import { paymentMethodSchemaName } from 'src/schema/payment/payment-method.schema';
import { pickupAssignmentSchemaName } from 'src/schema/pickup/pickup-assignment.schema';
import {
  PickupRequest,
  pickupRequestSchemaName,
} from 'src/schema/pickup/pickup-request.schema';
import {
  PickupStatus,
  pickupStatusSchemaName,
} from 'src/schema/pickup/pickup-status.schema';
import { RewardTier } from 'src/schema/reward/reward-tier.schema';
import { RewardTierMetricEnum } from 'src/schema/reward/reward.dto';
import { CustomerHistory } from 'src/schema/user/customer-history.schema';
import { userHistorySchemaName } from 'src/schema/user/user-history.schema';
import { HistoryLabelService } from 'src/helper/service/history-label.service';
import { Subscription } from 'src/schema/subscription/subscription.schema';
import { SubscriptionPlan } from 'src/schema/subscription/subscription-plan.schema';
import { SubscriptionStatusEnum } from 'src/schema/subscription/subscription.dto';
import { type PaginationDto } from 'src/dto/request-data.dto';
import { RewardService } from '../reward/reward.service';
import {
  CustomerExportFormatEnum,
  ExportCustomerDto,
} from './dto/export-customer.dto';
import { FindCustomerDto } from './dto/find-customer.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

// Canonical "inactive" threshold until the settings collection lands (§19).
// Doubles as the width of the KPI at-risk window.
export const DEFAULT_INACTIVE_DAYS = 14;

/** Raw shape of the single KPI aggregation, before it is named for the client. */
type CustomerKpiFacet = {
  total: { n: number }[];
  newCustomers: { n: number }[];
  atRisk: { n: number }[];
  byStatus: { _id: boolean | null; n: number }[];
};

/**
 * Home-office join. `as` is the local field itself, so the id is replaced by
 * the office it points at — the shape `populate()` gives the detail read.
 *
 * It runs last, on the page that survived the filters, rather than inside the
 * shared filter stages: nothing filters on the office document (`officeCode`
 * is resolved to an id up front), so joining before the count would resolve an
 * office for every matched customer and throw the work away.
 */
/**
 * Referral join — the row that says this customer was brought in by someone.
 * `as` is the local field itself, so the id is replaced by the referral it
 * points at, and the referral's own `referrerId` is replaced in turn by the
 * referrer's identity: a bare referral row is two ids and a status, which no
 * screen can render without a second round trip.
 */
const REFERRAL_LOOKUP: PipelineStage[] = [
  {
    $lookup: {
      as: 'referredBy',
      from: referralSchemaName,
      localField: 'referredBy',
      foreignField: '_id',
      pipeline: [
        {
          $lookup: {
            as: 'referrerId',
            from: 'user',
            localField: 'referrerId',
            foreignField: '_id',
            pipeline: [{ $project: SAFE_USER_PROJECTION }],
          },
        },
        { $unwind: { path: '$referrerId', preserveNullAndEmptyArrays: true } },
      ],
    },
  },
  // Organic customers have no referral — keep the row, leave the field unset.
  { $unwind: { path: '$referredBy', preserveNullAndEmptyArrays: true } },
];

/** One row of the customer export, as the projection below shapes it. */
type CustomerExportRow = {
  customerCode: string;
  name: string;
  phone: string;
  whatsappPhone: string;
  email: string;
  language: string;
  status: string;
  homeOffice: string;
  pickupAddress: string;
  referralCode: string;
  totalOrders: number;
  totalSpend: number;
  rewardPoints: number;
  lastOrderAt: Date | null;
  registeredAt: Date | null;
  createdAt: string;
  updatedAt: string;
};

/** Column order of the customer export — drives both CSV and Excel. */
const CUSTOMER_EXPORT_COLUMNS: ExportColumn<CustomerExportRow>[] = [
  { header: 'Customer Code', key: 'customerCode' },
  { header: 'Name', key: 'name' },
  { header: 'Phone', key: 'phone' },
  { header: 'WhatsApp', key: 'whatsappPhone' },
  { header: 'Email', key: 'email' },
  { header: 'Language', key: 'language' },
  { header: 'Status', key: 'status' },
  { header: 'Home Office', key: 'homeOffice' },
  { header: 'Pickup Address', key: 'pickupAddress' },
  { header: 'Referral Code', key: 'referralCode' },
  { header: 'Total Orders', key: 'totalOrders' },
  { header: 'Total Spend', key: 'totalSpend' },
  { header: 'Reward Points', key: 'rewardPoints' },
  { header: 'Last Order At', key: 'lastOrderAt' },
  { header: 'Registered At', key: 'registeredAt' },
  { header: 'Created At', key: 'createdAt' },
  { header: 'Updated At', key: 'updatedAt' },
];

/**
 * Latest follow-up for the inactive view (§2.4) — whether CS was already
 * alerted and whether it was resolved.
 */
const FOLLOW_UP_LOOKUP: PipelineStage[] = [
  {
    $lookup: {
      from: followUpSchemaName,
      let: { cid: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$customerId', '$$cid'] } } },
        { $sort: { triggeredAt: -1 } },
        { $limit: 1 },
      ],
      as: 'followUp',
    },
  },
  { $addFields: { followUp: { $arrayElemAt: ['$followUp', 0] } } },
];

const OFFICE_LOOKUP: PipelineStage[] = [
  {
    $lookup: {
      as: 'homeOfficeId',
      from: officeSchemaName,
      localField: 'homeOfficeId',
      foreignField: '_id',
      pipeline: [{ $project: SAFE_OFFICE_PROJECTION }],
    },
  },
  // Customers are not office-owned, so the field is often unset — keep the row.
  { $unwind: { path: '$homeOfficeId', preserveNullAndEmptyArrays: true } },
];

// ------------------------------------------------------------- detail types
// Raw aggregation shapes, before they are named for the client.

/**
 * Resolves the order's status so the money figures can leave cancellations
 * out. Cancelled work was called off: it never sold anything and it owes
 * nothing, which is the same reading the order KPIs take when they drop
 * cancellations from the completion rate.
 */
const ORDER_STATUS_LOOKUP: PipelineStage[] = [
  {
    $lookup: {
      as: 'orderStatus',
      from: orderStatusSchemaName,
      localField: 'orderStatusId',
      foreignField: '_id',
      pipeline: [{ $project: { orderStatusName: 1 } }],
    },
  },
  { $unwind: { path: '$orderStatus', preserveNullAndEmptyArrays: true } },
];

/**
 * What a payment is worth to the books. Amounts are stored positive with the
 * direction living in the payment's type, so a refund subtracts — the same
 * expression the payments ledger and the order's own `amountPaid` use.
 */
/** The payment-type schema declares no exported collection name of its own. */
const PAYMENT_TYPE_COLLECTION = 'payment_type';

const SIGNED_PAYMENT_AMOUNT = {
  $cond: [
    { $eq: ['$paymentType.paymentTypeName', PaymentTypeEnum.REFUND] },
    { $multiply: ['$payments.amount', -1] },
    '$payments.amount',
  ],
};

type OrderTotalsFacet = {
  total: number;
  cancelled: number;
  withoutPickup: number;
  paidInFull: number;
  ordered: number;
  paid: number;
  outstanding: number;
  outstandingOrders: number;
};

/** What a customer with no orders yet reads as — zeros, not an absent card. */
const EMPTY_ORDER_TOTALS: OrderTotalsFacet = {
  total: 0,
  cancelled: 0,
  withoutPickup: 0,
  paidInFull: 0,
  ordered: 0,
  paid: 0,
  outstanding: 0,
  outstandingOrders: 0,
};

type PickupTotalsFacet = { total: number; lastPickupAt?: Date };

type PaymentMethodFacet = {
  _id: Types.ObjectId;
  count: number;
  amount: number;
  lastUsedAt?: Date;
  method?: { paymentMethodName: string };
};

type MonthFacet = { _id: string; amount: number; orders: number };

/**
 * `timestamps: true` is set on the schema but does not reach the class type,
 * so the created date has to be named for TypeScript before it can be read.
 */
type TimestampedPickup = PickupRequest & { createdAt: Date };

type TimelinePaymentRow = {
  orderCode: string;
  amount: number;
  paidAt: Date;
  reference: string;
  method?: string;
};

export type SpendTrendMonth = {
  month: string;
  ordered: number;
  /** `null` when the caller may not read payments — see `getSpendTrend`. */
  paid: number | null;
  orders: number;
};

export type SpendTrend = {
  months: SpendTrendMonth[];
  averageOrder: number;
  ordersPerMonth: number;
  changePercent?: number;
};

export type CustomerSummary = {
  orders: {
    total: number;
    cancelled: number;
    withoutPickup: number;
    paidInFull: number;
  };
  /** `null` when the caller may not read pickups — never a misleading zero. */
  totalPickups: number | null;
  spend: {
    ordered: number;
    paid: number;
    outstanding: number;
    outstandingOrders: number;
  };
  payments: {
    count: number | null;
    total: number;
    average: number | null;
  };
  /** `null` when the caller may not read payments. */
  methods:
    | {
        method: string;
        amount: number;
        count: number;
        share: number;
        lastUsedAt?: Date;
      }[]
    | null;
  activity: {
    lastOrderAt?: Date;
    lastPickupAt?: Date;
    lastPaymentAt?: Date;
    lastActivityAt?: Date;
    daysSinceLastOrder?: number;
    /** Ordered before, nothing in the last 14 days — the overview's rule. */
    atRisk: boolean;
  };
};

/** One audit-trail row, after the trail has been flattened for a reader. */
export type HistoryEntry = {
  action: string;
  reason?: string;
  source: 'customer' | 'user';
  changes: {
    field: string;
    from: unknown;
    to: unknown;
    fromLabel?: string;
    toLabel?: string;
  }[];
  changedByUser?: Record<string, unknown> | null;
  createdAt: Date;
};

export type TimelineEvent = {
  kind:
    | 'ORDER_CREATED'
    | 'ORDER_DELIVERED'
    | 'PAYMENT_RECORDED'
    | 'PICKUP_REQUESTED'
    | 'PROFILE_CHANGED';
  at: Date;
  reference?: string;
  relatedReference?: string;
  amount?: number;
  status?: string;
  actor?: Record<string, unknown>;
  fields?: string[];
};

/** Whole days between a past date and now — the "gone quiet" measure. */
const daysBetween = (from: Date, to: Date = new Date()): number =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    private readonly codeService: CodeGeneratorService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(UserType.name) private readonly userTypeModel: Model<UserType>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(Referral.name) private readonly referralModel: Model<Referral>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Office.name) private readonly officeModel: Model<Office>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<Subscription>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    @InjectModel(PickupRequest.name)
    private readonly pickupRequestModel: Model<PickupRequest>,
    @InjectModel(CustomerHistory.name)
    private readonly customerHistoryModel: Model<CustomerHistory>,
    @InjectModel(RewardTier.name)
    private readonly rewardTierModel: Model<RewardTier>,
    private readonly historyLabelService: HistoryLabelService,
    private readonly rewardService: RewardService,
    private readonly activityService: ActivityService,
  ) {}

  private can(action: CaslActionsDto, subject: CaslSubjectsDto) {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;

    if (!ability.can(action, subject)) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} is ${log}`);
      throw new ForbiddenException(`You are ${log}`);
    }
  }

  /**
   * Register a customer: creates the `User`(customer) + its 1:1 `Customer`
   * profile with a generated customerCode and the customer's own referralCode.
   * A supplied `referralCode` links `referredBy` and opens a PENDING referral.
   */
  async register(data: RegisterCustomerDto) {
    this.can('CREATE', 'Customer');
    const platform = this.req.data.platform;
    const actorId = new Types.ObjectId(this.req.user.userId);
    const base = `[${platform}] ${this.req.user.phone}`;

    const customerType = await this.userTypeModel.findOne({
      userTypeName: UserTypeEum.CUSTOMER.toString(),
    });
    if (!customerType) {
      this.logger.error(`${base} CUSTOMER user type not seeded`);
      throw new BadRequestException('Customer user type not configured');
    }

    /**
     * Stored with the country code, so the same human cannot arrive twice —
     * once as `670678660` and once as `237670678660`. The duplicate check
     * looks for every spelling; the write uses the normalised one.
     */
    const phone = toE164Digits(data.phone);
    const whatsappPhone = toE164Digits(data.whatsappPhone);

    const phoneTaken = await this.userModel.exists({
      phone: phoneQuery(data.phone),
    });
    if (phoneTaken) {
      this.logger.warn(`${base} phone ${maskPhone(data.phone)} already exists`);
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A user with this phone already exists',
      });
    }

    if (data.email) {
      const emailTaken = await this.userModel.exists({ email: data.email });
      if (emailTaken) {
        this.logger.warn(`${base} email already taken`);
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'The provided email has been taken',
        });
      }
    }

    // Resolve the referrer (if any) before creating anything.
    let referrer: Customer | null = null;
    if (data.referralCode) {
      referrer = await this.customerModel.findOne({
        referralCode: data.referralCode,
      });
      if (!referrer) {
        this.logger.error(`${base} unknown referral code ${data.referralCode}`);
        throw new BadRequestException({
          code: 'INVALID_REFERRAL_CODE',
          message: 'The referral code is not valid',
        });
      }
    }

    // Every account is addressed by its reference, the same way a staff
    // account is — minted before the row exists, never afterwards.
    const reference = await this.codeService.generateUserReference();

    const user = new this.userModel({
      reference,
      firstName: data.firstName,
      lastName: data.lastName,
      phone,
      whatsappPhone,
      email: data.email,
      gender: data.gender,
      userTypeId: customerType._id,
    });
    applyAuditLocals(user, this.req, actorId);
    await user.save();

    let referredBy: Types.ObjectId | undefined;
    if (referrer) {
      const referral = new this.referralModel({
        referrerId: referrer.userId,
        referredUserId: user._id,
      });
      applyAuditLocals(referral, this.req, actorId);
      await referral.save();
      referredBy = referral._id;
    }

    const [customerCode, referralCode] = await Promise.all([
      this.codeService.generateCustomerCode(),
      this.codeService.generateReferralCode(),
    ]);

    const customer = new this.customerModel({
      userId: user._id,
      customerCode,
      referralCode,
      pickupAddress: data.pickupAddress,
      homeOfficeId: data.homeOfficeId
        ? new Types.ObjectId(data.homeOfficeId)
        : undefined,
      referredBy,
    });
    applyAuditLocals(customer, this.req, actorId);
    await customer.save();

    this.logger.log(`${base} registered customer ${customerCode}`);
    return { customerCode, referralCode };
  }

  /**
   * `registeredAt` window from the optional bounds, or undefined when neither
   * is given. The upper bound goes through `parseRangeEnd`, so a date-only
   * `endDate` covers the whole day — asking for "up to the 5th" means the 5th
   * included, not up to its midnight.
   */
  private buildRegisteredAtRange(
    query: Pick<FindCustomerDto, 'startDate' | 'endDate'>,
  ): Record<string, Date> | undefined {
    const range: Record<string, Date> = {};
    if (query.startDate) range.$gte = new Date(query.startDate);

    const end = this.appUtilService.parseRangeEnd(query.endDate);
    if (end) range.$lte = end;

    return Object.keys(range).length ? range : undefined;
  }

  /**
   * The filter half of the customer pipeline, shared verbatim by the list, the
   * KPIs and the export — so the headline figures always describe exactly the
   * set the table is showing, and an export matches what the list would return.
   *
   * Split three ways because the KPIs need to drop two of the three:
   * - `filterStages` — office, keyword, inactivity + the user join.
   * - `statusStages` — the `isActive` filter, dropped for the `byStatus`
   *   breakdown so a status tab strip keeps its counts whichever tab is on.
   * - `dateStages` — the `registeredAt` window, dropped for the KPI totals:
   *   there the range dates New/Active/At-Risk rather than narrowing the base.
   */
  private async buildCustomerFilterStages(
    query: Omit<FindCustomerDto, 'page' | 'size' | 'sort'>,
  ): Promise<{
    filterStages: PipelineStage[];
    statusStages: PipelineStage.Match[];
    dateStages: PipelineStage.Match[];
  }> {
    const match: Record<string, unknown> = {};

    // Auto-scope, applied here rather than per endpoint: the list, the KPIs and
    // the export all build their pipeline from this method, so a customer's
    // seeded `{ userId: '$self' }` condition narrows every one of them and the
    // three cannot drift apart. Staff/global roles get `{}` and are
    // unrestricted. The export reads the READ scope too — EXPORT says whether
    // you may pull a file at all, never which rows it may carry.
    const scope = scopeFilter(this.req.user.ability, 'READ', 'Customer');
    // `$and` rather than a spread: the inactivity filter below owns `$or`, and
    // a scope carrying its own `$or` would silently replace it — handing a
    // scoped caller rows the scope was meant to hide.
    if (Object.keys(scope).length) match.$and = [scope];

    // Filter by office code, not id: the code is what staff read off the UI,
    // and the id is an implementation detail. An unknown code resolves to a
    // sentinel id so the filter matches nothing instead of being dropped —
    // silently returning every customer would be the wrong answer.
    if (query.officeCode) {
      const office = await this.officeModel
        .findOne({ officeCode: query.officeCode.trim().toUpperCase() })
        .select('_id')
        .lean();
      match.homeOfficeId = office?._id ?? new Types.ObjectId();
    }

    // Registration window. Both bounds are optional and there is no implicit
    // default — the customer base is the whole list by design, unlike the
    // order/payment lists that window to the last 30 days.
    const registeredAt = this.buildRegisteredAtRange(query);
    const dateStages: PipelineStage.Match[] = registeredAt
      ? [{ $match: { registeredAt } }]
      : [];

    if (query.inactiveDays) {
      const threshold = new Date(
        Date.now() - query.inactiveDays * 24 * 60 * 60 * 1000,
      );
      // Never-ordered customers count as inactive too.
      match.$or = [
        { lastOrderAt: { $lte: threshold } },
        { lastOrderAt: { $exists: false } },
      ];
    }

    // These run after the user join because they read the `user` half of the
    // profile: `q` spans both documents (names, email and phones on `user`, the
    // codes on the customer profile), while the language lives on `user` alone.
    const userMatch: Record<string, unknown> = {};
    if (query.language) userMatch['user.preferredLanguage'] = query.language;

    if (query.q?.trim()) {
      const escaped = this.appUtilService.escapeRegex(query.q.trim());
      const rx = new RegExp(escaped, 'i');
      userMatch.$or = [
        { 'user.firstName': rx },
        { 'user.lastName': rx },
        { 'user.email': rx },
        { 'user.phone': rx },
        { 'user.whatsappPhone': rx },
        { customerCode: rx },
        { referralCode: rx },
        // Full "first last" name search.
        {
          $expr: {
            $regexMatch: {
              input: {
                $concat: [
                  { $ifNull: ['$user.firstName', ''] },
                  ' ',
                  { $ifNull: ['$user.lastName', ''] },
                ],
              },
              regex: escaped,
              options: 'i',
            },
          },
        },
      ];
    }

    // The account status is a `user` field like the two above, but it is kept
    // apart so the KPI breakdown can run the very same filters minus this one.
    const statusStages: PipelineStage.Match[] =
      query.isActive === undefined
        ? []
        : [{ $match: { 'user.isActive': query.isActive } }];

    const filterStages: PipelineStage[] = [
      { $match: match },
      {
        $lookup: {
          from: 'user',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $match: userMatch },
    ];

    return { filterStages, statusStages, dateStages };
  }

  async findAll({ page, size, ...query }: FindCustomerDto) {
    this.can('READ', 'Customer');

    const { filterStages, statusStages, dateStages } =
      await this.buildCustomerFilterStages(query);

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);
    const pipeline: PipelineStage[] = [
      ...filterStages,
      ...statusStages,
      ...dateStages,
    ];

    const countResult = await this.customerModel.aggregate<{ total: number }>([
      ...pipeline,
      { $count: 'total' },
    ]);
    const total = countResult[0]?.total ?? 0;

    const data = await this.customerModel.aggregate([
      ...pipeline,
      { $sort: sort },
      { $skip: skip },
      { $limit: size },
      ...OFFICE_LOOKUP,
      ...REFERRAL_LOOKUP,
      // Inactive view (§2.4): attach the latest follow-up so the list shows
      // whether CS was already alerted and whether it's resolved. On the page
      // only — the count never reads it.
      ...(query.inactiveDays ? FOLLOW_UP_LOOKUP : []),
    ]);

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;
    return { total, data, nextPage };
  }

  /**
   * The window the KPI cards describe.
   *
   * The range dates the metrics, it does not narrow the base: `totalCustomers`
   * and `byStatus` answer "of everyone matching the filters", while New and
   * Active answer "within these dates". At-Risk hangs off the end date alone —
   * the 14 days ending on it, which is a different window whenever the caller
   * asked for a longer range.
   *
   * With no dates at all the whole thing collapses onto that same 14 days
   * ending today, so an unfiltered call reads as "the fortnight up to now".
   * Both bounds are inclusive of their day, so 14 days ending 5 Aug starts on
   * 23 Jul, not 22.
   */
  private resolveKpiWindow(
    query: Pick<FindCustomerDto, 'startDate' | 'endDate'>,
  ): {
    start: Date;
    end: Date;
    atRiskStart: Date;
  } {
    const end = this.appUtilService.parseRangeEnd(query.endDate) ?? new Date();

    // Midnight of the day that opens a window of AT_RISK_WINDOW_DAYS counting
    // the end date itself.
    const windowStart = new Date(end);
    windowStart.setUTCDate(
      windowStart.getUTCDate() - (DEFAULT_INACTIVE_DAYS - 1),
    );
    windowStart.setUTCHours(0, 0, 0, 0);

    return {
      start: query.startDate ? new Date(query.startDate) : windowStart,
      end,
      atRiskStart: windowStart,
    };
  }

  /**
   * Headline customer counts for the dashboard, over the list filters.
   *
   * Takes the same query params as `GET /customers`, but the date range plays
   * a different role here — see `resolveKpiWindow`. `activeCustomers` is the
   * one figure that cannot be answered from the customer collection, so it
   * runs a second aggregation over the orders placed in the window.
   */
  async getCustomerKpis(query: Omit<FindCustomerDto, 'page' | 'size'>) {
    this.can('READ', 'Customer');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { filterStages, statusStages } =
      await this.buildCustomerFilterStages(query);
    const { start, end, atRiskStart } = this.resolveKpiWindow(query);

    // One pass over the filtered customers, four figures out — the counts all
    // read the same set, so splitting them into separate round trips would
    // only risk them disagreeing.
    const [facet] = await this.customerModel.aggregate<CustomerKpiFacet>([
      ...filterStages,
      {
        $facet: {
          total: [...statusStages, { $count: 'n' }],
          newCustomers: [
            ...statusStages,
            { $match: { registeredAt: { $gte: start, $lte: end } } },
            { $count: 'n' },
          ],
          // "Previously ordered, but not inside the window": the rollup holds
          // the latest order date, so an earlier one means nothing since.
          // A customer who never ordered is not at risk — they are a lead.
          atRisk: [
            ...statusStages,
            { $match: { lastOrderAt: { $exists: true, $lt: atRiskStart } } },
            { $count: 'n' },
          ],
          // Deliberately without `statusStages`: the breakdown is what a status
          // tab strip renders, so it must keep both counts whichever tab is on.
          byStatus: [{ $group: { _id: '$user.isActive', n: { $sum: 1 } } }],
        },
      },
    ]);

    const activeCustomers = await this.countActiveCustomers(
      [...filterStages, ...statusStages],
      start,
      end,
    );

    const countOf = (rows: { n: number }[]) => rows[0]?.n ?? 0;
    const statusRow = (isActive: boolean) =>
      facet.byStatus.find((row) => row._id === isActive)?.n ?? 0;

    this.logger.log(`[${platform}] ${phone} has successfully retrieved kpis`);

    return {
      totalCustomers: countOf(facet.total),
      newCustomers: countOf(facet.newCustomers),
      activeCustomers,
      atRiskCustomers: countOf(facet.atRisk),
      byStatus: { active: statusRow(true), inactive: statusRow(false) },
      window: { start, end, atRiskStart },
    };
  }

  /**
   * Customers out of the filtered set who placed at least one order inside the
   * window.
   *
   * Windowed on the order's own `createdAt` rather than `receivedAt` — that is
   * what `lastOrderAt` records, so "active" and "at risk" read the same clock
   * and a customer can never come back as both.
   */
  private async countActiveCustomers(
    stages: PipelineStage[],
    start: Date,
    end: Date,
  ): Promise<number> {
    const rows = await this.customerModel.aggregate<{ n: number }>([
      ...stages,
      {
        $lookup: {
          as: 'windowOrder',
          from: orderSchemaName,
          let: { uid: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$customerId', '$$uid'] },
                    { $gte: ['$createdAt', start] },
                    { $lte: ['$createdAt', end] },
                  ],
                },
              },
            },
            // One is proof enough — this counts customers, not orders.
            { $limit: 1 },
            { $project: { _id: 1 } },
          ],
        },
      },
      { $match: { 'windowOrder.0': { $exists: true } } },
      { $count: 'n' },
    ]);
    return rows[0]?.n ?? 0;
  }

  /**
   * Customers inactive for at least `inactiveDays` (default 14). Threshold
   * should come from `settings` once that collection exists (§19) — defaulted
   * for now. Follow-up status is Phase 2 (WhatsApp job + follow-ups log).
   */
  async findInactive(query: FindCustomerDto) {
    const inactiveDays = query.inactiveDays ?? DEFAULT_INACTIVE_DAYS;
    return this.findAll({ ...query, inactiveDays });
  }

  /**
   * Export the filtered customers (same params as findAll, no pagination) as a
   * CSV or Excel file. Returns the raw bytes + filename + content-type; the
   * controller streams them as an attachment.
   */
  async exportCustomers({ format, ...query }: ExportCustomerDto): Promise<{
    buffer: Buffer;
    filename: string;
    contentType: string;
  }> {
    // Bulk export is gated on its own EXPORT action (not READ) so it can be
    // restricted to reporting/oversight roles — a customer export is a list of
    // names and phone numbers leaving the building.
    this.can('EXPORT', 'Customer');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { filterStages, statusStages, dateStages } =
      await this.buildCustomerFilterStages(query);

    const rows = await this.customerModel.aggregate<CustomerExportRow>([
      ...filterStages,
      ...statusStages,
      ...dateStages,
      {
        $lookup: {
          as: 'office',
          from: officeSchemaName,
          localField: 'homeOfficeId',
          foreignField: '_id',
          pipeline: [{ $project: { officeName: 1 } }],
        },
      },
      { $unwind: { path: '$office', preserveNullAndEmptyArrays: true } },
      { $sort: { registeredAt: -1 } },
      {
        $project: {
          _id: 0,
          customerCode: { $ifNull: ['$customerCode', ''] },
          name: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ['$user.firstName', ''] },
                  ' ',
                  { $ifNull: ['$user.lastName', ''] },
                ],
              },
            },
          },
          phone: { $ifNull: ['$user.phone', ''] },
          whatsappPhone: { $ifNull: ['$user.whatsappPhone', ''] },
          email: { $ifNull: ['$user.email', ''] },
          language: { $ifNull: ['$user.preferredLanguage', ''] },
          status: {
            $cond: [{ $eq: ['$user.isActive', false] }, 'Inactive', 'Active'],
          },
          homeOffice: { $ifNull: ['$office.officeName', ''] },
          pickupAddress: { $ifNull: ['$pickupAddress', ''] },
          referralCode: { $ifNull: ['$referralCode', ''] },
          totalOrders: { $ifNull: ['$totalOrders', 0] },
          totalSpend: { $ifNull: ['$totalSpend', 0] },
          rewardPoints: { $ifNull: ['$rewardPoints', 0] },
          lastOrderAt: { $ifNull: ['$lastOrderAt', null] },
          registeredAt: { $ifNull: ['$registeredAt', null] },
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
    if (format === CustomerExportFormatEnum.EXCEL) {
      result = {
        buffer: await buildExportExcel(
          rows,
          CUSTOMER_EXPORT_COLUMNS,
          'Customers',
        ),
        filename: `customers-export-${stamp}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    } else {
      result = {
        buffer: buildExportCsv(rows, CUSTOMER_EXPORT_COLUMNS),
        filename: `customers-export-${stamp}.csv`,
        contentType: 'text/csv',
      };
    }

    this.logger.log(
      `[${platform}] ${phone} exported ${rows.length} customers as ${format}`,
    );
    // A bulk pull leaves no trace on any record — the rows are only read — so
    // the trail is the only place it is ever visible.
    await this.activityService.recordFromRequest(this.req, {
      userId: new Types.ObjectId(this.req.user.userId),
      kind: ActivityKindEnum.EXPORT,
      action: 'customer.export',
      resource: 'Customer',
      metadata: { format, rows: rows.length },
    });

    return result;
  }

  /**
   * One customer by their code, with everything the profile card shows:
   * identity, reporting office, cached tier and the referral they came in on.
   *
   * Addressed by `customerCode`, never by `_id`: the code is what staff read
   * off a receipt. Self-scoped like every other read — a customer asking for
   * someone else's code gets a plain 404, not a 403, so the code space cannot
   * be probed.
   */
  async findByCode(customerCode: string) {
    this.can('READ', 'Customer');
    const scope = scopeFilter(this.req.user.ability, 'READ', 'Customer');

    const customer = await this.customerModel
      .findOne({ customerCode, ...scope })
      .populate({ model: User.name, path: 'userId', select: SAFE_USER_SELECT })
      .populate({
        model: Office.name,
        path: 'homeOfficeId',
        select: SAFE_OFFICE_SELECT,
      })
      .populate({ model: RewardTier.name, path: 'rewardTierId' })
      // Same shape the list gives, so a detail screen reads one contract.
      .populate({
        model: Referral.name,
        path: 'referredBy',
        populate: {
          model: User.name,
          path: 'referrerId',
          select: SAFE_USER_SELECT,
        },
      });

    if (!customer) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Customer not found',
      });
    }
    return customer;
  }

  // ------------------------------------------------ self-service (§2.3)
  // Every by-code read below resolves the customer through the caller's scope
  // on the given action first ({ userId: '$self' } for customers), so a
  // foreign customer code is a plain 404 — the cross-customer IDOR test rides
  // on this.

  /** Scoped profile fetch for the sub-resource views (action-specific). */
  private async findScopedCustomer(
    customerCode: string,
    action: CaslActionsDto,
  ): Promise<Customer> {
    const scope = scopeFilter(this.req.user.ability, action, 'Customer');
    const customer = await this.customerModel.findOne({
      customerCode,
      ...scope,
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Customer not found',
      });
    }
    return customer;
  }

  /**
   * Every headline figure the detail page opens with, in one round trip:
   * order and pickup counts, money ordered/paid/outstanding, how they pay,
   * and when they were last seen.
   *
   * Payments are reached through the customer's own orders rather than
   * `payment.customerId`, which the schema leaves optional — a payment always
   * hangs off exactly one order, so the join is both complete and impossible
   * to widen past the orders the caller may already read.
   */
  async getSummary(customerCode: string): Promise<CustomerSummary> {
    this.can('READ', 'Customer');
    this.can('READ', 'Order');
    const customer = await this.findScopedCustomer(customerCode, 'READ');
    const customerId = customer.userId;

    const { ability } = this.req.user;
    // The money is read off the orders' own rollups, so it needs nothing but
    // `READ Order`. The pickup count and the method breakdown do need their
    // own collections, and a role can hold one without the other — a cashier
    // reads payments and not pickups. Those two come back as `null` rather
    // than as a zero the reader would take for a fact.
    const seesPickups = ability.can('READ', 'PickupRequest');
    const seesPayments = ability.can('READ', 'Payment');
    const orderScope = scopeFilter(ability, 'READ', 'Order');
    const pickupScope = scopeFilter(ability, 'READ', 'PickupRequest');
    const orderMatch = { customerId, ...orderScope };

    const [[orderTotals], [pickupTotals], methodRows] = await Promise.all([
      this.orderModel.aggregate<OrderTotalsFacet>([
        { $match: orderMatch },
        ...ORDER_STATUS_LOOKUP,
        {
          $addFields: {
            // Called off, so it never sold anything and owes nothing. Every
            // money figure below is measured over the orders that still
            // stand — the same rule the order KPIs use when they take
            // cancellations out of the completion rate.
            live: {
              $ne: ['$orderStatus.orderStatusName', OrderStatusEnum.CANCELLED],
            },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            cancelled: { $sum: { $cond: ['$live', 0, 1] } },
            // `null` and a missing key are different in Mongo but the same to
            // a reader: neither is a pickup.
            withoutPickup: {
              $sum: {
                $cond: [
                  { $in: [{ $type: '$pickupRequestId' }, ['missing', 'null']] },
                  1,
                  0,
                ],
              },
            },
            // Read off the computed `paymentStatus`, not re-derived from the
            // balance: that field is what the payment engine maintains, and
            // OVERPAID is settled too.
            paidInFull: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      '$live',
                      {
                        $in: [
                          '$paymentStatus',
                          [
                            OrderPaymentStatusEnum.PAID,
                            OrderPaymentStatusEnum.OVERPAID,
                          ],
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            ordered: { $sum: { $cond: ['$live', '$totalAmount', 0] } },
            // The order's own maintained rollup, which is already net of
            // refunds — summing the raw payment rows instead would count a
            // refund as income.
            paid: { $sum: { $cond: ['$live', '$amountPaid', 0] } },
            outstanding: { $sum: { $cond: ['$live', '$balanceDue', 0] } },
            outstandingOrders: {
              $sum: {
                $cond: [{ $and: ['$live', { $gt: ['$balanceDue', 0] }] }, 1, 0],
              },
            },
          },
        },
      ]),
      seesPickups
        ? this.pickupRequestModel.aggregate<PickupTotalsFacet>([
            { $match: { customerId, ...pickupScope } },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                lastPickupAt: { $max: '$pickupDate' },
              },
            },
          ])
        : [],
      seesPayments
        ? this.orderModel.aggregate<PaymentMethodFacet>([
            { $match: orderMatch },
            ...ORDER_STATUS_LOOKUP,
            {
              $match: {
                'orderStatus.orderStatusName': {
                  $ne: OrderStatusEnum.CANCELLED,
                },
              },
            },
            {
              $lookup: {
                as: 'payments',
                from: paymentSchemaName,
                localField: '_id',
                foreignField: 'orderId',
              },
            },
            { $unwind: '$payments' },
            {
              $lookup: {
                as: 'paymentType',
                from: PAYMENT_TYPE_COLLECTION,
                localField: 'payments.paymentTypeId',
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
              $group: {
                _id: '$payments.paymentMethodId',
                // Records, refunds included — a refund is a payment row like any
                // other, which is how the payments ledger counts them.
                count: { $sum: 1 },
                // Value to the books: amounts are stored positive with the
                // direction living in the type, so a refund subtracts.
                amount: { $sum: SIGNED_PAYMENT_AMOUNT },
                lastUsedAt: { $max: '$payments.paidAt' },
              },
            },
            {
              $lookup: {
                as: 'method',
                from: paymentMethodSchemaName,
                localField: '_id',
                foreignField: '_id',
                pipeline: [{ $project: { paymentMethodName: 1 } }],
              },
            },
            { $unwind: { path: '$method', preserveNullAndEmptyArrays: true } },
            { $sort: { amount: -1 } },
          ])
        : [],
    ]);

    const orders = orderTotals ?? EMPTY_ORDER_TOTALS;
    const paidCount = methodRows.reduce((sum, row) => sum + row.count, 0);
    const lastPaymentAt = methodRows.reduce<Date | undefined>(
      (latest, row) =>
        row.lastUsedAt && (!latest || row.lastUsedAt > latest)
          ? row.lastUsedAt
          : latest,
      undefined,
    );

    const lastPickupAt = seesPickups ? pickupTotals?.lastPickupAt : undefined;
    // The customer's own maintained rollup, dated on the order's `createdAt`.
    // Recomputing it here would give the detail page a second clock, and the
    // customers overview measures "active" and "at risk" against this one.
    const lastOrderAt = customer.lastOrderAt;
    const lastActivityAt = [lastOrderAt, lastPickupAt, lastPaymentAt]
      .filter((date): date is Date => !!date)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    // Same rule as the overview's at-risk count: ordered before, nothing in
    // the 14 days ending today. A customer who has never ordered is a lead,
    // not a risk, so `lastOrderAt` must exist for this to be true.
    const atRiskStart = new Date();
    atRiskStart.setUTCDate(
      atRiskStart.getUTCDate() - (DEFAULT_INACTIVE_DAYS - 1),
    );
    atRiskStart.setUTCHours(0, 0, 0, 0);

    return {
      orders: {
        total: orders.total,
        cancelled: orders.cancelled,
        withoutPickup: orders.withoutPickup,
        paidInFull: orders.paidInFull,
      },
      totalPickups: seesPickups ? (pickupTotals?.total ?? 0) : null,
      spend: {
        ordered: orders.ordered,
        paid: orders.paid,
        outstanding: orders.outstanding,
        outstandingOrders: orders.outstandingOrders,
      },
      payments: {
        // The receipt count and the average need the payment rows themselves;
        // the total is the orders' own net figure, so it survives either way.
        count: seesPayments ? paidCount : null,
        total: orders.paid,
        average: seesPayments
          ? paidCount > 0
            ? Math.round(orders.paid / paidCount)
            : 0
          : null,
      },
      methods: !seesPayments
        ? null
        : methodRows.map((row) => ({
            method: row.method?.paymentMethodName ?? 'UNKNOWN',
            amount: row.amount,
            count: row.count,
            // Shares are read against each other, so they are rounded once here
            // rather than per screen — two frontends cannot then disagree.
            share:
              orders.paid > 0
                ? Math.round((row.amount / orders.paid) * 100)
                : 0,
            lastUsedAt: row.lastUsedAt,
          })),
      activity: {
        lastOrderAt,
        lastPickupAt,
        lastPaymentAt,
        lastActivityAt,
        daysSinceLastOrder: lastOrderAt ? daysBetween(lastOrderAt) : undefined,
        atRisk: !!lastOrderAt && lastOrderAt < atRiskStart,
      },
    };
  }

  /**
   * Ordered against paid, month by month, for the spend chart.
   *
   * Ordered is dated by `receivedAt` (when the work came in) and paid by
   * `paidAt` (when the money did), so a bar pair showing a gap is telling the
   * truth about a debt rather than about a reporting lag. Every month in the
   * window is present, even an empty one: a chart that skips quiet months
   * shows a steady customer where there was a pause.
   */
  async getSpendTrend(
    customerCode: string,
    months: number,
  ): Promise<SpendTrend> {
    this.can('READ', 'Customer');
    this.can('READ', 'Order');
    const customer = await this.findScopedCustomer(customerCode, 'READ');
    const customerId = customer.userId;

    const { ability } = this.req.user;
    // Ordered comes off the orders; paid needs the payment rows, because only
    // they carry the date the money actually arrived. Without that permission
    // the paid series is absent rather than flat zero, which would read as a
    // customer who never paid.
    const seesPayments = ability.can('READ', 'Payment');
    const orderScope = scopeFilter(ability, 'READ', 'Order');
    const orderMatch = { customerId, ...orderScope };
    // Cancellations are left out here for the same reason they are left out of
    // the totals: the chart and the cards must not disagree about what the
    // customer ordered.
    const liveOnly: PipelineStage.Match = {
      $match: {
        'orderStatus.orderStatusName': { $ne: OrderStatusEnum.CANCELLED },
      },
    };

    // Window starts at the first day of the month `months - 1` back, in UTC —
    // the same clock the stored dates use, so a bar never lands a month out.
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1),
    );
    const monthKey = (date: unknown) => ({
      $dateToString: { date, format: '%Y-%m', timezone: 'UTC' },
    });

    const [orderedRows, paidRows] = await Promise.all([
      this.orderModel.aggregate<MonthFacet>([
        // Dated on `createdAt`, which is the clock `lastOrderAt` and the
        // overview's active/at-risk counts already run on — one page, one
        // reading of when an order happened.
        { $match: { ...orderMatch, createdAt: { $gte: start } } },
        ...ORDER_STATUS_LOOKUP,
        liveOnly,
        {
          $group: {
            _id: monthKey('$createdAt'),
            amount: { $sum: '$totalAmount' },
            orders: { $sum: 1 },
          },
        },
      ]),
      !seesPayments
        ? []
        : this.orderModel.aggregate<MonthFacet>([
            { $match: orderMatch },
            ...ORDER_STATUS_LOOKUP,
            liveOnly,
            {
              $lookup: {
                as: 'payments',
                from: paymentSchemaName,
                localField: '_id',
                foreignField: 'orderId',
                pipeline: [{ $match: { paidAt: { $gte: start } } }],
              },
            },
            { $unwind: '$payments' },
            {
              $lookup: {
                as: 'paymentType',
                from: PAYMENT_TYPE_COLLECTION,
                localField: 'payments.paymentTypeId',
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
              $group: {
                _id: monthKey('$payments.paidAt'),
                // Net, like every other money total: a refund pulls the month's
                // paid bar down rather than pushing it up.
                amount: { $sum: SIGNED_PAYMENT_AMOUNT },
                orders: { $sum: 0 },
              },
            },
          ]),
    ]);

    const orderedBy = new Map(orderedRows.map((row) => [row._id, row]));
    const paidBy = new Map(paidRows.map((row) => [row._id, row]));

    const series: SpendTrendMonth[] = [];
    for (let i = 0; i < months; i += 1) {
      const at = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1),
      );
      const key = at.toISOString().slice(0, 7);
      series.push({
        month: key,
        ordered: orderedBy.get(key)?.amount ?? 0,
        paid: seesPayments ? (paidBy.get(key)?.amount ?? 0) : null,
        orders: orderedBy.get(key)?.orders ?? 0,
      });
    }

    const sum = (from: number, to: number) =>
      series.slice(from, to).reduce((total, row) => total + row.ordered, 0);
    const orderCount = series.reduce((total, row) => total + row.orders, 0);
    const totalOrdered = sum(0, series.length);

    // Last three months against the three before them. With fewer than six
    // months of window there is no earlier block to compare against.
    const last3 = sum(Math.max(0, series.length - 3), series.length);
    const prior3 = sum(
      Math.max(0, series.length - 6),
      Math.max(0, series.length - 3),
    );

    return {
      months: series,
      averageOrder: orderCount > 0 ? Math.round(totalOrdered / orderCount) : 0,
      ordersPerMonth:
        Math.round((orderCount / series.length + Number.EPSILON) * 10) / 10,
      changePercent:
        prior3 > 0 ? Math.round((last3 / prior3 - 1) * 100) : undefined,
    };
  }

  /**
   * Order history for one customer (paginated), carrying what the table
   * column needs: live status, the pickup it came off, and how many garments
   * it holds. The full order lives at `GET /orders/:orderCode`.
   */
  async findOrders(
    customerCode: string,
    { page, size, ...query }: PaginationDto,
  ) {
    this.can('READ', 'Customer');
    this.can('READ', 'Order');
    const customer = await this.findScopedCustomer(customerCode, 'READ');

    const orderScope = scopeFilter(this.req.user.ability, 'READ', 'Order');
    const match = { customerId: customer.userId, ...orderScope };

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(
      query.sort ?? 'receivedAt:desc',
    );
    const total = await this.orderModel.countDocuments(match);
    const data = await this.orderModel.aggregate<Record<string, unknown>>([
      { $match: match },
      { $sort: sort },
      { $skip: skip },
      { $limit: size },
      {
        $lookup: {
          as: 'orderStatus',
          from: orderStatusSchemaName,
          localField: 'orderStatusId',
          foreignField: '_id',
          pipeline: [{ $project: { orderStatusName: 1 } }],
        },
      },
      { $unwind: { path: '$orderStatus', preserveNullAndEmptyArrays: true } },
      // The pickup it came off, if any — the table links straight to it.
      {
        $lookup: {
          as: 'pickup',
          from: pickupRequestSchemaName,
          localField: 'pickupRequestId',
          foreignField: '_id',
          pipeline: [{ $project: { reference: 1, pickupDate: 1 } }],
        },
      },
      { $unwind: { path: '$pickup', preserveNullAndEmptyArrays: true } },
      // Garment count, summed off the normalized item rows rather than the
      // number of rows: one row can carry five identical shirts.
      {
        $lookup: {
          as: 'itemCount',
          from: orderItemSchemaName,
          localField: '_id',
          foreignField: 'orderId',
          pipeline: [
            { $group: { _id: null, quantity: { $sum: '$quantity' } } },
          ],
        },
      },
      {
        $project: {
          orderCode: 1,
          receivedAt: 1,
          createdAt: 1,
          deliveredAt: 1,
          estimatedDeliveryDate: 1,
          totalAmount: 1,
          amountPaid: 1,
          balanceDue: 1,
          paymentStatus: 1,
          flagged: 1,
          pickup: 1,
          status: { $ifNull: ['$orderStatus.orderStatusName', null] },
          items: {
            $ifNull: [{ $first: '$itemCount.quantity' }, 0],
          },
        },
      },
    ]);

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;
    return { total, data, nextPage };
  }

  /**
   * Pickup history for one customer (paginated). A pickup can carry several
   * orders and an order can exist without a pickup, so this count is read
   * beside the order count, never against it.
   */
  async findPickups(
    customerCode: string,
    { page, size, ...query }: PaginationDto,
  ) {
    this.can('READ', 'Customer');
    this.can('READ', 'PickupRequest');
    const customer = await this.findScopedCustomer(customerCode, 'READ');

    const scope = scopeFilter(this.req.user.ability, 'READ', 'PickupRequest');
    const match = { customerId: customer.userId, ...scope };

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(
      query.sort ?? 'pickupDate:desc',
    );
    const total = await this.pickupRequestModel.countDocuments(match);
    const data = await this.pickupRequestModel.aggregate<
      Record<string, unknown>
    >([
      { $match: match },
      { $sort: sort },
      { $skip: skip },
      { $limit: size },
      {
        $lookup: {
          as: 'pickupStatus',
          from: pickupStatusSchemaName,
          localField: 'pickupStatusId',
          foreignField: '_id',
          pipeline: [{ $project: { pickupStatusName: 1 } }],
        },
      },
      { $unwind: { path: '$pickupStatus', preserveNullAndEmptyArrays: true } },
      // Who went out for it, latest hand-over first: sorted on when the
      // assignment was written, not on `assignedAt`, which is the day the
      // agent is due out and can sit in the future.
      {
        $lookup: {
          as: 'assignment',
          from: pickupAssignmentSchemaName,
          localField: '_id',
          foreignField: 'pickupRequestId',
          pipeline: [
            { $sort: { updatedAt: -1, assignedAt: -1 } },
            { $limit: 1 },
            {
              $lookup: {
                as: 'agent',
                from: 'user',
                localField: 'agentId',
                foreignField: '_id',
                pipeline: [{ $project: SAFE_USER_PROJECTION }],
              },
            },
            { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
            { $project: { agent: 1, assignedAt: 1 } },
          ],
        },
      },
      {
        $lookup: {
          as: 'orderCodes',
          from: orderSchemaName,
          localField: '_id',
          foreignField: 'pickupRequestId',
          pipeline: [{ $project: { orderCode: 1 } }],
        },
      },
      {
        $project: {
          reference: 1,
          pickupDate: 1,
          pickupTime: 1,
          pickupAddress: 1,
          createdAt: 1,
          orderCodes: '$orderCodes.orderCode',
          orderCount: { $size: '$orderCodes' },
          agent: { $first: '$assignment.agent' },
          status: { $ifNull: ['$pickupStatus.pickupStatusName', null] },
        },
      },
    ]);

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;
    return { total, data, nextPage };
  }

  /**
   * Payment history for one customer (paginated), reached through their
   * orders — `payment.customerId` is optional on the schema, the order link
   * is not, so this is the only join that cannot miss a receipt.
   */
  async findPayments(
    customerCode: string,
    { page, size, ...query }: PaginationDto,
  ) {
    this.can('READ', 'Customer');
    this.can('READ', 'Order');
    this.can('READ', 'Payment');
    const customer = await this.findScopedCustomer(customerCode, 'READ');

    const orderScope = scopeFilter(this.req.user.ability, 'READ', 'Order');
    const orderIds = await this.orderModel
      .find({ customerId: customer.userId, ...orderScope })
      .distinct('_id');
    const match = { orderId: { $in: orderIds } };

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(
      query.sort ?? 'paidAt:desc',
    );
    const total = await this.paymentModel.countDocuments(match);
    const data = await this.paymentModel.aggregate<Record<string, unknown>>([
      { $match: match },
      { $sort: sort },
      { $skip: skip },
      { $limit: size },
      {
        $lookup: {
          as: 'order',
          from: orderSchemaName,
          localField: 'orderId',
          foreignField: '_id',
          pipeline: [{ $project: { orderCode: 1 } }],
        },
      },
      { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          as: 'paymentMethod',
          from: paymentMethodSchemaName,
          localField: 'paymentMethodId',
          foreignField: '_id',
          pipeline: [{ $project: { paymentMethodName: 1 } }],
        },
      },
      { $unwind: { path: '$paymentMethod', preserveNullAndEmptyArrays: true } },
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
        $unwind: { path: '$receivedByUser', preserveNullAndEmptyArrays: true },
      },
      {
        $project: {
          reference: 1,
          amount: 1,
          paidAt: 1,
          paymentPeriod: 1,
          transactionRef: 1,
          note: 1,
          receivedByUser: 1,
          orderCode: { $ifNull: ['$order.orderCode', null] },
          method: { $ifNull: ['$paymentMethod.paymentMethodName', null] },
        },
      },
    ]);

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;
    return { total, data, nextPage };
  }

  /**
   * The audit trail behind the profile (paginated).
   *
   * A customer is two records — the `Customer` profile carries the address,
   * opt-in and rollups, the `User` carries the name, phone, email and
   * language — and a reader does not care which one moved. Both trails are
   * merged into one list and each entry says where it came from. Only what
   * changed is returned; the stored snapshot never leaves the server.
   */
  async findHistory(
    customerCode: string,
    { page, size }: PaginationDto,
  ): Promise<{ total: number; data: HistoryEntry[]; nextPage: number | null }> {
    this.can('READ', 'Customer');
    const customer = await this.findScopedCustomer(customerCode, 'READ');

    const changeProjection = {
      action: 1,
      reason: 1,
      createdAt: 1,
      changedBy: 1,
      changes: {
        $map: {
          as: 'change',
          input: { $objectToArray: { $ifNull: ['$changedFields', {}] } },
          in: {
            field: '$$change.k',
            from: '$$change.v.from',
            to: '$$change.v.to',
          },
        },
      },
    };

    const skip = (page - 1) * size;
    const [{ rows, counted }] = await this.customerHistoryModel.aggregate<{
      rows: HistoryEntry[];
      counted: { n: number }[];
    }>([
      { $match: { customerId: customer._id } },
      { $project: { ...changeProjection, source: 'customer' } },
      {
        $unionWith: {
          coll: userHistorySchemaName,
          pipeline: [
            { $match: { userId: customer.userId } },
            { $project: { ...changeProjection, source: 'user' } },
          ],
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          counted: [{ $count: 'n' }],
          rows: [
            { $skip: skip },
            { $limit: size },
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
          ],
        },
      },
    ]);

    // `homeOfficeId: 6a58…53d → 6a58…53e` means nothing to a reader, so every
    // foreign key gets its label attached. The two trails are labelled apart
    // because the refs to resolve come off each schema's own definition.
    await Promise.all([
      this.historyLabelService.labelChanges(
        Customer.name,
        rows.filter((row) => row.source === 'customer'),
      ),
      this.historyLabelService.labelChanges(
        User.name,
        rows.filter((row) => row.source === 'user'),
      ),
    ]);

    const total = counted[0]?.n ?? 0;
    const totalPages = Math.ceil(total / size);
    return { total, data: rows, nextPage: page < totalPages ? page + 1 : null };
  }

  /**
   * One merged activity feed: orders raised and delivered, payments taken,
   * pickups requested and profile edits, newest first.
   *
   * Each source is capped at `limit` before the merge, so the feed costs the
   * same whether the customer has ten events or ten thousand. The API ships
   * facts, never sentences — the frontend words each kind in the reader's
   * language.
   */
  async findTimeline(
    customerCode: string,
    limit: number,
  ): Promise<TimelineEvent[]> {
    this.can('READ', 'Customer');
    this.can('READ', 'Order');
    const customer = await this.findScopedCustomer(customerCode, 'READ');
    const customerId = customer.userId;

    const { ability } = this.req.user;
    const orderScope = scopeFilter(ability, 'READ', 'Order');
    const pickupScope = scopeFilter(ability, 'READ', 'PickupRequest');
    const orderMatch = { customerId, ...orderScope };

    const [orders, payments, pickups, history] = await Promise.all([
      this.orderModel
        .find(orderMatch)
        .sort({ receivedAt: -1 })
        .limit(limit)
        .select('orderCode receivedAt deliveredAt totalAmount orderStatusId')
        .populate({
          model: OrderStatus.name,
          path: 'orderStatusId',
          select: 'orderStatusName',
        }),
      this.orderModel.aggregate<TimelinePaymentRow>([
        { $match: orderMatch },
        {
          $lookup: {
            as: 'payments',
            from: paymentSchemaName,
            localField: '_id',
            foreignField: 'orderId',
          },
        },
        { $unwind: '$payments' },
        { $sort: { 'payments.paidAt': -1 } },
        { $limit: limit },
        {
          $lookup: {
            as: 'method',
            from: paymentMethodSchemaName,
            localField: 'payments.paymentMethodId',
            foreignField: '_id',
            pipeline: [{ $project: { paymentMethodName: 1 } }],
          },
        },
        { $unwind: { path: '$method', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            orderCode: 1,
            amount: '$payments.amount',
            paidAt: '$payments.paidAt',
            reference: '$payments.reference',
            method: '$method.paymentMethodName',
          },
        },
      ]),
      this.pickupRequestModel
        .find({ customerId, ...pickupScope })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('reference pickupDate createdAt pickupStatusId')
        .populate({
          model: PickupStatus.name,
          path: 'pickupStatusId',
          select: 'pickupStatusName',
        }),
      this.findHistory(customerCode, { page: 1, size: limit } as PaginationDto),
    ]);

    const events: TimelineEvent[] = [];

    for (const order of orders) {
      const status = order.orderStatusId as unknown as OrderStatus | undefined;
      events.push({
        kind: 'ORDER_CREATED',
        at: order.receivedAt,
        reference: order.orderCode,
        amount: order.totalAmount,
        status: status?.orderStatusName,
      });
      if (order.deliveredAt) {
        events.push({
          kind: 'ORDER_DELIVERED',
          at: order.deliveredAt,
          reference: order.orderCode,
          amount: order.totalAmount,
        });
      }
    }

    for (const payment of payments) {
      events.push({
        kind: 'PAYMENT_RECORDED',
        at: payment.paidAt,
        reference: payment.reference,
        relatedReference: payment.orderCode,
        amount: payment.amount,
        status: payment.method,
      });
    }

    for (const pickup of pickups as unknown as TimestampedPickup[]) {
      const status = pickup.pickupStatusId as unknown as
        | PickupStatus
        | undefined;
      events.push({
        kind: 'PICKUP_REQUESTED',
        at: pickup.createdAt,
        reference: pickup.reference,
        status: status?.pickupStatusName,
      });
    }

    for (const entry of history.data) {
      events.push({
        kind: 'PROFILE_CHANGED',
        at: entry.createdAt,
        actor: entry.changedByUser ?? undefined,
        fields: entry.changes.map((change) => change.field),
      });
    }

    return events
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit);
  }

  /**
   * Balance, tier and recent ledger from the rewards engine, plus how close
   * the next tier is.
   *
   * `nextTier` is recomputed here rather than taken from the engine, which
   * reads it off the cached `rewardTierId`: that field is stamped by the
   * accrual job, so a customer who has spent enough but has not been through
   * a run yet has no tier at all, and the "next" tier then comes back as one
   * whose threshold they passed long ago. The rung a customer is actually
   * climbing towards is the lowest one they have NOT met.
   */
  async findRewards(customerCode: string) {
    this.can('READ', 'Customer');
    const customer = await this.findScopedCustomer(customerCode, 'READ');
    const summary = await this.rewardService.rewardsSummaryFor(customer.userId);

    const tiers = await this.rewardTierModel
      .find({ isActive: true })
      .sort({ rank: 1 });

    // The tier's own `metric` decides whether the race is run on money or on
    // order count — only this side knows that, so neither frontend guesses.
    const valueFor = (tier: RewardTier) =>
      tier.metric === RewardTierMetricEnum.ORDERS
        ? summary.totalOrders
        : summary.totalSpend;

    const nextIndex = tiers.findIndex(
      (tier) => valueFor(tier) < tier.threshold,
    );
    const nextTier = nextIndex === -1 ? null : tiers[nextIndex];

    // Measured from the rung below, not from zero: a customer halfway between
    // Silver and Gold is halfway, not 80% of the way because Gold's threshold
    // happens to be a big number.
    const floor = nextIndex > 0 ? tiers[nextIndex - 1].threshold : 0;
    const progress = nextTier
      ? (() => {
          const value = valueFor(nextTier);
          const span = nextTier.threshold - floor;
          return {
            metric: nextTier.metric,
            current: value,
            target: nextTier.threshold,
            percent:
              span > 0
                ? Math.min(
                    100,
                    Math.max(0, Math.round(((value - floor) / span) * 100)),
                  )
                : 100,
          };
        })()
      : null;

    return { ...summary, nextTier, progress };
  }

  /**
   * The referral picture: their own code and link, who brought them in, and
   * everyone they have brought in since.
   */
  async findReferral(customerCode: string) {
    this.can('READ', 'Customer');
    const customer = await this.findScopedCustomer(customerCode, 'READ');

    const [referred, referredBy] = await Promise.all([
      this.referralModel
        .find({ referrerId: customer.userId })
        .sort({ createdAt: -1 })
        .populate({
          model: User.name,
          path: 'referredUserId',
          select: SAFE_USER_SELECT,
        }),
      customer.referredBy
        ? this.referralModel.findById(customer.referredBy).populate({
            model: User.name,
            path: 'referrerId',
            select: SAFE_USER_SELECT,
          })
        : null,
    ]);

    return {
      referralCode: customer.referralCode,
      // Portal origin from env (same var the office-link flow uses).
      referralLink: `${process.env.DD_WEB_URL ?? ''}/r/${customer.referralCode}`,
      referredCount: referred.length,
      referredBy,
      referred,
    };
  }

  /** Outstanding balance + exactly which orders carry it. */
  async findBalance(customerCode: string) {
    this.can('READ', 'Customer');
    this.can('READ', 'Order');
    const customer = await this.findScopedCustomer(customerCode, 'READ');

    const orderScope = scopeFilter(this.req.user.ability, 'READ', 'Order');
    const owing = await this.orderModel
      .find({
        customerId: customer.userId,
        balanceDue: { $gt: 0 },
        ...orderScope,
      })
      .sort({ balanceDue: -1, createdAt: 1 })
      .select('orderCode totalAmount amountPaid balanceDue paymentStatus');

    const outstanding = owing.reduce((sum, o) => sum + o.balanceDue, 0);
    return { outstanding, orders: owing };
  }

  /** The customer's live subscription view (plan populated), if any. */
  async findSubscription(customerCode: string) {
    this.can('READ', 'Customer');
    const customer = await this.findScopedCustomer(customerCode, 'READ');

    const subscription = await this.subscriptionModel
      .findOne({
        customerId: customer.userId,
        status: {
          $in: [SubscriptionStatusEnum.ACTIVE, SubscriptionStatusEnum.PAUSED],
        },
      })
      .populate({ model: SubscriptionPlan.name, path: 'planId' });

    return { subscription };
  }

  /**
   * Self-service profile edit (§2.3): contact/preferences only. Splits the
   * write across the User (whatsappPhone/email/preferredLanguage) and the
   * Customer profile (pickupAddress/notificationsOptIn); both audited.
   */
  async updateProfile(customerCode: string, data: UpdateProfileDto) {
    this.can('UPDATE', 'Customer');
    const customer = await this.findScopedCustomer(customerCode, 'UPDATE');
    const changedBy = new Types.ObjectId(this.req.user.userId);

    if (data.email) {
      const emailTaken = await this.userModel.exists({
        email: data.email,
        _id: { $ne: customer.userId },
      });
      if (emailTaken) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'The provided email has been taken',
        });
      }
    }

    const userUpdate: Record<string, unknown> = {};
    if (data.whatsappPhone !== undefined)
      userUpdate.whatsappPhone = data.whatsappPhone;
    if (data.email !== undefined) userUpdate.email = data.email;
    if (data.preferredLanguage !== undefined)
      userUpdate.preferredLanguage = data.preferredLanguage;

    const profileUpdate: Record<string, unknown> = {};
    if (data.pickupAddress !== undefined)
      profileUpdate.pickupAddress = data.pickupAddress;
    if (data.notificationsOptIn !== undefined)
      profileUpdate.notificationsOptIn = data.notificationsOptIn;

    if (Object.keys(userUpdate).length > 0) {
      await this.userModel.findOneAndUpdate(
        { _id: customer.userId },
        userUpdate,
        { context: auditContext(this.req, changedBy) } as never,
      );
    }
    if (Object.keys(profileUpdate).length > 0) {
      await this.customerModel.findOneAndUpdate(
        { _id: customer._id },
        profileUpdate,
        { context: auditContext(this.req, changedBy) } as never,
      );
    }

    this.logger.log(`profile updated for customer ${customer.customerCode}`);
    return 'Profile updated successfully';
  }
}
