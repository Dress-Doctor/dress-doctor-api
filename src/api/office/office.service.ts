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
import { Model, Types } from 'mongoose';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { scopeFilter } from 'src/helper/casl/casl-scope';
import {
  applyAuditLocals,
  auditContext,
} from 'src/helper/service/audit-context';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { ActivityService } from 'src/helper/service/activity.service';
import { ActivityKindEnum } from 'src/schema/activity/activity.dto';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import {
  buildExportCsv,
  buildExportExcel,
  type ExportColumn,
} from 'src/helper/service/export-file.service';
import {
  OfficeType,
  officeTypeSchemaName,
} from 'src/schema/office/office-type.schema';
import { OfficeUser } from 'src/schema/office/office-user.schema';
import { officeUserHistorySchemaName } from 'src/schema/office/office-user-history.schema';
import { OfficeHistory } from 'src/schema/office/office-history.schema';
import { Office } from 'src/schema/office/office.schema';
import { Role } from 'src/schema/admin/role.schema';
import { User } from 'src/schema/user/user.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { Order } from 'src/schema/order/order.schema';
import {
  OrderStatus,
  orderStatusSchemaName,
} from 'src/schema/order/order-status.schema';
import { OrderStatusEnum } from 'src/schema/order/order.dto';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import {
  PickupStatus,
  pickupStatusSchemaName,
} from 'src/schema/pickup/pickup-status.schema';
import { PickupStatusEnum } from 'src/schema/pickup/pickup.dto';
import { Payment } from 'src/schema/payment/payment.schema';
import { PaymentTypeEnum } from 'src/schema/payment/payment.dto';
import { SAFE_USER_PROJECTION } from 'src/helper/projection/user.projection';
import { PaginationDto } from 'src/dto/request-data.dto';
import { HistoryLabelService } from 'src/helper/service/history-label.service';
import { AssignOfficeUserDto } from './dto/assign-office-user.dto';
import { CreateOfficeDto } from './dto/create-office.dto';
import {
  ExportOfficeDto,
  OfficeExportFormatEnum,
} from './dto/export-office.dto';
import { FindOfficeDto } from './dto/find-office.dto';
import {
  OfficeIntervalEnum,
  OfficeMetricEnum,
  OfficePerformanceDto,
  OfficeWindowDto,
} from './dto/office-detail.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';

/** One row of the office export, as the projection below shapes it. */
type OfficeExportRow = {
  officeCode: string;
  officeName: string;
  officeType: string;
  slug: string;
  address: string;
  city: string;
  region: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * One entry of the merged office audit trail. `source` says which record
 * moved, because the two collections answer different questions and a reader
 * should be able to tell "the address was corrected" from "someone left".
 */
export type OfficeHistoryEntry = {
  action: string;
  reason?: string;
  source: 'office' | 'staff';
  changes: {
    field: string;
    from: unknown;
    to: unknown;
    fromLabel?: string;
    toLabel?: string;
  }[];
  createdAt: Date;
  changedByUser?: Record<string, unknown>;
};

/**
 * One entry of the admin panel's office switcher: the branch cut down to what
 * a picker shows. A subset of `SAFE_OFFICE_PROJECTION`, so nothing that must
 * not leave the building can ride along — the signed link and the QR code URL
 * both carry the office HMAC.
 */
export type MyOfficeDto = {
  _id: Types.ObjectId;
  officeName: string;
  officeCode?: string;
  slug?: string;
  isActive: boolean;
};

/** The same allow-list as a `select` string, for both reads in `findMine`. */
const OFFICE_SWITCHER_SELECT = 'officeName officeCode slug isActive';

/**
 * Column order of the office export — drives both CSV and Excel.
 *
 * `signedLink` and `qrCodeUrl` are deliberately absent: both carry the office
 * HMAC, and an export leaves the building (see SAFE_OFFICE_PROJECTION).
 */
const OFFICE_EXPORT_COLUMNS: ExportColumn<OfficeExportRow>[] = [
  { header: 'Office Code', key: 'officeCode' },
  { header: 'Office Name', key: 'officeName' },
  { header: 'Office Type', key: 'officeType' },
  { header: 'Slug', key: 'slug' },
  { header: 'Address', key: 'address' },
  { header: 'City', key: 'city' },
  { header: 'Region', key: 'region' },
  { header: 'Status', key: 'status' },
  { header: 'Created At', key: 'createdAt' },
  { header: 'Updated At', key: 'updatedAt' },
];

@Injectable()
export class OfficeService {
  private readonly logger = new Logger(OfficeService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    private readonly codeService: CodeGeneratorService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(Office.name) private readonly officeModel: Model<Office>,
    @InjectModel(OfficeType.name)
    private readonly officeTypeModel: Model<OfficeType>,
    @InjectModel(OfficeUser.name)
    private readonly officeUserModel: Model<OfficeUser>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(OfficeHistory.name)
    private readonly officeHistoryModel: Model<OfficeHistory>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(OrderStatus.name)
    private readonly orderStatusModel: Model<OrderStatus>,
    @InjectModel(PickupRequest.name)
    private readonly pickupModel: Model<PickupRequest>,
    @InjectModel(PickupStatus.name)
    private readonly pickupStatusModel: Model<PickupStatus>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    private readonly historyLabelService: HistoryLabelService,
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

  private buildSignedLink(slug: string): string {
    const ttlDays = Number(process.env.OFFICE_LINK_TTL_DAYS) || 365;
    const exp = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
    const sig = this.codeService.signOfficeLink(slug, exp);
    const baseUrl = process.env.DD_API_URL ?? '';
    return `${baseUrl}/o/${slug}?sig=${sig}&exp=${exp}`;
  }

  async create(data: CreateOfficeDto) {
    this.can('CREATE', 'Office');
    const actorId = new Types.ObjectId(this.req.user.userId);

    const officeType = await this.officeTypeModel.findById(
      new Types.ObjectId(data.officeTypeId),
    );
    if (!officeType) {
      throw new BadRequestException({
        code: 'INVALID_OFFICE_TYPE',
        message: 'Invalid office type id',
      });
    }

    const clashes = await this.officeModel.exists({
      $or: [{ slug: data.slug }, { officeName: data.officeName }],
    });
    if (clashes) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'An office with this name or slug already exists',
      });
    }

    const officeCode = await this.codeService.generateOfficeCode();
    const office = new this.officeModel({
      officeTypeId: officeType._id,
      officeName: data.officeName,
      slug: data.slug,
      officeCode,
      signedLink: this.buildSignedLink(data.slug),
      address: data.address,
      city: data.city,
      region: data.region,
      qrCodeUrl: data.qrCodeUrl,
    });
    applyAuditLocals(office, this.req, actorId);
    await office.save();

    this.logger.log(`created office ${officeCode}`);
    return office;
  }

  /**
   * Turns the optional startDate/endDate pair into a mongo range on
   * `createdAt`. Both bounds are optional, so an omitted one means "no bound"
   * rather than "now". `endDate` covers the whole day: asking for "up to the
   * 5th" includes the 5th, not just its midnight.
   */
  private buildCreatedAtRange({
    startDate,
    endDate,
  }: Pick<FindOfficeDto, 'startDate' | 'endDate'>) {
    const range: Record<string, Date> = {};
    if (startDate) range.$gte = new Date(startDate);

    const end = this.appUtilService.parseRangeEnd(endDate);
    if (end) range.$lte = end;

    return Object.keys(range).length ? range : undefined;
  }

  /**
   * The filters behind the list, the KPIs and the export, built once so the
   * three can never disagree.
   *
   * `isActive` comes back on its own rather than merged into `base`: the KPI
   * status breakdown counts both statuses over everything else, so it needs
   * the filter without it.
   */
  private async buildOfficeFilter(query: Omit<FindOfficeDto, 'page' | 'size'>) {
    const base: Record<string, unknown> = {};

    if (query.officeTypeName) {
      const officeType = await this.officeTypeModel
        .findOne({ officeTypeName: query.officeTypeName.trim().toUpperCase() })
        .select('_id')
        .lean();
      // An unknown type must return nothing, so fall back to an id that can
      // never match instead of dropping the filter.
      base.officeTypeId = officeType?._id ?? new Types.ObjectId();
    }

    if (query.q) {
      const rx = new RegExp(this.appUtilService.escapeRegex(query.q), 'i');
      base.$or = [
        { officeName: rx },
        { address: rx },
        { city: rx },
        { region: rx },
        { officeCode: rx },
        { slug: rx },
      ];
    }

    const createdAt = this.buildCreatedAtRange(query);
    if (createdAt) base.createdAt = createdAt;

    const status =
      typeof query.isActive === 'boolean'
        ? { isActive: query.isActive }
        : undefined;

    return { base, status };
  }

  async findAll({ page, size, ...query }: FindOfficeDto) {
    this.can('READ', 'Office');

    const { base, status } = await this.buildOfficeFilter(query);
    const where: Record<string, unknown> = { ...base, ...status };

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);
    const total = await this.officeModel.countDocuments(where);
    const data = await this.officeModel
      .find(where)
      .populate({ model: OfficeType.name, path: 'officeTypeId' })
      .sort(sort)
      .skip(skip)
      .limit(size);

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;
    return { total, data, nextPage };
  }

  /**
   * The offices the caller may work in — what the admin panel's office
   * switcher offers.
   *
   * Deliberately NOT gated on `READ Office`: a counter clerk has no authority
   * over the office file, yet still has to know which branch they are stood
   * at. Nothing wider than the person asking comes back either way, because
   * what it returns is their own postings.
   *
   * A role whose `READ Office` grant carries no conditions is GLOBAL — head
   * office, oversight, support — and gets every open branch instead.
   * `canSwitch` says which of the two answers this is, so the panel knows
   * whether the switcher is a real choice or a label.
   *
   * Closed offices are left out of both answers: an office switched off is
   * not somewhere anyone can file work today.
   */
  async findMine(): Promise<{ offices: MyOfficeDto[]; canSwitch: boolean }> {
    const { userId, ability } = this.req.user;

    // `{}` means at least one matching rule carries no conditions — an
    // unrestricted, GLOBAL grant. Anything else is scoped to something.
    const scope = scopeFilter(ability, 'READ', 'Office');
    const canSwitch = Object.keys(scope).length === 0;

    if (canSwitch) {
      const offices = await this.officeModel
        .find({ isActive: true })
        .select(OFFICE_SWITCHER_SELECT)
        .sort({ officeName: 1 })
        .lean<MyOfficeDto[]>();

      return { offices, canSwitch };
    }

    const postings = await this.officeUserModel
      .find({ userId: new Types.ObjectId(userId), isActive: true })
      .populate<{ officeId: MyOfficeDto | null }>({
        model: Office.name,
        path: 'officeId',
        select: OFFICE_SWITCHER_SELECT,
      })
      .lean();

    // One person can hold two roles at the same branch, which is two postings
    // and one office. Keyed by id so the switcher lists it once.
    const byId = new Map<string, MyOfficeDto>();
    for (const posting of postings) {
      const office = posting.officeId;
      if (!office?.isActive) continue;
      byId.set(office._id.toString(), office);
    }

    const offices = [...byId.values()].sort((left, right) =>
      left.officeName.localeCompare(right.officeName),
    );

    return { offices, canSwitch };
  }

  /**
   * Headline office counts for the dashboard, over the list filters.
   *
   * `totalOffices` respects every filter, `isActive` included. The three
   * status figures come from `byStatusCount`, which drops `isActive` so a
   * status tab strip keeps its counts whichever tab is selected — which is
   * why `totalOffices` and `byStatusCount.all` differ only when the caller
   * asked for one status.
   */
  async getOfficeKpis(query: Omit<FindOfficeDto, 'page' | 'size'>) {
    this.can('READ', 'Office');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { base, status } = await this.buildOfficeFilter(query);

    const [totalOffices, byStatus] = await Promise.all([
      this.officeModel.countDocuments({ ...base, ...status }),
      this.officeModel.aggregate<{ _id: boolean; n: number }>([
        { $match: base },
        { $group: { _id: '$isActive', n: { $sum: 1 } } },
      ]),
    ]);

    const statusRow = (isActive: boolean) =>
      byStatus.find((row) => row._id === isActive)?.n ?? 0;
    const active = statusRow(true);
    const inactive = statusRow(false);

    this.logger.log(`[${platform}] ${phone} has retrieved office kpis`);

    return {
      totalOffices,
      totalActive: active,
      totalInactive: inactive,
      byStatusCount: { all: active + inactive, active, inactive },
    };
  }

  /**
   * Export the filtered offices (same params as findAll, no pagination) as a
   * CSV or Excel file. Returns the raw bytes + filename + content-type; the
   * controller streams them as an attachment.
   */
  async exportOffices({ format, ...query }: ExportOfficeDto): Promise<{
    buffer: Buffer;
    filename: string;
    contentType: string;
  }> {
    // Gated on EXPORT rather than READ so a bulk download can be kept to
    // reporting/oversight roles, the way every other export is.
    this.can('EXPORT', 'Office');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { base, status } = await this.buildOfficeFilter(query);

    const rows = await this.officeModel.aggregate<OfficeExportRow>([
      { $match: { ...base, ...status } },
      {
        $lookup: {
          as: 'officeType',
          from: officeTypeSchemaName,
          localField: 'officeTypeId',
          foreignField: '_id',
          pipeline: [{ $project: { officeTypeName: 1 } }],
        },
      },
      { $unwind: { path: '$officeType', preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          _id: 0,
          officeCode: { $ifNull: ['$officeCode', ''] },
          officeName: { $ifNull: ['$officeName', ''] },
          officeType: { $ifNull: ['$officeType.officeTypeName', ''] },
          slug: { $ifNull: ['$slug', ''] },
          address: { $ifNull: ['$address', ''] },
          city: { $ifNull: ['$city', ''] },
          region: { $ifNull: ['$region', ''] },
          status: {
            $cond: [{ $eq: ['$isActive', false] }, 'Inactive', 'Active'],
          },
          // System audit timestamps — full precision, date and time.
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
    if (format === OfficeExportFormatEnum.EXCEL) {
      result = {
        buffer: await buildExportExcel(rows, OFFICE_EXPORT_COLUMNS, 'Offices'),
        filename: `offices-export-${stamp}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    } else {
      result = {
        buffer: buildExportCsv(rows, OFFICE_EXPORT_COLUMNS),
        filename: `offices-export-${stamp}.csv`,
        contentType: 'text/csv',
      };
    }

    this.logger.log(
      `[${platform}] ${phone} exported ${rows.length} offices as ${format}`,
    );
    // A bulk pull leaves no trace on any record — the rows are only read — so
    // the trail is the only place it is ever visible.
    await this.activityService.recordFromRequest(this.req, {
      userId: new Types.ObjectId(this.req.user.userId),
      kind: ActivityKindEnum.EXPORT,
      action: 'office.export',
      resource: 'Office',
      metadata: { format, rows: rows.length },
    });

    return result;
  }

  /**
   * Finds the office a by-office read is addressed to.
   *
   * The code is the address — it is what staff read off the branch's own
   * paperwork, and what every URL on the admin panel carries. A Mongo id is
   * still accepted so callers written against the old `:id` routes keep
   * working; nothing new should send one.
   */
  private async resolveOffice(officeCode: string) {
    const code = officeCode.trim().toUpperCase();
    const where = Types.ObjectId.isValid(code)
      ? { $or: [{ officeCode: code }, { _id: new Types.ObjectId(code) }] }
      : { officeCode: code };

    const office = await this.officeModel.findOne(where);
    if (!office) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Office not found',
      });
    }
    return office;
  }

  /**
   * The window every dashboard figure is counted over, as a mongo range.
   *
   * Both bounds are optional, so an omitted one means "no bound" rather than
   * "now" — asking with neither gives the office's whole life. `endDate`
   * covers the whole day, so "up to the 5th" includes the 5th.
   */
  private buildWindow(
    { startDate, endDate }: OfficeWindowDto,
    field = 'createdAt',
  ): Record<string, unknown> {
    const range: Record<string, Date> = {};
    if (startDate) range.$gte = new Date(startDate);

    const end = this.appUtilService.parseRangeEnd(endDate);
    if (end) range.$lte = end;

    return Object.keys(range).length ? { [field]: range } : {};
  }

  /**
   * The window of the same length that ends where the selected one begins —
   * what "vs previous 30 days" is measured against.
   *
   * Returns nothing when the caller gave no start date: an unbounded window
   * has no length, so there is nothing to compare it with, and the page shows
   * no delta rather than a made-up one.
   */
  private buildPreviousWindow(
    { startDate, endDate }: OfficeWindowDto,
    field = 'createdAt',
  ): Record<string, unknown> | null {
    if (!startDate) return null;

    const start = new Date(startDate);
    const end = this.appUtilService.parseRangeEnd(endDate) ?? new Date();
    const span = end.getTime() - start.getTime();
    if (span <= 0) return null;

    return {
      [field]: {
        $gte: new Date(start.getTime() - span - 1),
        $lt: start,
      },
    };
  }

  /** Rounded to one decimal, the way every other rate on the API is. */
  private rate(part: number, whole: number): number {
    return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
  }

  async findOne(officeCode: string) {
    this.can('READ', 'Office');
    const office = await this.resolveOffice(officeCode);
    return await office.populate({
      path: 'officeTypeId',
      model: OfficeType.name,
    });
  }

  async update(officeCode: string, data: UpdateOfficeDto) {
    this.can('UPDATE', 'Office');
    const actorId = new Types.ObjectId(this.req.user.userId);
    const office = await this.resolveOffice(officeCode);

    if (data.officeName && data.officeName !== office.officeName) {
      const nameTaken = await this.officeModel.exists({
        officeName: data.officeName,
        _id: { $ne: office._id },
      });
      if (nameTaken) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'An office with this name already exists',
        });
      }
    }

    if (data.officeTypeId) {
      const officeType = await this.officeTypeModel.exists({
        _id: new Types.ObjectId(data.officeTypeId),
      });
      if (!officeType) {
        throw new BadRequestException({
          code: 'INVALID_OFFICE_TYPE',
          message: 'Invalid office type id',
        });
      }
    }

    const update: Record<string, unknown> = { ...data };
    if (data.officeTypeId)
      update.officeTypeId = new Types.ObjectId(data.officeTypeId);

    return await this.officeModel.findOneAndUpdate(
      { _id: office._id },
      update,
      {
        context: auditContext(this.req, actorId),
        returnDocument: 'after',
      } as never,
    );
  }

  /**
   * Mints a fresh signed link, which invalidates the previous one.
   *
   * Gated on UPDATE rather than READ: the old link stops working the moment
   * this runs, so anyone holding a printed QR code is cut off.
   */
  async regenerateLink(officeCode: string) {
    this.can('UPDATE', 'Office');
    const actorId = new Types.ObjectId(this.req.user.userId);
    const office = await this.resolveOffice(officeCode);

    return await this.officeModel.findOneAndUpdate(
      { _id: office._id },
      { signedLink: this.buildSignedLink(office.slug) },
      {
        context: auditContext(this.req, actorId),
        returnDocument: 'after',
      } as never,
    );
  }

  async assignUser(officeCode: string, data: AssignOfficeUserDto) {
    this.can('manage', 'Office');
    const office = await this.resolveOffice(officeCode);
    const actorId = new Types.ObjectId(this.req.user.userId);

    const userId = new Types.ObjectId(data.userId);
    const roleId = new Types.ObjectId(data.roleId);
    const [user, role] = await Promise.all([
      this.userModel.exists({ _id: userId }),
      this.roleModel.exists({ _id: roleId }),
    ]);
    if (!user) {
      throw new BadRequestException({
        code: 'INVALID_USER',
        message: 'Invalid user id',
      });
    }
    if (!role) {
      throw new BadRequestException({
        code: 'INVALID_ROLE',
        message: 'Invalid role id',
      });
    }

    // Re-assigning someone who was revoked revives the same row rather than
    // adding a second one, so the trail reads as one continuous posting
    // instead of a duplicate the staff list would then show twice.
    const assignment = await this.officeUserModel.findOneAndUpdate(
      { officeId: office._id, userId },
      { roleId, isActive: true },
      {
        upsert: true,
        returnDocument: 'after',
        context: auditContext(this.req, actorId),
      } as never,
    );

    this.logger.log(
      `assigned user ${data.userId} to office ${office.officeCode}`,
    );
    return assignment;
  }

  /**
   * Removes someone from the office.
   *
   * A soft revoke: the row is flagged inactive rather than deleted, so the
   * assignment stays in the audit trail. Deleting it would take the reason
   * and the date with it, and "who worked here in June" is exactly the
   * question the trail exists to answer.
   */
  async revokeUser(officeCode: string, userId: string) {
    this.can('manage', 'Office');
    const office = await this.resolveOffice(officeCode);
    const actorId = new Types.ObjectId(this.req.user.userId);

    const revoked = await this.officeUserModel.findOneAndUpdate(
      { officeId: office._id, userId: new Types.ObjectId(userId) },
      { isActive: false },
      {
        returnDocument: 'after',
        context: auditContext(this.req, actorId),
      } as never,
    );
    if (!revoked) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'This user is not assigned to this office',
      });
    }

    return 'User removed from office successfully';
  }

  /**
   * Who works here. Revoked assignments come back too, flagged inactive — the
   * staff card shows them greyed rather than hiding that someone left.
   */
  async listUsers(officeCode: string) {
    this.can('READ', 'Office');
    const office = await this.resolveOffice(officeCode);

    const staff = await this.officeUserModel
      .find({ officeId: office._id })
      .populate({ model: User.name, path: 'userId', select: '-passwordHash' })
      .populate({ model: Role.name, path: 'roleId' })
      .sort({ isActive: -1, createdAt: 1 });

    // `staff`/`assigned`, not `data`/`total`: see the note on getPerformance —
    // both of those key names are read by the interceptor as pagination.
    return {
      staff,
      assigned: staff.length,
      active: staff.filter((row) => row.isActive).length,
    };
  }

  /**
   * The headline numbers for one office over a window.
   *
   * Every figure is counted from the office's own operational records, not
   * from a rollup, so a KPI can never drift from the tables under it. Staff
   * and days-open ignore the window on purpose: they describe the office as
   * it stands today, which is why the page labels them as such.
   */
  async getOfficeSummary(officeCode: string, query: OfficeWindowDto) {
    this.can('READ', 'Office');
    const office = await this.resolveOffice(officeCode);
    const officeId = office._id;

    const window = this.buildWindow(query);
    const paidWindow = this.buildWindow(query, 'paidAt');

    const openOrders = [
      OrderStatusEnum.CONFIRMED,
      OrderStatusEnum.RECEIVED,
      OrderStatusEnum.WASHING,
      OrderStatusEnum.READY,
    ];
    const openPickups = [
      PickupStatusEnum.PENDING,
      PickupStatusEnum.CONFIRMED,
      PickupStatusEnum.ASSIGNED,
    ];

    const [openOrderIds, openPickupIds] = await Promise.all([
      this.orderStatusModel
        .find({ orderStatusName: { $in: openOrders } })
        .select('_id')
        .lean(),
      this.pickupStatusIds(openPickups),
    ]);

    const [
      orders,
      ordersOpen,
      pickups,
      pickupsOpen,
      money,
      outstanding,
      customersActive,
      newCustomers,
      staff,
    ] = await Promise.all([
      this.orderModel.countDocuments({ officeId, ...window }),
      this.orderModel.countDocuments({
        officeId,
        ...window,
        orderStatusId: { $in: openOrderIds.map((row) => row._id) },
      }),
      this.pickupModel.countDocuments({ officeId, ...window }),
      this.pickupModel.countDocuments({
        officeId,
        ...window,
        pickupStatusId: { $in: openPickupIds },
      }),
      this.collectedIn(officeId, paidWindow),
      this.orderModel.aggregate<{ n: number }>([
        { $match: { officeId, ...window } },
        { $group: { _id: null, n: { $sum: '$balanceDue' } } },
      ]),
      this.orderModel.distinct('customerId', { officeId, ...window }),
      this.customerModel.countDocuments({
        homeOfficeId: officeId,
        ...this.buildWindow(query, 'registeredAt'),
      }),
      this.officeUserModel.aggregate<{ _id: boolean; n: number }>([
        { $match: { officeId } },
        { $group: { _id: '$isActive', n: { $sum: 1 } } },
      ]),
    ]);

    const staffActive = staff.find((row) => row._id === true)?.n ?? 0;
    const staffTotal = staff.reduce((sum, row) => sum + row.n, 0);
    const daysOpen = Math.max(
      1,
      Math.round(
        (Date.now() - new Date(office.get('createdAt') as Date).getTime()) /
          86_400_000,
      ),
    );

    return {
      orders,
      ordersOpen,
      pickups,
      pickupsOpen,
      collected: money.collected,
      refunded: money.refunded,
      outstanding: outstanding[0]?.n ?? 0,
      customersActive: customersActive.length,
      newCustomers,
      staffTotal,
      staffActive,
      daysOpen,
      openedAt: office.get('createdAt') as Date,
    };
  }

  /** Status ids behind a list of pickup status names. */
  private async pickupStatusIds(names: PickupStatusEnum[]) {
    const rows = await this.pickupStatusModel
      .find({ pickupStatusName: { $in: names } })
      .select('_id')
      .lean();
    return rows.map((row) => row._id);
  }

  /**
   * Money taken at this office in a window. Refunds are returned separately
   * rather than netted off silently — a branch that collected 500k and
   * refunded 100k is not the same as one that collected 400k.
   */
  private async collectedIn(
    officeId: Types.ObjectId,
    paidWindow: Record<string, unknown>,
  ) {
    const rows = await this.paymentModel.aggregate<{
      _id: string;
      n: number;
    }>([
      { $match: { officeId, ...paidWindow } },
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
        $group: {
          _id: '$paymentType.paymentTypeName',
          n: { $sum: '$amount' },
        },
      },
    ]);

    const of = (name: PaymentTypeEnum) =>
      rows.find((row) => row._id === String(name))?.n ?? 0;

    return {
      collected: of(PaymentTypeEnum.PAYMENT),
      refunded: Math.abs(of(PaymentTypeEnum.REFUND)),
    };
  }

  /**
   * Orders and pickups broken down by the statuses the two services already
   * use. The counts are for the window; the status is each record's current
   * one, which is why the page says so rather than implying a snapshot.
   */
  async getOperations(officeCode: string, query: OfficeWindowDto) {
    this.can('READ', 'Office');
    const office = await this.resolveOffice(officeCode);
    const officeId = office._id;
    const window = this.buildWindow(query);

    const byStatus = async (
      model: Model<Order> | Model<PickupRequest>,
      localField: string,
      from: string,
      nameField: string,
    ) =>
      await model.aggregate<{ _id: string; n: number }>([
        { $match: { officeId, ...window } },
        {
          $lookup: {
            from,
            localField,
            as: 'status',
            foreignField: '_id',
            pipeline: [{ $project: { [nameField]: 1 } }],
          },
        },
        { $unwind: { path: '$status', preserveNullAndEmptyArrays: true } },
        { $group: { _id: `$status.${nameField}`, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ]);

    const [orderRows, pickupRows] = await Promise.all([
      byStatus(
        this.orderModel,
        'orderStatusId',
        orderStatusSchemaName,
        'orderStatusName',
      ),
      byStatus(
        this.pickupModel,
        'pickupStatusId',
        pickupStatusSchemaName,
        'pickupStatusName',
      ),
    ]);

    const shape = (rows: { _id: string; n: number }[]) => {
      const total = rows.reduce((sum, row) => sum + row.n, 0);
      return {
        total,
        data: rows.map((row) => ({
          status: row._id ?? 'UNKNOWN',
          count: row.n,
          share: this.rate(row.n, total),
        })),
      };
    };

    return { orders: shape(orderRows), pickups: shape(pickupRows) };
  }

  /**
   * One series for the performance chart, plus what the footer under it reads:
   * the period total, the average per bucket, and the change against the
   * window of the same length before it.
   *
   * `interval` sets how wide a bucket is — an hour, a day, a week, a month, a
   * quarter or a year. Quiet buckets come back as zero rather than missing, so
   * the chart draws a gap in trade as a gap rather than closing it up.
   */
  async getPerformance(officeCode: string, query: OfficePerformanceDto) {
    this.can('READ', 'Office');
    const office = await this.resolveOffice(officeCode);
    const officeId = office._id;
    const metric = query.metric ?? OfficeMetricEnum.ORDERS;
    const interval = query.interval ?? OfficeIntervalEnum.DAILY;

    // Collected is dated by when the money arrived, not when the row was
    // written; everything else is dated by creation.
    const dateField =
      metric === OfficeMetricEnum.COLLECTED ? 'paidAt' : 'createdAt';

    /*
     * Mongo only ever groups by hour or by day; a week, a month, a quarter and
     * a year are summed from those in JS below. `$dateTrunc` would do all six
     * server-side but needs MongoDB 5.0, and `$dateToString` has worked
     * forever. Rolling up a few hundred day rows costs nothing.
     */
    const format =
      interval === OfficeIntervalEnum.HOURLY ? '%Y-%m-%dT%H:00' : '%Y-%m-%d';

    const total = async (match: Record<string, unknown>) => {
      const rows = await this.seriesModel(metric).aggregate<{ n: number }>([
        { $match: { ...this.metricMatch(metric, officeId), ...match } },
        { $group: { _id: null, n: { $sum: this.metricSum(metric) } } },
      ]);
      return rows[0]?.n ?? 0;
    };

    const window = this.buildWindow(query, dateField);
    const previous = this.buildPreviousWindow(query, dateField);

    const [buckets, periodTotal, previousTotal] = await Promise.all([
      this.seriesModel(metric).aggregate<{ _id: string; n: number }>([
        { $match: { ...this.metricMatch(metric, officeId), ...window } },
        {
          $group: {
            _id: { $dateToString: { date: `$${dateField}`, format } },
            n: { $sum: this.metricSum(metric) },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      total(window),
      previous ? total(previous) : Promise.resolve(0),
    ]);

    const filled = this.fillBuckets(buckets, query, interval);

    /*
     * `points`, not `data`, and `periodTotal`, not `total`: the response
     * interceptor treats either of those two key names as the pagination
     * envelope — it spreads a payload carrying `total` onto the root and
     * collapses one carrying `data` down to that key alone. This payload is
     * neither a page nor a list, so it avoids both names.
     */
    return {
      metric,
      interval,
      points: filled,
      periodTotal,
      previousTotal,
      // Averaged over the buckets on screen, not over days: at `monthly` the
      // figure the reader wants is the average month, not the average day.
      buckets: filled.length,
      averagePerBucket:
        Math.round((periodTotal / (filled.length || 1)) * 100) / 100,
      // No previous window (or nothing in it) means no honest comparison, so
      // the delta is null and the page shows a dash rather than "+100%".
      deltaPercent:
        previous && previousTotal > 0
          ? Math.round((periodTotal / previousTotal - 1) * 1000) / 10
          : null,
    };
  }

  private seriesModel(metric: OfficeMetricEnum) {
    if (metric === OfficeMetricEnum.PICKUPS) return this.pickupModel;
    if (metric === OfficeMetricEnum.COLLECTED) return this.paymentModel;
    if (metric === OfficeMetricEnum.CUSTOMERS) return this.customerModel;
    return this.orderModel;
  }

  private metricMatch(metric: OfficeMetricEnum, officeId: Types.ObjectId) {
    // A customer belongs to an office, an order happens at one.
    return metric === OfficeMetricEnum.CUSTOMERS
      ? { homeOfficeId: officeId }
      : { officeId };
  }

  private metricSum(metric: OfficeMetricEnum) {
    return metric === OfficeMetricEnum.COLLECTED ? '$amount' : 1;
  }

  /**
   * The widest series a bucket fill will build. A 90-day window asked for
   * hourly is 2,160 slots — more than any chart can draw and more than a
   * reader can take in, so past this the sparse rows are returned as they
   * came rather than padding out the quiet hours.
   */
  private static readonly MAX_BUCKETS = 1000;

  /**
   * Turns the aggregation's sparse hour or day rows into one entry per bucket
   * of the window, at the width the caller asked for.
   *
   * With no start date there is nothing to fill between, so the rows are
   * rolled up as they came.
   */
  private fillBuckets(
    rows: { _id: string; n: number }[],
    { startDate, endDate }: OfficeWindowDto,
    interval: OfficeIntervalEnum,
  ) {
    const hourly = interval === OfficeIntervalEnum.HOURLY;
    const step = hourly ? 3_600_000 : 86_400_000;
    const found = new Map(rows.map((row) => [row._id, row.n]));

    if (!startDate) {
      return this.rollUp(
        rows.map((row) => [row._id, row.n] as const),
        interval,
      );
    }

    const from = new Date(startDate);
    const end = this.appUtilService.parseRangeEnd(endDate) ?? new Date();
    // Start on the boundary the aggregation grouped to, so the first slot's
    // key matches a key Mongo could have returned.
    const start = Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
      hourly ? from.getUTCHours() : 0,
    );

    if ((end.getTime() - start) / step > OfficeService.MAX_BUCKETS) {
      return this.rollUp(
        rows.map((row) => [row._id, row.n] as const),
        interval,
      );
    }

    const slots: (readonly [string, number])[] = [];
    for (let at = start; at <= end.getTime(); at += step) {
      const key = new Date(at).toISOString().slice(0, hourly ? 13 : 10);
      const slot = hourly ? `${key}:00` : key;
      slots.push([slot, found.get(slot) ?? 0]);
    }

    return this.rollUp(slots, interval);
  }

  /**
   * Sums hour or day slots into the buckets the caller asked for. The slots
   * arrive in order, so the buckets come out in order too.
   */
  private rollUp(
    slots: (readonly [string, number])[],
    interval: OfficeIntervalEnum,
  ) {
    const out: { date: string; value: number }[] = [];
    const seen = new Map<string, { date: string; value: number }>();

    for (const [slot, value] of slots) {
      const key = this.bucketKey(slot, interval);
      const bucket = seen.get(key);
      if (bucket) {
        bucket.value += value;
        continue;
      }
      const fresh = { date: key, value };
      seen.set(key, fresh);
      out.push(fresh);
    }

    return out;
  }

  /**
   * The bucket one hour or day falls in, named by the date that bucket starts
   * on. Every interval but `hourly` returns a plain `YYYY-MM-DD`, so the
   * client can parse and label it however it likes.
   */
  private bucketKey(slot: string, interval: OfficeIntervalEnum): string {
    if (interval === OfficeIntervalEnum.HOURLY) return slot;

    const day = slot.slice(0, 10);
    const [year, month, date] = day.split('-').map(Number);

    switch (interval) {
      case OfficeIntervalEnum.WEEKLY: {
        // Weeks start on Monday; `getUTCDay` calls Sunday 0, so shift by six.
        const at = Date.UTC(year, month - 1, date);
        const back = (new Date(at).getUTCDay() + 6) % 7;
        return new Date(at - back * 86_400_000).toISOString().slice(0, 10);
      }
      case OfficeIntervalEnum.MONTHLY:
        return `${day.slice(0, 7)}-01`;
      case OfficeIntervalEnum.QUARTERLY: {
        const first = Math.floor((month - 1) / 3) * 3 + 1;
        return `${year}-${String(first).padStart(2, '0')}-01`;
      }
      case OfficeIntervalEnum.YEARLY:
        return `${year}-01-01`;
      default:
        return day;
    }
  }

  /**
   * The ratios the insight card reads: how work arrives, what it turns into,
   * and the four rates underneath.
   */
  async getInsights(officeCode: string, query: OfficeWindowDto) {
    this.can('READ', 'Office');
    const office = await this.resolveOffice(officeCode);
    const officeId = office._id;
    const window = this.buildWindow(query);

    const [
      orders,
      ordersWithPickup,
      delivered,
      cancelled,
      amounts,
      pickups,
      pickupsWithOrders,
      money,
      staffActive,
    ] = await Promise.all([
      this.orderModel.countDocuments({ officeId, ...window }),
      this.orderModel.countDocuments({
        officeId,
        ...window,
        pickupRequestId: { $ne: null, $exists: true },
      }),
      this.countOrdersWithStatus(officeId, window, OrderStatusEnum.DELIVERED),
      this.countOrdersWithStatus(officeId, window, OrderStatusEnum.CANCELLED),
      this.orderModel.aggregate<{ total: number }>([
        { $match: { officeId, ...window } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      this.pickupModel.countDocuments({ officeId, ...window }),
      this.orderModel.distinct('pickupRequestId', {
        officeId,
        ...window,
        pickupRequestId: { $ne: null, $exists: true },
      }),
      this.collectedIn(officeId, this.buildWindow(query, 'paidAt')),
      this.officeUserModel.countDocuments({ officeId, isActive: true }),
    ]);

    const orderValue = amounts[0]?.total ?? 0;
    // Cancelled orders never had a chance to complete, so counting them as
    // failures would punish the rate for work that was called off.
    const completionBase = orders - cancelled;

    return {
      ordersWithPickup,
      ordersNoPickup: orders - ordersWithPickup,
      pickupsWithOrders: pickupsWithOrders.length,
      pickupsNoOrders: Math.max(pickups - pickupsWithOrders.length, 0),
      averageOrderValue: orders > 0 ? Math.round(orderValue / orders) : 0,
      completionRate: this.rate(delivered, completionBase),
      collectionRate: this.rate(money.collected, orderValue),
      ordersPerStaff:
        staffActive > 0 ? Math.round((orders / staffActive) * 10) / 10 : 0,
    };
  }

  private async countOrdersWithStatus(
    officeId: Types.ObjectId,
    window: Record<string, unknown>,
    status: OrderStatusEnum,
  ) {
    const row = await this.orderStatusModel
      .findOne({ orderStatusName: status })
      .select('_id')
      .lean();
    if (!row) return 0;

    return await this.orderModel.countDocuments({
      officeId,
      ...window,
      orderStatusId: row._id,
    });
  }

  /**
   * The office's audit trail — its own profile and status changes merged with
   * every staff assignment and revocation, newest first.
   *
   * The two trails live in different collections because they are different
   * records, but a reader does not care which one moved: "address corrected"
   * and "Sandra Efon removed from Front Desk" belong in one list. Each entry
   * says which trail it came from so the page can label it.
   */
  async findHistory(officeCode: string, { page, size }: PaginationDto) {
    this.can('READ', 'Office');
    const office = await this.resolveOffice(officeCode);

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

    // The staff trail keys on the assignment, not the office, so its rows are
    // reached through the assignments belonging to this office.
    const assignments = await this.officeUserModel
      .find({ officeId: office._id })
      .select('_id')
      .lean();
    const assignmentIds = assignments.map((row) => row._id);

    const skip = (page - 1) * size;
    const [result] = await this.officeHistoryModel.aggregate<{
      rows: OfficeHistoryEntry[];
      counted: { n: number }[];
    }>([
      { $match: { officeId: office._id } },
      { $project: { ...changeProjection, source: 'office' } },
      {
        $unionWith: {
          coll: officeUserHistorySchemaName,
          pipeline: [
            { $match: { officeUserId: { $in: assignmentIds } } },
            { $project: { ...changeProjection, source: 'staff' } },
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

    const rows = result?.rows ?? [];
    const total = result?.counted[0]?.n ?? 0;

    // `officeTypeId: 6a58…37 → 6a58…39` means nothing to a reader, so every
    // foreign key gets its label attached. The two trails are labelled apart
    // because the refs to resolve come off each schema's own definition.
    await Promise.all([
      this.historyLabelService.labelChanges(
        Office.name,
        rows.filter((row) => row.source === 'office'),
      ),
      this.historyLabelService.labelChanges(
        OfficeUser.name,
        rows.filter((row) => row.source === 'staff'),
      ),
    ]);

    const totalPages = Math.ceil(total / size);
    return { total, data: rows, nextPage: page < totalPages ? page + 1 : null };
  }
}
