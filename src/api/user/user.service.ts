import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { ActivityService } from 'src/helper/service/activity.service';
import { ActivityKindEnum } from 'src/schema/activity/activity.dto';
import {
  applyAuditLocals,
  auditContext,
} from 'src/helper/service/audit-context';
import {
  buildExportCsv,
  buildExportExcel,
  type ExportColumn,
} from 'src/helper/service/export-file.service';
import { SAFE_USER_RECORD_SELECT } from 'src/helper/projection/user.projection';
import { UserType } from 'src/schema/user/user-type.schema';
import { UserTypeEum } from 'src/schema/user/user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from 'src/schema/user/user.schema';
import { FindAllUserDto } from './dto/find-all-user.dto';
import { ExportUserDto, UserExportFormatEnum } from './dto/export-user.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { Role } from 'src/schema/admin/role.schema';
import { Permission } from 'src/schema/admin/permission.schema';
import { RolePermission } from 'src/schema/admin/role-permission.schema';
import { UserRole } from 'src/schema/admin/user-role.schema';
import { Office } from 'src/schema/office/office.schema';
import { OfficeUser } from 'src/schema/office/office-user.schema';
import { officeUserHistorySchemaName } from 'src/schema/office/office-user-history.schema';
import { UserHistory } from 'src/schema/user/user-history.schema';
import { HistoryLabelService } from 'src/helper/service/history-label.service';
import { SAFE_USER_PROJECTION } from 'src/helper/projection/user.projection';
import { PaginationDto } from 'src/dto/request-data.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { phoneQuery, toE164Digits } from 'src/helper/phone';

/**
 * The two numbers in their stored form — digits with the country code — so an
 * upsert cannot write the bare national spelling back over a normalised row.
 */
function normalisedPhones(data: { phone: string; whatsappPhone?: string }) {
  return {
    phone: toE164Digits(data.phone),
    ...(data.whatsappPhone
      ? { whatsappPhone: toE164Digits(data.whatsappPhone) }
      : {}),
  };
}

/** One row of the staff export, as the projection below shapes it. */
type UserExportRow = {
  reference: string;
  firstName: string;
  lastName: string;
  phone: string;
  whatsappPhone: string;
  email: string;
  gender: string;
  preferredLanguage: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Column order of the staff export — drives both CSV and Excel.
 *
 * `passwordHash` is not absent by oversight but by construction: the
 * projection below is an allow-list, so a secret the schema grows next cannot
 * find its way into a file that leaves the building.
 */
const USER_EXPORT_COLUMNS: ExportColumn<UserExportRow>[] = [
  { header: 'Reference', key: 'reference' },
  { header: 'First Name', key: 'firstName' },
  { header: 'Last Name', key: 'lastName' },
  { header: 'Phone', key: 'phone' },
  { header: 'WhatsApp Phone', key: 'whatsappPhone' },
  { header: 'Email', key: 'email' },
  { header: 'Gender', key: 'gender' },
  { header: 'Language', key: 'preferredLanguage' },
  { header: 'Status', key: 'status' },
  { header: 'Created At', key: 'createdAt' },
  { header: 'Updated At', key: 'updatedAt' },
];

/**
 * One entry of the merged account trail. `source` says which record moved,
 * because the two collections answer different questions and a reader should
 * be able to tell "the number was corrected" from "they were posted to
 * Bonapriso".
 */
export type UserHistoryEntry = {
  action: string;
  reason?: string;
  source: 'account' | 'posting';
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

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    private readonly codeService: CodeGeneratorService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(UserType.name) private readonly userTypeModel: Model<UserType>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(UserRole.name) private readonly userRoleModel: Model<UserRole>,
    @InjectModel(Office.name) private readonly officeModel: Model<Office>,
    @InjectModel(OfficeUser.name)
    private readonly officeUserModel: Model<OfficeUser>,
    @InjectModel(RolePermission.name)
    private readonly rolePermissionModel: Model<RolePermission>,
    @InjectModel(UserHistory.name)
    private readonly userHistoryModel: Model<UserHistory>,
    private readonly historyLabelService: HistoryLabelService,
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

  async newUser({ password, ...data }: CreateUserDto) {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;
    const userId = new Types.ObjectId(this.req.user.userId);

    if (!ability.can('CREATE', 'User')) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} ${log}`);
      throw new BadRequestException(`You are ${log}`);
    }

    const userTypeId = new Types.ObjectId(data.userTypeId);
    const userTypeExists = await this.userTypeModel.findOne({
      _id: userTypeId,
    });
    if (!userTypeExists) {
      this.logger.error(`[${platform}] ${phone} the user type id is invalid`);
      throw new BadRequestException('Invalid user type id');
    }

    /**
     * Staff only, like every read in this module.
     *
     * This used to accept a CUSTOMER type and write the `User` + `Customer`
     * pair itself, but nothing ever called it that way and the path was
     * broken: it minted a `referralCode` and no `customerCode`, which the
     * schema requires and indexes unique and non-sparse — so the first such
     * customer would be unaddressable on the customers page, and the second
     * would collide on a null key. `POST /v1/customers` does that job
     * properly, referrals included, so this refuses rather than competing.
     */
    if (userTypeExists.userTypeName !== UserTypeEum.ADMIN.toString()) {
      this.logger.error(
        `[${platform}] ${phone} tried to create a ${userTypeExists.userTypeName} through /users`,
      );
      throw new BadRequestException({
        code: 'STAFF_ONLY',
        message:
          'This endpoint creates staff accounts. Register a customer through /v1/customers.',
      });
    }

    if (!password) {
      const log = 'is required to create a staff account';
      this.logger.error(`[${platform}] ${phone} password ${log}`);
      throw new BadRequestException(`Password ${log}`);
    }

    // Every spelling, so a legacy row is found before a duplicate is written.
    const userExists = await this.userModel.findOne({
      phone: phoneQuery(data.phone),
    });
    if (userExists) {
      const log = `[${platform}] ${phone} this user ${data.phone} already exists.`;
      this.logger.error(log);
      throw new BadRequestException('This user already exists');
    }

    const emailExists = await this.userModel.findOne({ email: data.email });
    if (emailExists && emailExists.phone !== data.phone) {
      const log = `[${platform}] ${phone} this email ${data.email} is already taken`;
      this.logger.error(log);
      throw new BadRequestException('The provided email has been taken.');
    }

    const reference = await this.codeService.generateUserReference();
    const hashedPassword = await this.codeService.hashPlainText(password);

    /**
     * A plain create, not an upsert on the phone number. The duplicate check
     * above has already refused an existing number, so an upsert could only
     * ever overwrite somebody — and `save()` is what writes a CREATE row with
     * a full snapshot on the audit trail, which is what a new account is.
     */
    const user = new this.userModel({
      ...data,
      ...normalisedPhones(data),
      userTypeId,
      reference,
      passwordHash: hashedPassword,
    });
    applyAuditLocals(user, this.req, userId);
    await user.save();

    this.logger.log(
      `[${platform}] ${phone} has created staff account ${reference}.`,
    );

    // The reference, never the whole document: the caller needs something to
    // address the new account by, and nothing on a user row is worth echoing
    // back to a client that only asked to create one.
    return { reference };
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
  }: Pick<FindAllUserDto, 'startDate' | 'endDate'>) {
    const range: Record<string, Date> = {};
    if (startDate) range.$gte = new Date(startDate);

    const end = this.appUtilService.parseRangeEnd(endDate);
    if (end) range.$lte = end;

    return Object.keys(range).length ? range : undefined;
  }

  /**
   * The id of the ADMIN user type — the one scope every read in this module
   * runs inside.
   *
   * The taxonomy lives in the `user_type` collection, so the name is resolved
   * to its id rather than matched against a hardcoded enum. A database with no
   * ADMIN row seeded has no staff, not every user: the fallback is an id that
   * can never match, so a missing seed returns nothing rather than opening the
   * whole identity table.
   */
  private async adminTypeId(): Promise<Types.ObjectId> {
    const adminType = await this.userTypeModel
      .findOne({ userTypeName: UserTypeEum.ADMIN.toString() })
      .select('_id')
      .lean();

    return adminType?._id ?? new Types.ObjectId();
  }

  /**
   * The filters behind the list, the KPIs and the export, built once so the
   * three can never disagree.
   *
   * Every one of them is pinned to ADMIN. This module answers for staff — the
   * people who sign in to work — and nothing else: customers are read through
   * `/v1/customers`, which knows about their orders, their spend and their
   * home office. So the type is not a filter a caller may pass, it is the
   * scope the endpoint lives in.
   *
   * The three parts come back apart rather than merged, because the KPI
   * endpoint needs them in different combinations: the standing counts drop
   * the date window, and the status breakdown drops `isActive`.
   */
  private async buildUserFilter(query: Omit<FindAllUserDto, 'page' | 'size'>) {
    const base: Record<string, unknown> = {
      userTypeId: await this.adminTypeId(),
    };

    if (query.q) {
      const rx = new RegExp(this.appUtilService.escapeRegex(query.q), 'i');
      base.$or = [
        { reference: rx },
        { firstName: rx },
        { lastName: rx },
        { email: rx },
        { phone: rx },
        { whatsappPhone: rx },
      ];
    }

    const createdAt = this.buildCreatedAtRange(query);
    const window = createdAt ? { createdAt } : undefined;

    const status =
      typeof query.isActive === 'boolean'
        ? { isActive: query.isActive }
        : undefined;

    return { base, window, status };
  }

  async findAll({ page, size, ...query }: FindAllUserDto) {
    this.can('READ', 'User');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { base, window, status } = await this.buildUserFilter(query);
    const where = { ...base, ...window, ...status };

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const users = await this.userModel
      .find(where)
      // An allow-list, never `-passwordHash`: an exclusion would leak whatever
      // secret the schema grows next.
      .select(SAFE_USER_RECORD_SELECT)
      .populate({ model: UserType.name, path: 'userTypeId' })
      .sort(sort)
      .skip(skip)
      .limit(size);

    const totalUsers = await this.userModel.countDocuments(where);
    const totalPages = Math.ceil(totalUsers / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(
      `[${platform}] ${phone} has successfully retrieved all users`,
    );
    return { total: totalUsers, data: users, nextPage };
  }

  /**
   * Headline staff counts for the admin user file.
   *
   * `totalStaff` and `byStatusCount` respect the date window, so the tab strip
   * and the pager agree about what the table is showing. `totalActive` and
   * `totalInactive` deliberately do not: "how many staff are there" is a
   * question about the people on the books, not about who joined last month.
   * `totalNew` is the one that answers the window.
   */
  async getUserKpis(query: Omit<FindAllUserDto, 'page' | 'size'>) {
    this.can('READ', 'User');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { base, window, status } = await this.buildUserFilter(query);

    const [totalStaff, totalNew, byStatus, standing] = await Promise.all([
      this.userModel.countDocuments({ ...base, ...window, ...status }),
      this.userModel.countDocuments({ ...base, ...window }),
      this.userModel.aggregate<{ _id: boolean; n: number }>([
        { $match: { ...base, ...window } },
        { $group: { _id: '$isActive', n: { $sum: 1 } } },
      ]),
      this.userModel.aggregate<{ _id: boolean; n: number }>([
        { $match: base },
        { $group: { _id: '$isActive', n: { $sum: 1 } } },
      ]),
    ]);

    const countIn = (rows: { _id: boolean; n: number }[], isActive: boolean) =>
      rows.find((row) => row._id === isActive)?.n ?? 0;

    const active = countIn(byStatus, true);
    const inactive = countIn(byStatus, false);

    this.logger.log(`[${platform}] ${phone} has retrieved staff kpis`);

    return {
      totalStaff,
      totalActive: countIn(standing, true),
      totalInactive: countIn(standing, false),
      totalNew,
      byStatusCount: { all: active + inactive, active, inactive },
    };
  }

  /**
   * Export the filtered users (same params as findAll, no pagination) as a CSV
   * or Excel file. Returns the raw bytes + filename + content-type; the
   * controller streams them as an attachment.
   */
  async exportUsers({ format, ...query }: ExportUserDto): Promise<{
    buffer: Buffer;
    filename: string;
    contentType: string;
  }> {
    // Gated on EXPORT rather than READ so a bulk download of names, phone
    // numbers and emails can be kept to reporting/oversight roles, the way
    // every other export is.
    this.can('EXPORT', 'User');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { base, window, status } = await this.buildUserFilter(query);

    const rows = await this.userModel.aggregate<UserExportRow>([
      { $match: { ...base, ...window, ...status } },
      { $sort: { createdAt: -1 } },
      {
        // An allow-list, so `passwordHash` cannot reach the file even if
        // somebody adds a second secret to the schema tomorrow.
        //
        // No user-type column: every row in this file is staff, so a column
        // reading ADMIN all the way down says nothing.
        $project: {
          _id: 0,
          reference: { $ifNull: ['$reference', ''] },
          firstName: { $ifNull: ['$firstName', ''] },
          lastName: { $ifNull: ['$lastName', ''] },
          phone: { $ifNull: ['$phone', ''] },
          whatsappPhone: { $ifNull: ['$whatsappPhone', ''] },
          email: { $ifNull: ['$email', ''] },
          gender: { $ifNull: ['$gender', ''] },
          preferredLanguage: { $ifNull: ['$preferredLanguage', ''] },
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
    if (format === UserExportFormatEnum.EXCEL) {
      result = {
        buffer: await buildExportExcel(rows, USER_EXPORT_COLUMNS, 'Users'),
        filename: `users-export-${stamp}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    } else {
      result = {
        buffer: buildExportCsv(rows, USER_EXPORT_COLUMNS),
        filename: `users-export-${stamp}.csv`,
        contentType: 'text/csv',
      };
    }

    this.logger.log(
      `[${platform}] ${phone} exported ${rows.length} users as ${format}`,
    );
    // A bulk pull leaves no trace on any record — the rows are only read — so
    // the trail is the only place it is ever visible.
    await this.activityService.recordFromRequest(this.req, {
      userId: new Types.ObjectId(this.req.user.userId),
      kind: ActivityKindEnum.EXPORT,
      action: 'user.export',
      resource: 'User',
      metadata: { format, rows: rows.length },
    });

    return result;
  }

  /**
   * Finds the staff member a by-user read or write is addressed to.
   *
   * The reference is the address — it is what the admin panel puts in the URL
   * and what a support conversation quotes. A mongo id is still accepted so
   * callers written against the old `:id` routes keep working; nothing new
   * should send one.
   *
   * Pinned to ADMIN, like every list above: a customer's id handed to this
   * route is a 404, not a way in through the side door. Customers are read and
   * corrected through `/v1/customers/:customerCode`.
   *
   * Returns the id only. Every caller below re-reads what it needs through its
   * own projection, so this can never be the thing that leaks a password hash.
   */
  private async resolveUserId(reference: string): Promise<Types.ObjectId> {
    const code = reference.trim().toUpperCase();
    const address = Types.ObjectId.isValid(code)
      ? { $or: [{ reference: code }, { _id: new Types.ObjectId(code) }] }
      : { reference: code };
    const where = { ...address, userTypeId: await this.adminTypeId() };

    const user = await this.userModel.findOne(where).select('_id').lean();
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }
    return user._id;
  }

  async findOne(reference: string) {
    this.can('READ', 'User');
    const userId = await this.resolveUserId(reference);

    const user = await this.userModel
      .findById(userId)
      .select(SAFE_USER_RECORD_SELECT)
      .populate({ model: UserType.name, path: 'userTypeId' });

    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }
    return user;
  }

  async update(reference: string, data: UpdateUserDto) {
    this.can('UPDATE', 'User');
    const userId = await this.resolveUserId(reference);
    const actorId = new Types.ObjectId(this.req.user.userId);

    if (data.email) {
      const emailTaken = await this.userModel.exists({
        email: data.email,
        _id: { $ne: userId },
      });
      if (emailTaken) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'The provided email has been taken',
        });
      }
    }

    const updated = await this.userModel
      .findOneAndUpdate({ _id: userId }, data, {
        context: auditContext(this.req, actorId),
        returnDocument: 'after',
      } as never)
      .select(SAFE_USER_RECORD_SELECT)
      .populate({ model: UserType.name, path: 'userTypeId' });

    return updated;
  }

  /**
   * Every role this person holds, global and per-office alike.
   *
   * The two live in different collections — `UserRole` for a grant that
   * applies everywhere, `OfficeUser` for one pinned to a branch — and a screen
   * that showed only one of them would tell somebody they have no authority
   * when they have plenty. So both are read and merged, each entry saying
   * which it came from.
   *
   * Read on the user is enough: this only says what someone may already do,
   * which anyone allowed to open their record can see. Granting and revoking
   * are the `manage` gate below.
   */
  async listRoles(reference: string) {
    this.can('READ', 'User');
    const userId = await this.resolveUserId(reference);

    const [global, perOffice] = await Promise.all([
      this.userRoleModel
        .find({ userId })
        .populate({ model: Role.name, path: 'roleId' }),
      this.officeUserModel
        .find({ userId })
        .populate({ model: Role.name, path: 'roleId' })
        .populate({ model: Office.name, path: 'officeId' }),
    ]);

    const permissions = await this.permissionsByRole([
      ...global.map((row) => row.roleId),
      ...perOffice.map((row) => row.roleId),
    ]);

    /**
     * `roles`, not `data`: the response interceptor reads `data` at the top
     * level of a payload as the pagination envelope, and this is one record's
     * roles, not a page of them.
     */
    const roles = [
      ...global.map((row) => ({
        _id: row._id,
        scope: 'GLOBAL' as const,
        role: row.roleId,
        office: null,
        isActive: true,
        createdAt: (row as unknown as { createdAt?: Date }).createdAt,
        permissions:
          permissions.get(String(row.roleId?._id ?? row.roleId)) ?? [],
      })),
      ...perOffice.map((row) => ({
        _id: row._id,
        scope: 'OFFICE' as const,
        role: row.roleId,
        office: row.officeId,
        isActive: row.isActive,
        createdAt: (row as unknown as { createdAt?: Date }).createdAt,
        permissions:
          permissions.get(String(row.roleId?._id ?? row.roleId)) ?? [],
      })),
    ];

    return {
      roles,
      granted: global.length + perOffice.length,
      /**
       * Every distinct `action` on `subject` the person holds, counted once
       * however many roles carry it. Two roles that both allow reading orders
       * is one thing they may do, and a page that said "2" there would be
       * counting grants rather than authority.
       */
      permissionCount: new Set(
        roles.flatMap((row) =>
          row.permissions.map((perm) => `${perm.action}:${perm.subject}`),
        ),
      ).size,
    };
  }

  /**
   * What each of these roles actually allows, keyed by role id.
   *
   * One query for every role rather than one per role: a person with four
   * grants is common and four round trips for a read-only panel is not worth
   * paying. A role whose permission row points at a permission that has since
   * been deleted simply drops out — the alternative is a row on screen with
   * no action and no subject, which reads as authority nobody can name.
   */
  private async permissionsByRole(roleIds: unknown[]) {
    const ids = roleIds
      .map((role) => {
        const id = (role as { _id?: Types.ObjectId } | null)?._id ?? role;
        return id instanceof Types.ObjectId ? id : null;
      })
      .filter((id): id is Types.ObjectId => !!id);

    const byRole = new Map<
      string,
      { _id: Types.ObjectId; action: string; subject: string; scope: string }[]
    >();
    if (!ids.length) return byRole;

    const rows = await this.rolePermissionModel
      .find({ roleId: { $in: ids } })
      .populate<{ permissionId: Permission | null }>({
        model: Permission.name,
        path: 'permissionId',
        select: 'action subject isActive',
      })
      .lean();

    for (const row of rows) {
      const permission = row.permissionId;
      if (!permission) continue;

      const key = String(row.roleId);
      const held = byRole.get(key) ?? [];
      held.push({
        _id: row._id,
        scope: row.scope,
        action: permission.action,
        subject: permission.subject,
      });
      byRole.set(key, held);
    }

    return byRole;
  }

  async assignRole(reference: string, data: AssignRoleDto) {
    this.can('manage', 'User');
    const userId = await this.resolveUserId(reference);
    const actorId = new Types.ObjectId(this.req.user.userId);

    const roleId = new Types.ObjectId(data.roleId);
    const role = await this.roleModel.findById(roleId);
    if (!role) {
      throw new BadRequestException({
        code: 'INVALID_ROLE',
        message: 'Invalid role id',
      });
    }

    // With an office → a per-office OfficeUser assignment; without → a global
    // UserRole. Upserts keep the operation idempotent.
    if (data.officeId) {
      const officeId = new Types.ObjectId(data.officeId);
      const office = await this.officeModel.findById(officeId);
      if (!office) {
        throw new BadRequestException({
          code: 'INVALID_OFFICE',
          message: 'Invalid office id',
        });
      }
      await this.officeUserModel.findOneAndUpdate(
        { userId, roleId, officeId },
        { userId, roleId, officeId, isActive: true },
        { upsert: true, context: auditContext(this.req, actorId) } as never,
      );
      return 'Office role assigned successfully';
    }

    await this.userRoleModel.findOneAndUpdate(
      { userId, roleId },
      { userId, roleId },
      { upsert: true } as never,
    );
    return 'Role assigned successfully';
  }

  async revokeRole(reference: string, roleId: string) {
    this.can('manage', 'User');
    const userId = await this.resolveUserId(reference);
    const role = new Types.ObjectId(roleId);

    await Promise.all([
      this.userRoleModel.deleteOne({ userId, roleId: role }),
      this.officeUserModel.deleteMany({ userId, roleId: role }),
    ]);
    return 'Role revoked successfully';
  }

  async deactivate(reference: string) {
    this.can('manage', 'User');
    const userId = await this.resolveUserId(reference);
    const actorId = new Types.ObjectId(this.req.user.userId);

    await this.userModel.findOneAndUpdate(
      { _id: userId },
      { isActive: false },
      {
        context: auditContext(this.req, actorId),
        returnDocument: 'after',
      } as never,
    );
    return 'User deactivated successfully';
  }

  /**
   * What happened to this account, newest first.
   *
   * Two trails merged: the account's own record — the profile corrections,
   * the deactivations — and every office posting granted or revoked on it.
   * They live in different collections because they are different records,
   * but a reader does not care which one moved: "phone corrected" and
   * "made Office Manager at DD-105" belong in one list. Each entry says which
   * trail it came from so the page can label it.
   *
   * A role granted globally rather than at a branch leaves no entry, because
   * `UserRole` carries no history collection. That is a gap in the audit
   * trail, not a decision made here.
   *
   * This is the other question from `GET /v1/activity/users/:reference`:
   * that one answers what this person DID, this one what was DONE TO their
   * account.
   */
  async findHistory(reference: string, { page, size }: PaginationDto) {
    this.can('READ', 'User');
    const userId = await this.resolveUserId(reference);

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

    // The posting trail keys on the assignment, not the user, so its rows are
    // reached through the assignments belonging to this person.
    const assignments = await this.officeUserModel
      .find({ userId })
      .select('_id')
      .lean();
    const assignmentIds = assignments.map((row) => row._id);

    const skip = (page - 1) * size;
    const [result] = await this.userHistoryModel.aggregate<{
      rows: UserHistoryEntry[];
      counted: { n: number }[];
    }>([
      { $match: { userId } },
      { $project: { ...changeProjection, source: 'account' } },
      {
        $unionWith: {
          coll: officeUserHistorySchemaName,
          pipeline: [
            { $match: { officeUserId: { $in: assignmentIds } } },
            { $project: { ...changeProjection, source: 'posting' } },
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

    // `roleId: 6a58…37 → 6a58…39` means nothing to a reader, so every foreign
    // key gets its label attached. The two trails are labelled apart because
    // the refs to resolve come off each schema's own definition.
    await Promise.all([
      this.historyLabelService.labelChanges(
        User.name,
        rows.filter((row) => row.source === 'account'),
      ),
      this.historyLabelService.labelChanges(
        OfficeUser.name,
        rows.filter((row) => row.source === 'posting'),
      ),
    ]);

    const totalPages = Math.ceil(total / size);
    return { total, data: rows, nextPage: page < totalPages ? page + 1 : null };
  }

  /**
   * Puts a deactivated user back to work. The mirror of `deactivate`, and
   * gated the same: switching an account back on is the same authority as
   * switching it off.
   */
  async reactivate(reference: string) {
    this.can('manage', 'User');
    const userId = await this.resolveUserId(reference);
    const actorId = new Types.ObjectId(this.req.user.userId);

    await this.userModel.findOneAndUpdate({ _id: userId }, { isActive: true }, {
      context: auditContext(this.req, actorId),
      returnDocument: 'after',
    } as never);
    return 'User reactivated successfully';
  }
}
