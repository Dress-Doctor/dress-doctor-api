import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import { SAFE_OFFICE_PROJECTION } from 'src/helper/projection/office.projection';
import { SAFE_USER_PROJECTION } from 'src/helper/projection/user.projection';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { ActivityService } from 'src/helper/service/activity.service';
import { ActivityKindEnum } from 'src/schema/activity/activity.dto';
import {
  buildExportCsv,
  buildExportExcel,
  type ExportColumn,
} from 'src/helper/service/export-file.service';
import { auditContext } from 'src/helper/service/audit-context';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import {
  HistoryEntryLike,
  HistoryLabelService,
} from 'src/helper/service/history-label.service';
import { ApiClient } from 'src/schema/admin/api-client.schema';
import { OfficeType } from 'src/schema/office/office-type.schema';
import { Office, officeSchemaName } from 'src/schema/office/office.schema';
import {
  PickupAssignment,
  pickupAssignmentSchemaName,
} from 'src/schema/pickup/pickup-assignment.schema';
import { pickupRequestHistorySchemaName } from 'src/schema/pickup/pickup-request-history.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import {
  PickupStatus,
  pickupStatusSchemaName,
} from 'src/schema/pickup/pickup-status.schema';
import { PickupStatusEnum } from 'src/schema/pickup/pickup.dto';
import { Order, orderSchemaName } from 'src/schema/order/order.schema';
import {
  OrderStatus,
  orderStatusSchemaName,
} from 'src/schema/order/order-status.schema';
import { OrderStatusEnum } from 'src/schema/order/order.dto';
import { Customer } from 'src/schema/user/customer.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { UserTypeEum } from 'src/schema/user/user.dto';
import { User } from 'src/schema/user/user.schema';
import {
  AssignPickupDto,
  PickupRequestParamsDto,
} from './dto/assign-pickup.dto';
import { CreatePickupDto } from './dto/create-pickup.dto';
import {
  ExportPickupDto,
  PickupExportFormatEnum,
} from './dto/export-pickup.dto';
import { FindPickupDto } from './dto/find-pickup.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { scopeFilter } from 'src/helper/casl/casl-scope';
import { phoneQuery, toE164Digits } from 'src/helper/phone';

// Ceiling on the customer prefilter behind `keyword` — a broad term must not
// pull the whole user collection into the pickup query.
const KEYWORD_CUSTOMER_LIMIT = 500;

// Default createdAt window when the caller sends no bounds: 30 days.
const DEFAULT_DATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type PickupStatusCounts = {
  all: number;
  pending: number;
  confirmed: number;
  assigned: number;
  pickedUp: number;
  cancelled: number;
};

export type PickupKpis = {
  totalPickups: number;
  pending: number;
  completed: number;
  completionBase: number;
  completionRate: number;
  byPickupStatus: PickupStatusCounts;
};

// A detail read is a screen, not a feed: cap the trail it carries.
const PICKUP_HISTORY_LIMIT = 100;

/** One entry of the pickup's audit trail, as the detail read returns it. */
type PickupHistoryEntry = HistoryEntryLike & {
  action: string;
  reason?: string;
  createdAt: Date;
};

/** Everything a pickup detail screen shows in one round trip. */
export type PickupDetail = Record<string, unknown> & {
  reference: string;
  history: PickupHistoryEntry[];
};

// One flat row per pickup for the CSV/Excel export.
type PickupExportRow = {
  reference: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  office: string;
  status: string;
  pickupAddress: string;
  pickupDate: Date | null;
  pickupTime: string;
  confirmedBy: string;
  createdAt: string;
  updatedAt: string;
};

// Column order + headers, shared by both CSV and Excel so the two formats stay
// identical. `key` maps to a field on PickupExportRow.
const PICKUP_EXPORT_COLUMNS: ExportColumn<PickupExportRow>[] = [
  { header: 'Reference', key: 'reference' },
  { header: 'Customer', key: 'customerName' },
  { header: 'Phone', key: 'customerPhone' },
  { header: 'Email', key: 'customerEmail' },
  { header: 'Office', key: 'office' },
  { header: 'Status', key: 'status' },
  { header: 'Pickup Address', key: 'pickupAddress' },
  { header: 'Pickup Date', key: 'pickupDate' },
  { header: 'Pickup Time', key: 'pickupTime' },
  { header: 'Confirmed By', key: 'confirmedBy' },
  { header: 'Created At', key: 'createdAt' },
  { header: 'Updated At', key: 'updatedAt' },
];

// Seeded status name → breakdown key. Spelt out rather than lower-cased so the
// response stays camelCase (PICKED_UP would otherwise land as `picked_up`).
const PICKUP_STATUS_KEYS: Record<string, keyof PickupStatusCounts> = {
  [PickupStatusEnum.PENDING]: 'pending',
  [PickupStatusEnum.CONFIRMED]: 'confirmed',
  [PickupStatusEnum.ASSIGNED]: 'assigned',
  [PickupStatusEnum.PICKED_UP]: 'pickedUp',
  [PickupStatusEnum.CANCELLED]: 'cancelled',
};

@Injectable()
export class PickupService {
  private readonly logger = new Logger(PickupRequest.name);

  constructor(
    private readonly appUtilService: AppUtilService,

    @InjectModel(PickupStatus.name)
    private readonly pickupStatusModel: Model<PickupStatus>,

    @InjectModel(PickupRequest.name)
    private readonly pickupRequestModel: Model<PickupRequest>,

    @InjectModel(PickupAssignment.name)
    private readonly pickupAssignmentModel: Model<PickupAssignment>,

    @InjectModel(Office.name)
    private readonly officeModel: Model<Office>,

    @InjectModel(Order.name)
    private readonly orderModel: Model<Order>,

    @InjectModel(OrderStatus.name)
    private readonly orderStatusModel: Model<OrderStatus>,

    private readonly codeService: CodeGeneratorService,
    private readonly historyLabelService: HistoryLabelService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(UserType.name) private readonly userTypeModel: Model<UserType>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    private readonly activityService: ActivityService,
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
   * Look up one pickup by id, narrowed to what the caller may act on. The
   * write paths gate on `can()`, which only asks whether the caller holds the
   * action at all — it says nothing about *this* record, so without the scope
   * an office-scoped user could confirm, cancel or assign another office's
   * pickup by id. Out of scope reads as absent (404), never as forbidden.
   */
  private scopedPickup(
    pickupRequestId: Types.ObjectId,
    action: CaslActionsDto,
  ): QueryFilter<PickupRequest> {
    return {
      _id: pickupRequestId,
      ...scopeFilter(this.req.user.ability, action, 'PickupRequest'),
    };
  }

  async schedulePickup(data: CreatePickupDto) {
    const { platform, apiClientId, officeId } = this.req.data;
    const userType = await this.userTypeModel.findOne({
      userTypeName: UserTypeEum.CUSTOMER,
    });

    // Create or update user
    // Matched on every spelling and written in the normalised one, so a
    // walk-in cannot open a second account for somebody already on the books.
    const foundedUser = await this.userModel.findOneAndUpdate(
      { phone: phoneQuery(data.phone) },
      {
        ...data,
        phone: toE164Digits(data.phone),
        ...(data.whatsappPhone
          ? { whatsappPhone: toE164Digits(data.whatsappPhone) }
          : {}),
        userTypeId: userType!._id,
      },
      { upsert: true, returnDocument: 'after' },
    );

    // Check if customer document exist
    let customerExists = await this.customerModel.exists({
      userId: foundedUser._id,
    });

    if (!customerExists) {
      // Create new customer document
      const referralCode = await this.codeService.generateReferralCode();
      const newCustomer = await this.customerModel.findOneAndUpdate(
        { userId: foundedUser._id },
        { referralCode, userId: foundedUser._id },
        {
          context: auditContext(this.req, foundedUser._id),
          upsert: true,
          returnDocument: 'after',
        } as never,
      );
      customerExists = { _id: (newCustomer as unknown as Customer)._id };
    }

    const pendingPickupStatus = await this.pickupStatusModel.findOne({
      pickupStatusName: PickupStatusEnum.PENDING,
    });

    // Check if another pickup request is in progress
    const pendingPickupRequest = await this.pickupRequestModel.findOne({
      customerId: foundedUser._id,
      pickupStatusId: pendingPickupStatus!._id,
    });

    if (pendingPickupRequest) {
      this.logger.log(
        `[${platform}] ${data.phone} already have another request in progress.`,
      );
      throw new BadRequestException(
        'You already have another request in progress. Please be patient, we will call you.',
      );
    }
    // Create pickup
    const newPickupRequest = await this.pickupRequestModel
      .findOneAndUpdate(
        {
          customerId: foundedUser._id,
          pickupStatusId: pendingPickupStatus!._id,
        },
        {
          customerId: foundedUser._id,
          pickupTime: data.pickupTime,
          pickupDate: data.pickupDate,
          pickupAddress: data.pickupAddress,
          officeId: new Types.ObjectId(officeId),
          pickupStatusId: pendingPickupStatus!._id,
          apiClientId: new Types.ObjectId(apiClientId),
          reference: await this.codeService.generatePickupReference(),
        },
        {
          context: auditContext(this.req, foundedUser._id),
          upsert: true,
          returnDocument: 'after',
        } as never,
      )
      .populate({ path: 'pickupStatusId' });

    // const newPickupRequest = await this.pickupRequestModel.create({
    //   customerId: foundedUser._id,
    //   pickupTime: data.pickupTime,
    //   pickupDate: data.pickupDate,
    //   pickupAddress: data.pickupAddress,
    //   officeId: new Types.ObjectId(officeId),
    //   pickupStatusId: pendingPickupStatus!._id,
    //   apiClientId: new Types.ObjectId(apiClientId),
    // });
    // await newPickupRequest.populate({ path: 'pickupStatusId' });

    const customerInfo = await this.customerModel
      .findById(customerExists._id)
      .populate({
        model: User.name,
        path: 'userId',
        populate: { model: UserType.name, path: 'userTypeId' },
      });

    this.logger.log(`${data.phone} has successfully schedule a pickup`);
    return { customer: customerInfo, pickupRequest: newPickupRequest };
  }

  /**
   * The list filters, built once and handed to whoever needs them.
   *
   * `statusFilter` is kept apart from `baseFilter` because the KPI breakdown
   * has to span every status while the rest of its figures narrow to the
   * selected one — the same query, minus that single clause.
   */
  private async buildPickupFilters(
    query: Omit<FindPickupDto, 'page' | 'size'>,
  ): Promise<{
    baseFilter: QueryFilter<PickupRequest>;
    statusFilter: QueryFilter<PickupRequest>;
  }> {
    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    // Requested-date window. Both bounds are optional; with neither we default
    // to the last 30 days so the list never does an unbounded scan.
    const now = new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(now.getTime() - DEFAULT_DATE_WINDOW_MS);
    const endDate = this.appUtilService.parseRangeEnd(query.endDate) ?? now;

    let baseFilter: QueryFilter<PickupRequest> = {
      createdAt: { $gte: startDate, $lte: endDate },
    };
    let statusFilter: QueryFilter<PickupRequest> = {};

    // Auto-scope: office staff see their own office's pickups, a customer only
    // their own (via the seeded CASL conditions), enforced as a query filter.
    // Kept in `$and` rather than spread over the filter: the scope may pin
    // officeId or customerId and a spread would let an explicit filter below
    // silently replace it.
    const andClauses: QueryFilter<PickupRequest>[] = [
      scopeFilter(this.req.user.ability, 'READ', 'PickupRequest'),
    ];

    // Pickup Status Filter
    if (query.pickupStatusName) {
      const pickupStatus = await this.pickupStatusModel.findOne({
        pickupStatusName: query.pickupStatusName,
      });
      if (!pickupStatus) {
        const log = `[${platform}] ${phone} pickupStatusName=${query.pickupStatusName} doesn't exists`;
        this.logger.error(log);
        throw new NotFoundException('Invalid pickupStatusName');
      }

      statusFilter = { pickupStatusId: pickupStatus._id };
    }

    // Pickup Reference Filter
    if (query.reference)
      baseFilter = { ...baseFilter, reference: query.reference };

    // Customer Filter
    if (query.customerId)
      baseFilter = {
        ...baseFilter,
        customerId: new Types.ObjectId(query.customerId),
      };

    // Confirmed By Filter
    if (query.confirmedById)
      baseFilter = {
        ...baseFilter,
        confirmedBy: new Types.ObjectId(query.confirmedById),
      };

    // The same question asked by reference, which is how the staff file asks
    // it. An unknown reference resolves to an id nothing carries: dropping
    // the clause would widen the query, so a typo would answer with every
    // pickup rather than with none.
    if (query.confirmedByReference) {
      const staff = await this.userModel
        .findOne({ reference: query.confirmedByReference })
        .select('_id')
        .lean();
      baseFilter = {
        ...baseFilter,
        confirmedBy: staff?._id ?? new Types.ObjectId(),
      };
    }

    // Pickups this agent was sent on. The assignment is its own record, so
    // this is a prefilter: collect the requests assigned to them, then match
    // on those ids. Same shape as the keyword prefilter below.
    if (query.agentReference) {
      const agent = await this.userModel
        .findOne({ reference: query.agentReference })
        .select('_id')
        .lean();

      const assignments = agent
        ? await this.pickupAssignmentModel
            .find({ agentId: agent._id })
            .select('pickupRequestId')
            .lean()
        : [];

      andClauses.push({
        _id: { $in: assignments.map((row) => row.pickupRequestId) },
      });
    }

    // Office Filter
    if (query.officeCode) {
      const office = await this.officeModel.findOne({
        officeCode: query.officeCode,
      });
      if (!office) {
        const log = `[${platform}] ${phone} officeCode=${query.officeCode} doesn't exists`;
        this.logger.error(log);
        throw new NotFoundException('Invalid officeCode');
      }

      // A scoped user asking for another office must get nothing back, not
      // their own office's pickups relabelled as the answer.
      andClauses.push({ officeId: office._id });
    }

    // Free-text search. Customer name/phone/email live on `user`, so match
    // there first and filter pickups by the ids that came back. The prefilter
    // is capped so it can never scan the whole user collection.
    if (query.keyword?.trim()) {
      const escaped = this.appUtilService.escapeRegex(query.keyword.trim());
      const rx = new RegExp(escaped, 'i');

      const matchedCustomers = await this.userModel
        .find({
          $or: [
            { firstName: rx },
            { lastName: rx },
            { email: rx },
            { phone: rx },
            { whatsappPhone: rx },
            // Full "first last" name search.
            {
              $expr: {
                $regexMatch: {
                  input: {
                    $concat: [
                      { $ifNull: ['$firstName', ''] },
                      ' ',
                      { $ifNull: ['$lastName', ''] },
                    ],
                  },
                  regex: escaped,
                  options: 'i',
                },
              },
            },
          ],
        })
        .select('_id')
        .limit(KEYWORD_CUSTOMER_LIMIT);

      baseFilter = {
        ...baseFilter,
        $or: [
          { reference: rx },
          { customerId: { $in: matchedCustomers.map((user) => user._id) } },
        ],
      };
    }

    return { baseFilter: { ...baseFilter, $and: andClauses }, statusFilter };
  }

  /**
   * Per-status counts over whatever filter the caller hands in, so the buckets
   * always describe exactly the set that filter matches.
   *
   * `all` sums every pickup matched, including any whose status row is missing
   * — a count that skipped them would not reconcile with the list's own total.
   */
  private async countByPickupStatus(
    filter: QueryFilter<PickupRequest>,
  ): Promise<PickupStatusCounts> {
    const statusCounts = await this.pickupRequestModel.aggregate<{
      _id: string | null;
      count: number;
    }>([
      { $match: filter },
      {
        $lookup: {
          as: 'ps',
          from: pickupStatusSchemaName,
          localField: 'pickupStatusId',
          foreignField: '_id',
          pipeline: [{ $project: { pickupStatusName: 1 } }],
        },
      },
      { $unwind: { path: '$ps', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$ps.pickupStatusName', count: { $sum: 1 } } },
    ]);

    const byPickupStatus: PickupStatusCounts = {
      all: 0,
      pending: 0,
      confirmed: 0,
      assigned: 0,
      pickedUp: 0,
      cancelled: 0,
    };
    for (const row of statusCounts) {
      const key = row._id ? PICKUP_STATUS_KEYS[row._id] : undefined;
      if (key) byPickupStatus[key] += row.count;
      byPickupStatus.all += row.count;
    }

    return byPickupStatus;
  }

  /**
   * Headline numbers for the pickups dashboard, over the exact same filters as
   * the list — every param, `pickupStatusName` included — so the cards always
   * describe the set the table is showing. Filter to PENDING and every figure
   * but `pending` is 0, because nothing else is in that set.
   *
   * `byPickupStatus` is the one deliberate exception: it always spans every
   * status, taking the filters minus `pickupStatusName`. It is what a status
   * tab strip counts off, and a breakdown that collapsed to the selected tab
   * could never tell you what the other tabs hold.
   */
  async getPickupKpis(query: FindPickupDto): Promise<PickupKpis> {
    this.can('READ', 'PickupRequest');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { baseFilter, statusFilter } = await this.buildPickupFilters(query);

    // Across every status: the tab counts.
    const byPickupStatus = await this.countByPickupStatus(baseFilter);

    // Narrowed by the status filter too: the cards. With no status filter the
    // two sets are identical, so the second aggregation is skipped.
    const scoped = Object.keys(statusFilter).length
      ? await this.countByPickupStatus({ ...baseFilter, ...statusFilter })
      : byPickupStatus;

    // Cancelled pickups never had a chance to complete, so counting them as
    // failures would punish the rate for work that was called off.
    const completionBase = scoped.all - scoped.cancelled;
    const completionRate =
      completionBase > 0
        ? Math.round((scoped.pickedUp / completionBase) * 1000) / 10
        : 0;

    this.logger.log(
      `[${platform}] ${phone} has successfully retrieved pickup kpis`,
    );

    return {
      totalPickups: scoped.all,
      pending: scoped.pending,
      completed: scoped.pickedUp,
      completionBase,
      completionRate,
      byPickupStatus,
    };
  }

  /**
   * One pickup by its human-readable reference, with its joins, its audit
   * trail and the order it turned into.
   *
   * Office/self scoped like the list: a pickup outside the caller's scope
   * reads as absent (404), never as forbidden. The trail carries only what
   * changed (field, from, to), who changed it and why — never the stored
   * snapshot, which would hand back the whole record at every revision.
   */
  async findByReference(reference: string): Promise<PickupDetail> {
    this.can('READ', 'PickupRequest');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const code = reference.trim();
    const scope = scopeFilter(this.req.user.ability, 'READ', 'PickupRequest');

    const [pickup] = await this.pickupRequestModel.aggregate<PickupDetail>([
      { $match: { reference: code, ...scope } },
      { $limit: 1 },

      {
        $lookup: {
          as: 'customer',
          from: 'user',
          localField: 'customerId',
          foreignField: '_id',
          pipeline: [{ $project: SAFE_USER_PROJECTION }],
        },
      },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'office',
          from: officeSchemaName,
          localField: 'officeId',
          foreignField: '_id',
          pipeline: [{ $project: SAFE_OFFICE_PROJECTION }],
        },
      },
      { $unwind: { path: '$office', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'pickupStatus',
          from: pickupStatusSchemaName,
          localField: 'pickupStatusId',
          foreignField: '_id',
        },
      },
      { $unwind: { path: '$pickupStatus', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'confirmedByUser',
          from: 'user',
          localField: 'confirmedBy',
          foreignField: '_id',
          pipeline: [{ $project: SAFE_USER_PROJECTION }],
        },
      },
      {
        $unwind: { path: '$confirmedByUser', preserveNullAndEmptyArrays: true },
      },

      // Who is out collecting it, latest hand-over first. Sorted on when the
      // assignment was written, not on assignedAt: assignedAt is the day the
      // agent is due out, so it can sit in the future, and sorting on it would
      // leave a replaced agent looking like the current one.
      {
        $lookup: {
          as: 'assignments',
          from: pickupAssignmentSchemaName,
          localField: '_id',
          foreignField: 'pickupRequestId',
          pipeline: [
            { $sort: { updatedAt: -1, assignedAt: -1 } },
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
          ],
        },
      },

      // What the pickup turned into: enough of each order to link to it and
      // show where it stands — the order detail read has the rest.
      {
        $lookup: {
          as: 'orders',
          from: orderSchemaName,
          localField: '_id',
          foreignField: 'pickupRequestId',
          pipeline: [
            { $sort: { createdAt: -1 } },
            {
              $lookup: {
                as: 'orderStatus',
                from: orderStatusSchemaName,
                localField: 'orderStatusId',
                foreignField: '_id',
                pipeline: [{ $project: { orderStatusName: 1 } }],
              },
            },
            {
              $unwind: {
                path: '$orderStatus',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                orderCode: 1,
                status: { $ifNull: ['$orderStatus.orderStatusName', null] },
                paymentStatus: 1,
                totalAmount: 1,
                amountPaid: 1,
                balanceDue: 1,
                receivedAt: 1,
                estimatedDeliveryDate: 1,
                deliveredAt: 1,
                createdAt: 1,
              },
            },
          ],
        },
      },

      // The audit trail: what changed, by whom, newest first. `changedFields`
      // is an object keyed by field name, so it is turned into a flat array a
      // timeline can render directly. `snapshot` is never projected.
      {
        $lookup: {
          as: 'history',
          from: pickupRequestHistorySchemaName,
          localField: '_id',
          foreignField: 'pickupRequestId',
          pipeline: [
            { $sort: { createdAt: -1 } },
            { $limit: PICKUP_HISTORY_LIMIT },
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

    if (!pickup) {
      this.logger.error(
        `${base} unknown/out-of-scope pickup reference ${code}`,
      );
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Pickup not found',
      });
    }

    // `pickupStatusId: 6a58…53d → 6a58…53e` means nothing to a reader, so every
    // foreign key in the trail gets its label attached (PENDING → CONFIRMED).
    // Generic, off the schema's own `ref`s — no per-field mapping to maintain.
    await this.historyLabelService.labelChanges(
      PickupRequest.name,
      pickup.history,
    );

    this.logger.log(`${base} has successfully retrieved pickup ${code}`);
    return pickup;
  }

  // Export the filtered pickups (same params as the list, no pagination) as a
  // CSV or Excel file. Returns the raw bytes + filename + content-type; the
  // controller streams them as an attachment.
  async exportPickups({ format, ...query }: ExportPickupDto): Promise<{
    buffer: Buffer;
    filename: string;
    contentType: string;
  }> {
    // Bulk export is gated on its own EXPORT action (not READ) so it can be
    // restricted to reporting/oversight roles. The rows are still office/self
    // scoped by buildPickupFilters via the READ conditions.
    this.can('EXPORT', 'PickupRequest');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const logBase = `[${platform}] ${phone}`;

    const { baseFilter, statusFilter } = await this.buildPickupFilters(query);

    const rows = await this.pickupRequestModel.aggregate<PickupExportRow>([
      { $match: { ...baseFilter, ...statusFilter } },
      {
        $lookup: {
          as: 'customer',
          from: 'user',
          localField: 'customerId',
          foreignField: '_id',
          pipeline: [
            { $project: { firstName: 1, lastName: 1, phone: 1, email: 1 } },
          ],
        },
      },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          as: 'office',
          from: officeSchemaName,
          localField: 'officeId',
          foreignField: '_id',
          pipeline: [{ $project: { officeName: 1 } }],
        },
      },
      { $unwind: { path: '$office', preserveNullAndEmptyArrays: true } },
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
      {
        $lookup: {
          as: 'confirmedByUser',
          from: 'user',
          localField: 'confirmedBy',
          foreignField: '_id',
          pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
        },
      },
      {
        $unwind: { path: '$confirmedByUser', preserveNullAndEmptyArrays: true },
      },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          _id: 0,
          reference: 1,
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
          customerEmail: { $ifNull: ['$customer.email', ''] },
          office: { $ifNull: ['$office.officeName', ''] },
          status: { $ifNull: ['$pickupStatus.pickupStatusName', ''] },
          pickupAddress: { $ifNull: ['$pickupAddress', ''] },
          pickupDate: { $ifNull: ['$pickupDate', null] },
          pickupTime: { $ifNull: ['$pickupTime', ''] },
          confirmedBy: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ['$confirmedByUser.firstName', ''] },
                  ' ',
                  { $ifNull: ['$confirmedByUser.lastName', ''] },
                ],
              },
            },
          },
          // System audit timestamps — full precision (date + time), unlike the
          // business date column which is day-granular.
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
    if (format === PickupExportFormatEnum.EXCEL) {
      result = {
        buffer: await buildExportExcel(rows, PICKUP_EXPORT_COLUMNS, 'Pickups'),
        filename: `pickups-export-${stamp}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    } else {
      result = {
        buffer: buildExportCsv(rows, PICKUP_EXPORT_COLUMNS),
        filename: `pickups-export-${stamp}.csv`,
        contentType: 'text/csv',
      };
    }

    this.logger.log(`${logBase} exported ${rows.length} pickups as ${format}`);
    // A bulk pull leaves no trace on any record — the rows are only read — so
    // the trail is the only place it is ever visible.
    await this.activityService.recordFromRequest(this.req, {
      userId: new Types.ObjectId(this.req.user.userId),
      kind: ActivityKindEnum.EXPORT,
      action: 'pickuprequest.export',
      resource: 'PickupRequest',
      metadata: { format, rows: rows.length },
    });

    return result;
  }

  async findAllPickup({ page, size, ...query }: FindPickupDto) {
    this.can('READ', 'PickupRequest');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const { baseFilter, statusFilter } = await this.buildPickupFilters(query);
    const whereClause: QueryFilter<PickupRequest> = {
      ...baseFilter,
      ...statusFilter,
    };

    const pickups = await this.pickupRequestModel
      .find(whereClause)
      .populate({
        model: User.name,
        path: 'customerId',
        populate: { model: UserType.name, path: 'userTypeId' },
      })
      .populate({
        model: Office.name,
        path: 'officeId',
        populate: { model: OfficeType.name, path: 'officeTypeId' },
      })
      .populate({ path: 'pickupStatusId', model: PickupStatus.name })
      .populate({ model: User.name, path: 'confirmedBy' })
      .populate({
        model: ApiClient.name,
        path: 'apiClientId',
        select: 'name description scope isActive',
      })
      .sort(sort)
      .skip(skip)
      .limit(size);

    const totalPickups =
      await this.pickupRequestModel.countDocuments(whereClause);
    const nextPage = page < totalPickups ? page + 1 : null;

    this.logger.log(
      `[${platform}] ${phone} has successfully retrieve all pickups`,
    );
    return { total: totalPickups, data: pickups, nextPage };
  }

  async assignPickup(param: PickupRequestParamsDto, data: AssignPickupDto) {
    this.can('ASSIGN', 'PickupAssignment');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;
    const userId = new Types.ObjectId(this.req.user.userId);

    const userType = await this.userTypeModel.findOne({
      userTypeName: UserTypeEum.ADMIN,
    });
    const userExists = await this.userModel.findOne({
      _id: data.agentId,
      userTypeId: userType?._id,
    });

    if (!userExists) {
      const log = `You can't assign a pickup request to a Customer or Affiliate Partner`;
      this.logger.error(`[${platform}] ${phone} ${log}`);
      throw new BadRequestException(log);
    }

    // A pickup can be handed over more than once: the agent falls sick, the
    // round gets reshuffled. So ASSIGNED is assignable too, and reassigning
    // simply names the new agent while the request stays ASSIGNED.
    const [confirmPickupStatus, assignedPickupStatus] = await Promise.all([
      this.pickupStatusModel.findOne({
        pickupStatusName: PickupStatusEnum.CONFIRMED,
      }),
      this.pickupStatusModel.findOne({
        pickupStatusName: PickupStatusEnum.ASSIGNED,
      }),
    ]);

    const pickupRequestId = new Types.ObjectId(param.pickupId);
    const pickupRequestExists = await this.pickupRequestModel.findOne(
      this.scopedPickup(pickupRequestId, 'UPDATE'),
    );

    if (!pickupRequestExists) {
      this.logger.error(`${base} invalid pickupId ${param.pickupId}`);
      throw new NotFoundException('Pickup not found');
    }

    const assignableStatusIds = [
      confirmPickupStatus?._id.toString(),
      assignedPickupStatus?._id.toString(),
    ];

    if (
      !assignableStatusIds.includes(
        pickupRequestExists.pickupStatusId.toString(),
      )
    ) {
      this.logger.error(
        `${base} cannot assign pickup ${pickupRequestExists.reference} because it is neither CONFIRMED nor ASSIGNED`,
      );
      throw new BadRequestException(
        'Can only assign pickup in confirmed or assigned status',
      );
    }

    // Handing it to whoever already has it is a no-op the operator did not
    // mean: it would only bump assignedAt and write a change reason against
    // nothing. Same order as the detail read uses, so "current" means the same
    // agent here and on screen.
    const [currentAssignment] = await this.pickupAssignmentModel
      .find({ pickupRequestId: pickupRequestExists._id })
      .sort({ updatedAt: -1, assignedAt: -1 })
      .limit(1);

    const alreadyWithAgent =
      pickupRequestExists.pickupStatusId.toString() ===
        assignedPickupStatus?._id.toString() &&
      currentAssignment?.agentId.toString() === userExists._id.toString();

    if (alreadyWithAgent) {
      this.logger.error(
        `${base} cannot assign pickup ${pickupRequestExists.reference} to ${userExists.phone} because that agent already has it`,
      );
      throw new BadRequestException('Pickup is already assigned to this agent');
    }

    await this.pickupAssignmentModel.findOneAndUpdate(
      { agentId: userExists._id, pickupRequestId: pickupRequestExists._id },
      {
        agentId: userExists._id,
        assignedAt: data.assignedAt ?? new Date(),
        pickupRequestId: pickupRequestExists._id,
      },
      {
        context: auditContext(this.req, userId),
        upsert: true,
        returnDocument: 'after',
      } as never,
    );

    await this.pickupRequestModel.findOneAndUpdate(
      { _id: pickupRequestExists._id },
      { pickupStatusId: assignedPickupStatus!._id },
      {
        context: auditContext(this.req, userId),
        upsert: true,
        returnDocument: 'after',
      } as never,
    );

    this.logger.log(
      `[${platform}] ${phone} pickup-request successfully assigned to ${userExists.phone}`,
    );
    return 'Pickup request successfully assigned';
  }

  async confirmPickup(pickupRequestId: string) {
    this.can('CONFIRM', 'PickupRequest');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const pickupObjectId = new Types.ObjectId(pickupRequestId);
    const pickupRequest = await this.pickupRequestModel.findOne(
      this.scopedPickup(pickupObjectId, 'CONFIRM'),
    );
    if (!pickupRequest) {
      this.logger.error(`${base} invalid pickupRequestId ${pickupRequestId}`);
      throw new NotFoundException('Pickup not found');
    }

    // lookup pending status
    const pendingStatus = await this.pickupStatusModel.findOne({
      pickupStatusName: PickupStatusEnum.PENDING,
    });
    if (!pendingStatus) {
      this.logger.error(`${base} pending pickup status not found`);
      throw new BadRequestException('Pending pickup status not configured');
    }

    if (
      pickupRequest.pickupStatusId.toString() !== pendingStatus._id.toString()
    ) {
      this.logger.error(
        `${base} cannot confirm pickup ${pickupRequest.reference} because it is not in PENDING status`,
      );
      throw new BadRequestException(
        'Can only confirm pickups in pending status',
      );
    }

    // lookup pending status
    const confirmStatus = await this.pickupStatusModel.findOne({
      pickupStatusName: PickupStatusEnum.CONFIRMED,
    });
    if (!confirmStatus) {
      this.logger.error(`${base} confirmed pickup status not found`);
      throw new BadRequestException('Confirmed pickup status not configured');
    }

    const userId = new Types.ObjectId(this.req.user.userId);
    await this.pickupRequestModel.findOneAndUpdate(
      { _id: pickupRequest._id },
      { pickupStatusId: confirmStatus._id, confirmedBy: userId },
      {
        context: auditContext(this.req, userId),
        returnDocument: 'after',
      } as never,
    );

    this.logger.log(`${base} pickup ${pickupRequest.reference} confirmed`);
    return 'Pickup confirmed successfully';
  }

  async cancelPickup(pickupRequestId: string) {
    this.can('UPDATE', 'PickupRequest');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const pickupObjectId = new Types.ObjectId(pickupRequestId);
    const pickupRequest = await this.pickupRequestModel.findOne(
      this.scopedPickup(pickupObjectId, 'UPDATE'),
    );
    if (!pickupRequest) {
      this.logger.error(`${base} invalid pickupRequestId ${pickupRequestId}`);
      throw new NotFoundException('Pickup not found');
    }

    const cancelledStatus = await this.pickupStatusModel.findOne({
      pickupStatusName: PickupStatusEnum.CANCELLED,
    });
    if (!cancelledStatus) {
      this.logger.error(`${base} cancelled pickup status not found`);
      throw new BadRequestException('Cancelled pickup status not configured');
    }

    // disallow cancelling already cancelled pickups
    if (
      pickupRequest.pickupStatusId.toString() === cancelledStatus._id.toString()
    ) {
      this.logger.error(
        `${base} pickup ${pickupRequest.reference} is already cancelled`,
      );
      throw new BadRequestException('Pickup is already cancelled');
    }

    // disallow cancelling picked up pickups
    const pickedUpStatus = await this.pickupStatusModel.findOne({
      pickupStatusName: PickupStatusEnum.PICKED_UP,
    });
    if (
      pickedUpStatus &&
      pickupRequest.pickupStatusId.toString() === pickedUpStatus._id.toString()
    ) {
      this.logger.error(
        `${base} cannot cancel picked up pickup ${pickupRequest.reference}`,
      );
      throw new BadRequestException('Cannot cancel a picked up pickup');
    }

    const userId = new Types.ObjectId(this.req.user.userId);
    await this.pickupRequestModel.findOneAndUpdate(
      { _id: pickupRequest._id },
      { pickupStatusId: cancelledStatus._id },
      {
        context: auditContext(this.req, userId),
        returnDocument: 'after',
      } as never,
    );

    // Cancel any associated orders
    const cancelledOrderStatus = await this.orderStatusModel.findOne({
      orderStatusName: OrderStatusEnum.CANCELLED,
    });
    if (cancelledOrderStatus) {
      const associatedOrders = await this.orderModel.find({
        pickupRequestId: pickupRequest._id,
      });

      for (const order of associatedOrders) {
        // Skip if already delivered or cancelled
        const deliveredStatus = await this.orderStatusModel.findOne({
          orderStatusName: OrderStatusEnum.DELIVERED,
        });
        if (
          order.orderStatusId.toString() === cancelledOrderStatus._id.toString()
        ) {
          continue; // Already cancelled
        }
        if (
          deliveredStatus &&
          order.orderStatusId.toString() === deliveredStatus._id.toString()
        ) {
          continue; // Cannot cancel delivered order
        }

        // Update order status to cancelled
        await this.orderModel.findOneAndUpdate(
          { _id: order._id },
          { orderStatusId: cancelledOrderStatus._id },
          {
            context: auditContext(this.req, userId),
            returnDocument: 'after',
          } as never,
        );
        this.logger.log(
          `${base} order ${order.orderCode} cancelled due to pickup cancellation`,
        );
      }
    }

    this.logger.log(`${base} pickup ${pickupRequest.reference} cancelled`);
    return 'Pickup cancelled successfully';
  }
}
