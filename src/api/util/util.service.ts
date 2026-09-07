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
import {
  type AppRequestWithUser,
  PaginationDto,
} from 'src/dto/request-data.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { SAFE_USER_PROJECTION } from 'src/helper/projection/user.projection';
import { AppUtilService } from 'src/helper/service/app-util.service';
import {
  applyAuditLocals,
  auditContext,
} from 'src/helper/service/audit-context';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { HistoryLabelService } from 'src/helper/service/history-label.service';
import type {
  ReferenceHistoryEntry,
  ReferenceKpis,
} from 'src/helper/types/reference.type';
import { Role } from 'src/schema/admin/role.schema';
import { officeTypeHistorySchemaName } from 'src/schema/office/office-type-history.schema';
import { OfficeType } from 'src/schema/office/office-type.schema';
import { officeSchemaName } from 'src/schema/office/office.schema';
import { pickupStatusHistorySchemaName } from 'src/schema/pickup/pickup-status-history.schema';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { orderStatusHistorySchemaName } from 'src/schema/order/order-status-history.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { orderSchemaName } from 'src/schema/order/order.schema';
import { userTypeHistorySchemaName } from 'src/schema/user/user-type-history.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';
import { paymentMethodHistorySchemaName } from 'src/schema/payment/payment-method-history.schema';
import { PaymentMethod } from 'src/schema/payment/payment-method.schema';
import { paymentTypeHistorySchemaName } from 'src/schema/payment/payment-type-history.schema';
import { PaymentType } from 'src/schema/payment/payment-type.schema';
import { paymentSchemaName } from 'src/schema/payment/payment.schema';
import { CreateOfficeTypeDto } from './dto/create-office-type.dto';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { CreatePaymentTypeDto } from './dto/create-payment-type.dto';
import { CreateOrderStatusDto } from './dto/create-order-status.dto';
import { CreatePickupStatusDto } from './dto/create-pickup-status.dto';
import { CreateUserTypeDto } from './dto/create-user-type.dto';
import { FindOfficeTypeDto } from './dto/find-office-type.dto';
import { FindPaymentMethodDto } from './dto/find-payment-method.dto';
import { FindPaymentTypeDto } from './dto/find-payment-type.dto';
import { FindOrderStatusDto } from './dto/find-order-status.dto';
import { FindPickupStatusDto } from './dto/find-pickup-status.dto';
import { UpdateOfficeTypeDto } from './dto/update-office-type.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { UpdatePaymentTypeDto } from './dto/update-payment-type.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdatePickupStatusDto } from './dto/update-pickup-status.dto';
import { FindUserTypeDto } from './dto/find-user-type.dto';
import { UpdateUserTypeDto } from './dto/update-user-type.dto';

/** One user type with everything the detail panel shows. */
export type UserTypeDetail = Record<string, unknown> & {
  reference: string;
  userCount: number;
  history: ReferenceHistoryEntry[];
};

/** One pickup status with everything the detail panel shows. */
export type PickupStatusDetail = Record<string, unknown> & {
  reference: string;
  pickupCount: number;
  history: ReferenceHistoryEntry[];
};

/** One order status with everything the detail panel shows. */
export type OrderStatusDetail = Record<string, unknown> & {
  reference: string;
  orderCount: number;
  history: ReferenceHistoryEntry[];
};

/** One office type with everything the detail panel shows. */
export type OfficeTypeDetail = Record<string, unknown> & {
  reference: string;
  officeCount: number;
  history: ReferenceHistoryEntry[];
};

/** One payment method with everything the detail panel shows. */
export type PaymentMethodDetail = Record<string, unknown> & {
  reference: string;
  paymentCount: number;
  history: ReferenceHistoryEntry[];
};

/** One payment type with everything the detail panel shows. */
export type PaymentTypeDetail = Record<string, unknown> & {
  reference: string;
  paymentCount: number;
  history: ReferenceHistoryEntry[];
};

/**
 * How many trail entries a detail read returns. Reference data is written
 * rarely, so this is a guard against a pathological row rather than a page
 * size anyone will hit.
 */
const REFERENCE_HISTORY_LIMIT = 100;

@Injectable()
export class UtilService {
  private readonly logger = new Logger(UtilService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    private readonly codeService: CodeGeneratorService,
    private readonly historyLabelService: HistoryLabelService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(UserType.name) private readonly userTypeModel: Model<UserType>,

    @InjectModel(OfficeType.name)
    private readonly officeTypeModel: Model<OfficeType>,

    @InjectModel(PickupStatus.name)
    private readonly pickupStatusModel: Model<PickupStatus>,

    @InjectModel(PickupRequest.name)
    private readonly pickupRequestModel: Model<PickupRequest>,

    @InjectModel(OrderStatus.name)
    private readonly orderStatusModel: Model<OrderStatus>,

    @InjectModel(PaymentMethod.name)
    private readonly paymentMethodModel: Model<PaymentMethod>,

    @InjectModel(PaymentType.name)
    private readonly paymentTypeModel: Model<PaymentType>,
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
   * The filters behind the user-type list and its KPIs, built once so the two
   * can never disagree.
   *
   * `status` comes back on its own rather than merged into `base`: the KPI
   * status breakdown counts both statuses over everything else, so it needs
   * the filter without it.
   */
  private buildUserTypeFilter(query: Omit<FindUserTypeDto, 'page' | 'size'>) {
    const base: Record<string, unknown> = {};

    if (query.q) {
      const rx = new RegExp(this.appUtilService.escapeRegex(query.q), 'i');
      base.$or = [{ reference: rx }, { userTypeName: rx }];
    }

    const status =
      typeof query.isActive === 'boolean'
        ? { isActive: query.isActive }
        : undefined;

    return { base, status };
  }

  /**
   * Reads one user type by its reference, or says it does not exist.
   *
   * Every single-row read and write goes through here, so the 24-character
   * mongo id never has to leave the API.
   */
  private async resolveUserType(reference: string) {
    const code = reference.trim().toUpperCase();
    const userType = await this.userTypeModel.findOne({ reference: code });

    if (!userType) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User type not found',
      });
    }

    return userType;
  }

  async findAllUserType({ page, size, ...query }: FindUserTypeDto) {
    this.can('READ', 'UserType');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { base, status } = this.buildUserTypeFilter(query);
    const where: Record<string, unknown> = { ...base, ...status };

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const totalUserTypes = await this.userTypeModel.countDocuments(where);
    const userTypes = await this.userTypeModel
      .find(where)
      .sort(sort)
      .skip(skip)
      .limit(size)
      .lean();

    const totalPages = Math.ceil(totalUserTypes / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(
      `[${platform}] ${phone} has successfully retrieve all user types`,
    );

    return { total: totalUserTypes, data: userTypes, nextPage };
  }

  /**
   * Headline user-type counts, over the list filters.
   *
   * `total` respects every filter, `isActive` included. The three status
   * figures come from `byStatus`, which drops `isActive` so the status tab
   * strip keeps its counts whichever tab is selected — which is why `total`
   * and `byStatus.all` differ only when the caller asked for one status.
   */
  async getUserTypeKpis(
    query: Omit<FindUserTypeDto, 'page' | 'size'>,
  ): Promise<ReferenceKpis> {
    this.can('READ', 'UserType');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { base, status } = this.buildUserTypeFilter(query);

    const [total, byStatus] = await Promise.all([
      this.userTypeModel.countDocuments({ ...base, ...status }),
      this.userTypeModel.aggregate<{ _id: boolean; n: number }>([
        { $match: base },
        { $group: { _id: '$isActive', n: { $sum: 1 } } },
      ]),
    ]);

    const statusRow = (isActive: boolean) =>
      byStatus.find((row) => row._id === isActive)?.n ?? 0;
    const active = statusRow(true);
    const inactive = statusRow(false);

    this.logger.log(`[${platform}] ${phone} has retrieved user type kpis`);

    return {
      total,
      totalActive: active,
      totalInactive: inactive,
      byStatus: { all: active + inactive, active, inactive },
    };
  }

  /**
   * One user type by its reference: the row itself, how many users hold it,
   * and its audit trail.
   *
   * The trail is what a reference row is really read for — "who deactivated
   * this, and why" — so the entries carry the staff member behind each change
   * resolved from `changedBy`, and the changed fields flattened into a list a
   * timeline can render. The stored `snapshot` is never returned.
   */
  async findUserTypeByReference(reference: string): Promise<UserTypeDetail> {
    this.can('READ', 'UserType');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;
    const code = reference.trim().toUpperCase();

    const [userType] = await this.userTypeModel.aggregate<UserTypeDetail>([
      { $match: { reference: code } },
      { $limit: 1 },

      // How many people currently hold this type. A count, not the users
      // themselves: the detail panel needs the figure to warn before a
      // deactivation, not a list it would have to paginate.
      {
        $lookup: {
          as: 'users',
          from: 'user',
          localField: '_id',
          foreignField: 'userTypeId',
          pipeline: [{ $count: 'n' }],
        },
      },
      {
        $addFields: {
          userCount: { $ifNull: [{ $first: '$users.n' }, 0] },
        },
      },

      // The audit trail: what changed, by whom, newest first. `changedFields`
      // is an object keyed by field name, so it is turned into a flat array a
      // timeline can render directly. `snapshot` is never projected.
      {
        $lookup: {
          as: 'history',
          from: userTypeHistorySchemaName,
          localField: '_id',
          foreignField: 'userTypeId',
          pipeline: [
            { $sort: { createdAt: -1 } },
            { $limit: REFERENCE_HISTORY_LIMIT },
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

      { $project: { users: 0 } },
    ]);

    if (!userType) {
      this.logger.error(`${base} unknown user type reference ${code}`);
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User type not found',
      });
    }

    // A foreign key in the trail reads as a raw id without this. User types
    // carry none today, but the trail is labelled all the same: the day one
    // is added it is readable with no change here.
    await this.historyLabelService.labelChanges(
      UserType.name,
      userType.history,
    );

    this.logger.log(`${base} has successfully retrieved user type ${code}`);
    return userType;
  }

  /**
   * Adds a user type. The name is stored upper-case (the DTO does that), so a
   * second "Admin" beside the seeded "ADMIN" is a conflict, not a new row.
   */
  async createUserType(data: CreateUserTypeDto) {
    this.can('CREATE', 'UserType');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const actorId = new Types.ObjectId(this.req.user.userId);

    const taken = await this.userTypeModel.exists({
      userTypeName: data.userTypeName,
    });
    if (taken) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A user type with this name already exists',
      });
    }

    const reference = await this.codeService.generateUserTypeReference();
    const userType = new this.userTypeModel({
      reference,
      description: data.description,
      userTypeName: data.userTypeName,
    });

    // Audit fields go on `$locals` before the save: that is the only thing
    // the history hook can read on a create, since a save carries no query
    // options for the reason to travel in.
    applyAuditLocals(userType, this.req, actorId);
    await userType.save();

    this.logger.log(`[${platform}] ${phone} created user type ${reference}`);
    return userType;
  }

  /**
   * Rewords a user type or switches it on and off.
   *
   * The name is not editable and the DTO does not carry it — `auth.service`
   * puts it into the JWT as the `userType` claim and compares it against
   * `UserTypeEum.CUSTOMER`, and `user.service`, `pickup.service` and
   * `customer.service` all match the seeded rows by that exact string, so a
   * rename would strip a signed-in user of their permissions with no sign of
   * why.
   *
   * Deactivating is not a delete: the row stays, the users holding it keep
   * holding it, and it simply stops being offered by the pickers. There is no
   * delete on purpose — removing a type that users still point at would leave
   * them pointing at nothing.
   *
   * Written with `findOneAndUpdate` and an audit context, which is the only
   * path that diffs the previous row against the update — a `save()` here
   * would leave a history entry saying a change happened but not what.
   */
  async updateUserType(reference: string, data: UpdateUserTypeDto) {
    this.can('UPDATE', 'UserType');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const actorId = new Types.ObjectId(this.req.user.userId);
    const userType = await this.resolveUserType(reference);

    const updated = await this.userTypeModel.findOneAndUpdate(
      { _id: userType._id },
      { ...data },
      {
        context: auditContext(this.req, actorId),
        returnDocument: 'after',
      } as never,
    );

    this.logger.log(
      `[${platform}] ${phone} updated user type ${userType.reference}`,
    );
    return updated;
  }

  /**
   * The filters behind the pickup-status list and its KPIs, built once so the
   * two can never disagree.
   *
   * `status` comes back on its own rather than merged into `base`: the KPI
   * status breakdown counts both statuses over everything else, so it needs
   * the filter without it.
   */
  private buildPickupStatusFilter(
    query: Omit<FindPickupStatusDto, 'page' | 'size'>,
  ) {
    const base: Record<string, unknown> = {};

    if (query.q) {
      const rx = new RegExp(this.appUtilService.escapeRegex(query.q), 'i');
      base.$or = [{ reference: rx }, { pickupStatusName: rx }];
    }

    const status =
      typeof query.isActive === 'boolean'
        ? { isActive: query.isActive }
        : undefined;

    return { base, status };
  }

  /** Reads one pickup status by its reference, or says it does not exist. */
  private async resolvePickupStatus(reference: string) {
    const code = reference.trim().toUpperCase();
    const status = await this.pickupStatusModel.findOne({ reference: code });

    if (!status) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Pickup status not found',
      });
    }

    return status;
  }

  /**
   * The pickup statuses.
   *
   * Gated on `READ PickupRequest`, not `READ PickupStatus`, and deliberately
   * so: this is the lookup behind every pickup status picker, which a driver
   * and an office manager both need. The reference screen's own endpoints
   * below are the ones gated on the narrower subject.
   */
  async findAllPickupStatuses({ page, size, ...query }: FindPickupStatusDto) {
    this.can('READ', 'PickupRequest');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const { base, status } = this.buildPickupStatusFilter(query);
    const where: Record<string, unknown> = { ...base, ...status };

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const totalPickupStatus =
      await this.pickupStatusModel.countDocuments(where);
    const pickupStatuses = await this.pickupStatusModel
      .find(where)
      .sort(sort)
      .skip(skip)
      .limit(size)
      .lean();

    const totalPages = Math.ceil(totalPickupStatus / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all pickup statuses`);
    return { total: totalPickupStatus, data: pickupStatuses, nextPage };
  }

  /**
   * Headline pickup-status counts, over the list filters.
   *
   * `total` respects every filter, `isActive` included. The three status
   * figures come from `byStatus`, which drops `isActive` so the status tab
   * strip keeps its counts whichever tab is selected — which is why `total`
   * and `byStatus.all` differ only when the caller asked for one status.
   */
  async getPickupStatusKpis(
    query: Omit<FindPickupStatusDto, 'page' | 'size'>,
  ): Promise<ReferenceKpis> {
    this.can('READ', 'PickupStatus');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { base, status } = this.buildPickupStatusFilter(query);

    const [total, byStatus] = await Promise.all([
      this.pickupStatusModel.countDocuments({ ...base, ...status }),
      this.pickupStatusModel.aggregate<{ _id: boolean; n: number }>([
        { $match: base },
        { $group: { _id: '$isActive', n: { $sum: 1 } } },
      ]),
    ]);

    const statusRow = (isActive: boolean) =>
      byStatus.find((row) => row._id === isActive)?.n ?? 0;
    const active = statusRow(true);
    const inactive = statusRow(false);

    this.logger.log(`[${platform}] ${phone} has retrieved pickup status kpis`);

    return {
      total,
      totalActive: active,
      totalInactive: inactive,
      byStatus: { all: active + inactive, active, inactive },
    };
  }

  /**
   * One pickup status by its reference: the row itself, how many pickup
   * requests currently sit at it, and its audit trail.
   *
   * The count is the reason anyone opens this before switching a status off —
   * taking a status out of the pickers while forty collections are parked on
   * it is a different act from retiring one nothing uses.
   */
  async findPickupStatusByReference(
    reference: string,
  ): Promise<PickupStatusDetail> {
    this.can('READ', 'PickupStatus');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;
    const code = reference.trim().toUpperCase();

    const [status] = await this.pickupStatusModel.aggregate<PickupStatusDetail>(
      [
        { $match: { reference: code } },
        { $limit: 1 },

        // How many collections are parked on this status. A count, not the
        // requests themselves: the detail panel needs the figure to warn
        // before a deactivation, not a list it would have to paginate.
        {
          $lookup: {
            as: 'pickups',
            from: 'pickup_request',
            localField: '_id',
            foreignField: 'pickupStatusId',
            pipeline: [{ $count: 'n' }],
          },
        },
        {
          $addFields: {
            pickupCount: { $ifNull: [{ $first: '$pickups.n' }, 0] },
          },
        },

        // The audit trail: what changed, by whom, newest first.
        // `changedFields` is an object keyed by field name, so it is turned
        // into a flat array a timeline can render directly. `snapshot` is
        // never projected.
        {
          $lookup: {
            as: 'history',
            from: pickupStatusHistorySchemaName,
            localField: '_id',
            foreignField: 'pickupStatusId',
            pipeline: [
              { $sort: { createdAt: -1 } },
              { $limit: REFERENCE_HISTORY_LIMIT },
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

        { $project: { pickups: 0 } },
      ],
    );

    if (!status) {
      this.logger.error(`${base} unknown pickup status reference ${code}`);
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Pickup status not found',
      });
    }

    // A foreign key in the trail reads as a raw id without this. Pickup
    // statuses carry none today, but the trail is labelled all the same: the
    // day one is added it is readable with no change here.
    await this.historyLabelService.labelChanges(
      PickupStatus.name,
      status.history,
    );

    this.logger.log(`${base} has successfully retrieved pickup status ${code}`);
    return status;
  }

  /**
   * Adds a pickup status.
   *
   * The name is stored upper-case, so a second "Pending" beside the seeded
   * "PENDING" is a conflict rather than a new row.
   *
   * A status added here is inert until something assigns it: the pickup and
   * order services only ever look up the five names in `PickupStatusEnum`, so
   * a new row shows in the pickers and nowhere else.
   */
  async createPickupStatus(data: CreatePickupStatusDto) {
    this.can('CREATE', 'PickupStatus');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const actorId = new Types.ObjectId(this.req.user.userId);

    const taken = await this.pickupStatusModel.exists({
      pickupStatusName: data.pickupStatusName,
    });
    if (taken) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A pickup status with this name already exists',
      });
    }

    const reference = await this.codeService.generatePickupStatusReference();
    const status = new this.pickupStatusModel({
      reference,
      description: data.description,
      pickupStatusName: data.pickupStatusName,
    });

    // Audit fields go on `$locals` before the save: that is the only thing
    // the history hook can read on a create, since a save carries no query
    // options for the reason to travel in.
    applyAuditLocals(status, this.req, actorId);
    await status.save();

    this.logger.log(
      `[${platform}] ${phone} created pickup status ${reference}`,
    );
    return status;
  }

  /**
   * Rewords a pickup status or switches it on and off.
   *
   * The name is not editable and the DTO does not carry it — `pickup.service`
   * and `order.service` match the seeded rows by that exact string, so a
   * rename would break creating a pickup with no sign of why. There is no
   * delete either: a status that live collections are parked on cannot be
   * removed without orphaning them.
   *
   * Written with `findOneAndUpdate` and an audit context, which is the only
   * path that diffs the previous row against the update — a `save()` here
   * would leave a history entry saying a change happened but not what.
   */
  async updatePickupStatus(reference: string, data: UpdatePickupStatusDto) {
    this.can('UPDATE', 'PickupStatus');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const actorId = new Types.ObjectId(this.req.user.userId);
    const status = await this.resolvePickupStatus(reference);

    const updated = await this.pickupStatusModel.findOneAndUpdate(
      { _id: status._id },
      { ...data },
      {
        context: auditContext(this.req, actorId),
        returnDocument: 'after',
      } as never,
    );

    this.logger.log(
      `[${platform}] ${phone} updated pickup status ${status.reference}`,
    );
    return updated;
  }

  /**
   * The filters behind the office-type list and its KPIs, built once so the
   * two can never disagree.
   *
   * `status` comes back on its own rather than merged into `base`: the KPI
   * status breakdown counts both statuses over everything else, so it needs
   * the filter without it.
   */
  private buildOfficeTypeFilter(
    query: Omit<FindOfficeTypeDto, 'page' | 'size'>,
  ) {
    const base: Record<string, unknown> = {};

    if (query.q) {
      const rx = new RegExp(this.appUtilService.escapeRegex(query.q), 'i');
      base.$or = [{ reference: rx }, { officeTypeName: rx }];
    }

    const status =
      typeof query.isActive === 'boolean'
        ? { isActive: query.isActive }
        : undefined;

    return { base, status };
  }

  /** Reads one office type by its reference, or says it does not exist. */
  private async resolveOfficeType(reference: string) {
    const code = reference.trim().toUpperCase();
    const officeType = await this.officeTypeModel.findOne({ reference: code });

    if (!officeType) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Office type not found',
      });
    }

    return officeType;
  }

  /**
   * The office types (FACTORY, OFFICE). A lookup rather than an enum on the
   * wire: `POST /offices` takes `officeTypeId`, so a form has to be able to
   * turn the name it shows into the id the API stores. The same endpoint is
   * the reference screen's table, which is why it takes `q` and `isActive`.
   */
  async findAllOfficeTypes({ page, size, ...query }: FindOfficeTypeDto) {
    this.can('READ', 'OfficeType');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const { base, status } = this.buildOfficeTypeFilter(query);
    const where: Record<string, unknown> = { ...base, ...status };

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const totalOfficeTypes = await this.officeTypeModel.countDocuments(where);
    const officeTypes = await this.officeTypeModel
      .find(where)
      .sort(sort)
      .skip(skip)
      .limit(size)
      .lean();

    const totalPages = Math.ceil(totalOfficeTypes / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all office types`);
    return { total: totalOfficeTypes, data: officeTypes, nextPage };
  }

  /**
   * Headline office-type counts, over the list filters.
   *
   * `total` respects every filter, `isActive` included. The three status
   * figures come from `byStatus`, which drops `isActive` so the status tab
   * strip keeps its counts whichever tab is selected — which is why `total`
   * and `byStatus.all` differ only when the caller asked for one status.
   */
  async getOfficeTypeKpis(
    query: Omit<FindOfficeTypeDto, 'page' | 'size'>,
  ): Promise<ReferenceKpis> {
    this.can('READ', 'OfficeType');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { base, status } = this.buildOfficeTypeFilter(query);

    const [total, byStatus] = await Promise.all([
      this.officeTypeModel.countDocuments({ ...base, ...status }),
      this.officeTypeModel.aggregate<{ _id: boolean; n: number }>([
        { $match: base },
        { $group: { _id: '$isActive', n: { $sum: 1 } } },
      ]),
    ]);

    const statusRow = (isActive: boolean) =>
      byStatus.find((row) => row._id === isActive)?.n ?? 0;
    const active = statusRow(true);
    const inactive = statusRow(false);

    this.logger.log(`[${platform}] ${phone} has retrieved office type kpis`);

    return {
      total,
      totalActive: active,
      totalInactive: inactive,
      byStatus: { all: active + inactive, active, inactive },
    };
  }

  /**
   * One office type by its reference: the row itself, how many offices are of
   * that type, and its audit trail.
   *
   * The count is the reason anyone opens this before renaming or switching a
   * type off — FACTORY is not a label nobody depends on.
   */
  async findOfficeTypeByReference(
    reference: string,
  ): Promise<OfficeTypeDetail> {
    this.can('READ', 'OfficeType');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;
    const code = reference.trim().toUpperCase();

    const [officeType] = await this.officeTypeModel.aggregate<OfficeTypeDetail>(
      [
        { $match: { reference: code } },
        { $limit: 1 },

        // How many branches are of this type. A count, not the offices
        // themselves: the detail panel needs the figure to warn before a
        // rename or a deactivation, not a list it would have to paginate.
        {
          $lookup: {
            as: 'offices',
            from: officeSchemaName,
            localField: '_id',
            foreignField: 'officeTypeId',
            pipeline: [{ $count: 'n' }],
          },
        },
        {
          $addFields: {
            officeCount: { $ifNull: [{ $first: '$offices.n' }, 0] },
          },
        },

        // The audit trail: what changed, by whom, newest first.
        // `changedFields` is an object keyed by field name, so it is turned
        // into a flat array a timeline can render directly. `snapshot` is
        // never projected.
        {
          $lookup: {
            as: 'history',
            from: officeTypeHistorySchemaName,
            localField: '_id',
            foreignField: 'officeTypeId',
            pipeline: [
              { $sort: { createdAt: -1 } },
              { $limit: REFERENCE_HISTORY_LIMIT },
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

        { $project: { offices: 0 } },
      ],
    );

    if (!officeType) {
      this.logger.error(`${base} unknown office type reference ${code}`);
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Office type not found',
      });
    }

    // A foreign key in the trail reads as a raw id without this. Office types
    // carry none today, but the trail is labelled all the same: the day one is
    // added it is readable with no change here.
    await this.historyLabelService.labelChanges(
      OfficeType.name,
      officeType.history,
    );

    this.logger.log(`${base} has successfully retrieved office type ${code}`);
    return officeType;
  }

  /**
   * Adds an office type.
   *
   * The name is stored upper-case, so a second "Factory" beside the seeded
   * "FACTORY" is a conflict rather than a new row.
   *
   * A type added here is immediately usable: `POST /offices` takes whatever
   * `officeTypeId` it is given, so a branch can be opened against it at once.
   * That is the difference from the status collections, where a new row shows
   * in the pickers and nowhere else.
   */
  async createOfficeType(data: CreateOfficeTypeDto) {
    this.can('CREATE', 'OfficeType');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const actorId = new Types.ObjectId(this.req.user.userId);

    const taken = await this.officeTypeModel.exists({
      officeTypeName: data.officeTypeName,
    });
    if (taken) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'An office type with this name already exists',
      });
    }

    const reference = await this.codeService.generateOfficeTypeReference();
    const officeType = new this.officeTypeModel({
      reference,
      description: data.description,
      officeTypeName: data.officeTypeName,
    });

    // Audit fields go on `$locals` before the save: that is the only thing
    // the history hook can read on a create, since a save carries no query
    // options for the reason to travel in.
    applyAuditLocals(officeType, this.req, actorId);
    await officeType.save();

    this.logger.log(`[${platform}] ${phone} created office type ${reference}`);
    return officeType;
  }

  /**
   * Rewords an office type or switches it on and off.
   *
   * The name is not editable and the DTO does not carry it — two places match
   * the seeded rows by that literal: `api-client.guard.ts` picks a default
   * office by finding FACTORY by name (and dereferences the result with a
   * non-null assertion, so a rename becomes a runtime TypeError), and
   * `office.service.ts` resolves the office list's `officeTypeName` filter the
   * same way.
   *
   * There is no delete either: a type offices still point at is switched off,
   * never removed.
   *
   * Written with `findOneAndUpdate` and an audit context, which is the only
   * path that diffs the previous row against the update — a `save()` here
   * would leave a history entry saying a change happened but not what.
   */
  async updateOfficeType(reference: string, data: UpdateOfficeTypeDto) {
    this.can('UPDATE', 'OfficeType');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const actorId = new Types.ObjectId(this.req.user.userId);
    const officeType = await this.resolveOfficeType(reference);

    const updated = await this.officeTypeModel.findOneAndUpdate(
      { _id: officeType._id },
      { ...data },
      {
        context: auditContext(this.req, actorId),
        returnDocument: 'after',
      } as never,
    );

    this.logger.log(
      `[${platform}] ${phone} updated office type ${officeType.reference}`,
    );
    return updated;
  }

  /**
   * The roles a staff member can hold. Read-only: roles are seeded, and the
   * office staff picker only needs their names and ids.
   */
  async findAllRoles({ page, size, ...query }: PaginationDto) {
    this.can('READ', 'Role');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const totalRoles = await this.roleModel.countDocuments();
    const roles = await this.roleModel
      .find()
      .sort(sort)
      .skip(skip)
      .limit(size)
      .lean();

    const totalPages = Math.ceil(totalRoles / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all roles`);
    return { total: totalRoles, data: roles, nextPage };
  }

  /**
   * The filters behind the order-status list and its KPIs, built once so the
   * two can never disagree.
   *
   * `status` comes back on its own rather than merged into `base`: the KPI
   * status breakdown counts both statuses over everything else, so it needs
   * the filter without it.
   */
  private buildOrderStatusFilter(
    query: Omit<FindOrderStatusDto, 'page' | 'size'>,
  ) {
    const base: Record<string, unknown> = {};

    if (query.q) {
      const rx = new RegExp(this.appUtilService.escapeRegex(query.q), 'i');
      base.$or = [{ reference: rx }, { orderStatusName: rx }];
    }

    const status =
      typeof query.isActive === 'boolean'
        ? { isActive: query.isActive }
        : undefined;

    return { base, status };
  }

  /** Reads one order status by its reference, or says it does not exist. */
  private async resolveOrderStatus(reference: string) {
    const code = reference.trim().toUpperCase();
    const status = await this.orderStatusModel.findOne({ reference: code });

    if (!status) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Order status not found',
      });
    }

    return status;
  }

  /**
   * The order statuses.
   *
   * Gated on `READ OrderStatus`, which every role that may touch an order
   * already holds: this doubles as the lookup behind every order status
   * picker and as the reference screen's table.
   */
  async findAllOrderStatuses({ page, size, ...query }: FindOrderStatusDto) {
    this.can('READ', 'OrderStatus');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const { base, status } = this.buildOrderStatusFilter(query);
    const where: Record<string, unknown> = { ...base, ...status };

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const totalOrderStatuses =
      await this.orderStatusModel.countDocuments(where);
    const orderStatuses = await this.orderStatusModel
      .find(where)
      .sort(sort)
      .skip(skip)
      .limit(size)
      .lean();

    const totalPages = Math.ceil(totalOrderStatuses / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all order statuses`);
    return { total: totalOrderStatuses, data: orderStatuses, nextPage };
  }

  /**
   * Headline order-status counts, over the list filters.
   *
   * `total` respects every filter, `isActive` included. The three status
   * figures come from `byStatus`, which drops `isActive` so the status tab
   * strip keeps its counts whichever tab is selected — which is why `total`
   * and `byStatus.all` differ only when the caller asked for one status.
   */
  async getOrderStatusKpis(
    query: Omit<FindOrderStatusDto, 'page' | 'size'>,
  ): Promise<ReferenceKpis> {
    this.can('READ', 'OrderStatus');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { base, status } = this.buildOrderStatusFilter(query);

    const [total, byStatus] = await Promise.all([
      this.orderStatusModel.countDocuments({ ...base, ...status }),
      this.orderStatusModel.aggregate<{ _id: boolean; n: number }>([
        { $match: base },
        { $group: { _id: '$isActive', n: { $sum: 1 } } },
      ]),
    ]);

    const statusRow = (isActive: boolean) =>
      byStatus.find((row) => row._id === isActive)?.n ?? 0;
    const active = statusRow(true);
    const inactive = statusRow(false);

    this.logger.log(`[${platform}] ${phone} has retrieved order status kpis`);

    return {
      total,
      totalActive: active,
      totalInactive: inactive,
      byStatus: { all: active + inactive, active, inactive },
    };
  }

  /**
   * One order status by its reference: the row itself, how many orders
   * currently sit at it, and its audit trail.
   *
   * The count is the reason anyone opens this before switching a status off —
   * taking a status out of the pickers while two hundred orders are parked on
   * it is a different act from retiring one nothing uses.
   */
  async findOrderStatusByReference(
    reference: string,
  ): Promise<OrderStatusDetail> {
    this.can('READ', 'OrderStatus');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;
    const code = reference.trim().toUpperCase();

    const [status] = await this.orderStatusModel.aggregate<OrderStatusDetail>([
      { $match: { reference: code } },
      { $limit: 1 },

      // How many orders are parked on this status. A count, not the orders
      // themselves: the detail panel needs the figure to warn before a
      // deactivation, not a list it would have to paginate.
      {
        $lookup: {
          as: 'orders',
          from: orderSchemaName,
          localField: '_id',
          foreignField: 'orderStatusId',
          pipeline: [{ $count: 'n' }],
        },
      },
      {
        $addFields: {
          orderCount: { $ifNull: [{ $first: '$orders.n' }, 0] },
        },
      },

      // The audit trail: what changed, by whom, newest first.
      // `changedFields` is an object keyed by field name, so it is turned
      // into a flat array a timeline can render directly. `snapshot` is
      // never projected.
      {
        $lookup: {
          as: 'history',
          from: orderStatusHistorySchemaName,
          localField: '_id',
          foreignField: 'orderStatusId',
          pipeline: [
            { $sort: { createdAt: -1 } },
            { $limit: REFERENCE_HISTORY_LIMIT },
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

      { $project: { orders: 0 } },
    ]);

    if (!status) {
      this.logger.error(`${base} unknown order status reference ${code}`);
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Order status not found',
      });
    }

    // A foreign key in the trail reads as a raw id without this. Order
    // statuses carry none today, but the trail is labelled all the same: the
    // day one is added it is readable with no change here.
    await this.historyLabelService.labelChanges(
      OrderStatus.name,
      status.history,
    );

    this.logger.log(`${base} has successfully retrieved order status ${code}`);
    return status;
  }

  /**
   * Adds an order status.
   *
   * The name is stored upper-case, so a second "Washing" beside the seeded
   * "WASHING" is a conflict rather than a new row.
   *
   * A status added here is inert until something assigns it: `order.service`
   * only ever moves an order between the names in `OrderStatusEnum`, and the
   * allowed transitions are computed from that enum, so a new row shows in the
   * pickers and nowhere else.
   */
  async createOrderStatus(data: CreateOrderStatusDto) {
    this.can('CREATE', 'OrderStatus');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const actorId = new Types.ObjectId(this.req.user.userId);

    const taken = await this.orderStatusModel.exists({
      orderStatusName: data.orderStatusName,
    });
    if (taken) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'An order status with this name already exists',
      });
    }

    const reference = await this.codeService.generateOrderStatusReference();
    const status = new this.orderStatusModel({
      reference,
      description: data.description,
      orderStatusName: data.orderStatusName,
    });

    // Audit fields go on `$locals` before the save: that is the only thing
    // the history hook can read on a create, since a save carries no query
    // options for the reason to travel in.
    applyAuditLocals(status, this.req, actorId);
    await status.save();

    this.logger.log(`[${platform}] ${phone} created order status ${reference}`);
    return status;
  }

  /**
   * Rewords an order status or switches it on and off.
   *
   * The name is not editable and the DTO does not carry it — `order.service`
   * runs the state machine off that exact string, and four other services look
   * rows up by it, so a rename would break moving an order with no sign of
   * why. There is no delete either: a status that live orders are parked on
   * cannot be removed without orphaning them.
   *
   * Written with `findOneAndUpdate` and an audit context, which is the only
   * path that diffs the previous row against the update — a `save()` here
   * would leave a history entry saying a change happened but not what.
   */
  async updateOrderStatus(reference: string, data: UpdateOrderStatusDto) {
    this.can('UPDATE', 'OrderStatus');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const actorId = new Types.ObjectId(this.req.user.userId);
    const status = await this.resolveOrderStatus(reference);

    const updated = await this.orderStatusModel.findOneAndUpdate(
      { _id: status._id },
      { ...data },
      {
        context: auditContext(this.req, actorId),
        returnDocument: 'after',
      } as never,
    );

    this.logger.log(
      `[${platform}] ${phone} updated order status ${status.reference}`,
    );
    return updated;
  }

  /**
   * The filters behind the payment method list and its KPIs, built once so the
   * two can never disagree.
   *
   * `status` comes back on its own rather than merged into `base`: the KPI
   * status breakdown counts both statuses over everything else, so it needs
   * the filter without it.
   */
  private buildPaymentMethodFilter(
    query: Omit<FindPaymentMethodDto, 'page' | 'size'>,
  ) {
    const base: Record<string, unknown> = {};

    if (query.q) {
      const rx = new RegExp(this.appUtilService.escapeRegex(query.q), 'i');
      base.$or = [{ reference: rx }, { paymentMethodName: rx }];
    }

    const status =
      typeof query.isActive === 'boolean'
        ? { isActive: query.isActive }
        : undefined;

    return { base, status };
  }

  /** Reads one payment method by its reference, or says it does not exist. */
  private async resolvePaymentMethod(reference: string) {
    const code = reference.trim().toUpperCase();
    const row = await this.paymentMethodModel.findOne({ reference: code });

    if (!row) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Payment method not found',
      });
    }

    return row;
  }

  /**
   * The payment methods.
   *
   * Doubles as the picker lookup every payment form needs and as the
   * reference screen's own table, which is why it takes `q` and `isActive` on
   * top of the usual paging.
   */
  async findAllPaymentMethod({ page, size, ...query }: FindPaymentMethodDto) {
    this.can('READ', 'PaymentMethod');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const { base, status } = this.buildPaymentMethodFilter(query);
    const where: Record<string, unknown> = { ...base, ...status };

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const total = await this.paymentMethodModel.countDocuments(where);
    const data = await this.paymentMethodModel
      .find(where)
      .sort(sort)
      .skip(skip)
      .limit(size)
      .lean();

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all payment methods`);
    return { total, data, nextPage };
  }

  /**
   * Headline payment method counts, over the list filters.
   *
   * `total` respects every filter, `isActive` included. The three status
   * figures come from `byStatus`, which drops `isActive` so the status tab
   * strip keeps its counts whichever tab is selected — which is why `total`
   * and `byStatus.all` differ only when the caller asked for one status.
   */
  async getPaymentMethodKpis(
    query: Omit<FindPaymentMethodDto, 'page' | 'size'>,
  ): Promise<ReferenceKpis> {
    this.can('READ', 'PaymentMethod');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { base, status } = this.buildPaymentMethodFilter(query);

    const [total, byStatus] = await Promise.all([
      this.paymentMethodModel.countDocuments({ ...base, ...status }),
      this.paymentMethodModel.aggregate<{ _id: boolean; n: number }>([
        { $match: base },
        { $group: { _id: '$isActive', n: { $sum: 1 } } },
      ]),
    ]);

    const statusRow = (isActive: boolean) =>
      byStatus.find((row) => row._id === isActive)?.n ?? 0;
    const active = statusRow(true);
    const inactive = statusRow(false);

    this.logger.log(`[${platform}] ${phone} has retrieved payment method kpis`);

    return {
      total,
      totalActive: active,
      totalInactive: inactive,
      byStatus: { all: active + inactive, active, inactive },
    };
  }

  /**
   * One payment method by its reference: the row itself, how many payments were taken by it,
   * and its audit trail.
   *
   * The count is the reason anyone opens this before switching one off —
   * retiring something a year of takings is filed under is a different act
   * from retiring one nothing uses.
   */
  async findPaymentMethodByReference(
    reference: string,
  ): Promise<PaymentMethodDetail> {
    this.can('READ', 'PaymentMethod');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;
    const code = reference.trim().toUpperCase();

    const [row] = await this.paymentMethodModel.aggregate<PaymentMethodDetail>([
      { $match: { reference: code } },
      { $limit: 1 },

      // How many payments point at this row. A count, not the payments
      // themselves: the detail panel needs the figure to warn before a
      // deactivation, not a list it would have to paginate.
      {
        $lookup: {
          as: 'payments',
          from: paymentSchemaName,
          localField: '_id',
          foreignField: 'paymentMethodId',
          pipeline: [{ $count: 'n' }],
        },
      },
      {
        $addFields: {
          paymentCount: { $ifNull: [{ $first: '$payments.n' }, 0] },
        },
      },

      // The audit trail: what changed, by whom, newest first.
      // `changedFields` is an object keyed by field name, so it is turned
      // into a flat array a timeline can render directly. `snapshot` is
      // never projected.
      {
        $lookup: {
          as: 'history',
          from: paymentMethodHistorySchemaName,
          localField: '_id',
          foreignField: 'paymentMethodId',
          pipeline: [
            { $sort: { createdAt: -1 } },
            { $limit: REFERENCE_HISTORY_LIMIT },
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

      { $project: { payments: 0 } },
    ]);

    if (!row) {
      this.logger.error(`${base} unknown payment method reference ${code}`);
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Payment method not found',
      });
    }

    // A foreign key in the trail reads as a raw id without this. These rows
    // carry none today, but the trail is labelled all the same: the day one is
    // added it is readable with no change here.
    await this.historyLabelService.labelChanges(
      PaymentMethod.name,
      row.history,
    );

    this.logger.log(
      `${base} has successfully retrieved payment method ${code}`,
    );
    return row;
  }

  /**
   * Adds a payment method.
   *
   * The name is stored as typed, only trimmed — the seeded methods are
   * spelled `Cash`, `MTN Momo` and `Orange Money`, and upper-casing a new one
   * would leave the list reading two different ways. The clash check is
   * case-insensitive all the same, so "cash" beside "Cash" is a conflict.
   *
   * A row added here is inert until something files against it: the services
   * only ever match the seeded names, so a new one shows in the pickers and
   * nowhere else.
   */
  async createPaymentMethod(data: CreatePaymentMethodDto) {
    this.can('CREATE', 'PaymentMethod');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const actorId = new Types.ObjectId(this.req.user.userId);

    // Case-insensitive, anchored: the names are stored as typed (`MTN Momo`),
    // so a plain equality check would happily accept a second "mtn momo".
    const taken = await this.paymentMethodModel.exists({
      paymentMethodName: new RegExp(
        `^${this.appUtilService.escapeRegex(data.paymentMethodName)}$`,
        'i',
      ),
    });
    if (taken) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A payment method with this name already exists',
      });
    }

    const reference = await this.codeService.generatePaymentMethodReference();
    const row = new this.paymentMethodModel({
      reference,
      description: data.description,
      paymentMethodName: data.paymentMethodName,
    });

    // Audit fields go on `$locals` before the save: that is the only thing
    // the history hook can read on a create, since a save carries no query
    // options for the reason to travel in.
    applyAuditLocals(row, this.req, actorId);
    await row.save();

    this.logger.log(
      `[${platform}] ${phone} created payment method ${reference}`,
    );
    return row;
  }

  /**
   * Rewords a payment method or switches it on and off.
   *
   * The name is not editable and the DTO does not carry it — `payment.service` resolves the payment list's
   * `paymentMethod` filter with an exact `findOne` on that string, so a rename
   * would leave the filter matching nothing.
   * There is no delete either: a row live payments point at cannot be removed
   * without orphaning them.
   *
   * Written with `findOneAndUpdate` and an audit context, which is the only
   * path that diffs the previous row against the update — a `save()` here
   * would leave a history entry saying a change happened but not what.
   */
  async updatePaymentMethod(reference: string, data: UpdatePaymentMethodDto) {
    this.can('UPDATE', 'PaymentMethod');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const actorId = new Types.ObjectId(this.req.user.userId);
    const row = await this.resolvePaymentMethod(reference);

    const updated = await this.paymentMethodModel.findOneAndUpdate(
      { _id: row._id },
      { ...data },
      {
        context: auditContext(this.req, actorId),
        returnDocument: 'after',
      } as never,
    );

    this.logger.log(
      `[${platform}] ${phone} updated payment method ${row.reference}`,
    );
    return updated;
  }

  /**
   * The filters behind the payment type list and its KPIs, built once so the
   * two can never disagree.
   *
   * `status` comes back on its own rather than merged into `base`: the KPI
   * status breakdown counts both statuses over everything else, so it needs
   * the filter without it.
   */
  private buildPaymentTypeFilter(
    query: Omit<FindPaymentTypeDto, 'page' | 'size'>,
  ) {
    const base: Record<string, unknown> = {};

    if (query.q) {
      const rx = new RegExp(this.appUtilService.escapeRegex(query.q), 'i');
      base.$or = [{ reference: rx }, { paymentTypeName: rx }];
    }

    const status =
      typeof query.isActive === 'boolean'
        ? { isActive: query.isActive }
        : undefined;

    return { base, status };
  }

  /** Reads one payment type by its reference, or says it does not exist. */
  private async resolvePaymentType(reference: string) {
    const code = reference.trim().toUpperCase();
    const row = await this.paymentTypeModel.findOne({ reference: code });

    if (!row) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Payment type not found',
      });
    }

    return row;
  }

  /**
   * The payment types.
   *
   * Doubles as the picker lookup every payment form needs and as the
   * reference screen's own table, which is why it takes `q` and `isActive` on
   * top of the usual paging.
   */
  async findAllPaymentTypes({ page, size, ...query }: FindPaymentTypeDto) {
    this.can('READ', 'PaymentType');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const { base, status } = this.buildPaymentTypeFilter(query);
    const where: Record<string, unknown> = { ...base, ...status };

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const total = await this.paymentTypeModel.countDocuments(where);
    const data = await this.paymentTypeModel
      .find(where)
      .sort(sort)
      .skip(skip)
      .limit(size)
      .lean();

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all payment types`);
    return { total, data, nextPage };
  }

  /**
   * Headline payment type counts, over the list filters.
   *
   * `total` respects every filter, `isActive` included. The three status
   * figures come from `byStatus`, which drops `isActive` so the status tab
   * strip keeps its counts whichever tab is selected — which is why `total`
   * and `byStatus.all` differ only when the caller asked for one status.
   */
  async getPaymentTypeKpis(
    query: Omit<FindPaymentTypeDto, 'page' | 'size'>,
  ): Promise<ReferenceKpis> {
    this.can('READ', 'PaymentType');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const { base, status } = this.buildPaymentTypeFilter(query);

    const [total, byStatus] = await Promise.all([
      this.paymentTypeModel.countDocuments({ ...base, ...status }),
      this.paymentTypeModel.aggregate<{ _id: boolean; n: number }>([
        { $match: base },
        { $group: { _id: '$isActive', n: { $sum: 1 } } },
      ]),
    ]);

    const statusRow = (isActive: boolean) =>
      byStatus.find((row) => row._id === isActive)?.n ?? 0;
    const active = statusRow(true);
    const inactive = statusRow(false);

    this.logger.log(`[${platform}] ${phone} has retrieved payment type kpis`);

    return {
      total,
      totalActive: active,
      totalInactive: inactive,
      byStatus: { all: active + inactive, active, inactive },
    };
  }

  /**
   * One payment type by its reference: the row itself, how many payments are filed under it,
   * and its audit trail.
   *
   * The count is the reason anyone opens this before switching one off —
   * retiring something a year of takings is filed under is a different act
   * from retiring one nothing uses.
   */
  async findPaymentTypeByReference(
    reference: string,
  ): Promise<PaymentTypeDetail> {
    this.can('READ', 'PaymentType');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;
    const code = reference.trim().toUpperCase();

    const [row] = await this.paymentTypeModel.aggregate<PaymentTypeDetail>([
      { $match: { reference: code } },
      { $limit: 1 },

      // How many payments point at this row. A count, not the payments
      // themselves: the detail panel needs the figure to warn before a
      // deactivation, not a list it would have to paginate.
      {
        $lookup: {
          as: 'payments',
          from: paymentSchemaName,
          localField: '_id',
          foreignField: 'paymentTypeId',
          pipeline: [{ $count: 'n' }],
        },
      },
      {
        $addFields: {
          paymentCount: { $ifNull: [{ $first: '$payments.n' }, 0] },
        },
      },

      // The audit trail: what changed, by whom, newest first.
      // `changedFields` is an object keyed by field name, so it is turned
      // into a flat array a timeline can render directly. `snapshot` is
      // never projected.
      {
        $lookup: {
          as: 'history',
          from: paymentTypeHistorySchemaName,
          localField: '_id',
          foreignField: 'paymentTypeId',
          pipeline: [
            { $sort: { createdAt: -1 } },
            { $limit: REFERENCE_HISTORY_LIMIT },
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

      { $project: { payments: 0 } },
    ]);

    if (!row) {
      this.logger.error(`${base} unknown payment type reference ${code}`);
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Payment type not found',
      });
    }

    // A foreign key in the trail reads as a raw id without this. These rows
    // carry none today, but the trail is labelled all the same: the day one is
    // added it is readable with no change here.
    await this.historyLabelService.labelChanges(PaymentType.name, row.history);

    this.logger.log(`${base} has successfully retrieved payment type ${code}`);
    return row;
  }

  /**
   * Adds a payment type.
   *
   * The name is stored upper-case, so a second "Refund" beside the seeded
   * "REFUND" is a conflict rather than a new row.
   *
   * A row added here is inert until something files against it: the services
   * only ever match the seeded names, so a new one shows in the pickers and
   * nowhere else.
   */
  async createPaymentType(data: CreatePaymentTypeDto) {
    this.can('CREATE', 'PaymentType');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const actorId = new Types.ObjectId(this.req.user.userId);

    const taken = await this.paymentTypeModel.exists({
      paymentTypeName: data.paymentTypeName,
    });
    if (taken) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A payment type with this name already exists',
      });
    }

    const reference = await this.codeService.generatePaymentTypeReference();
    const row = new this.paymentTypeModel({
      reference,
      description: data.description,
      paymentTypeName: data.paymentTypeName,
    });

    // Audit fields go on `$locals` before the save: that is the only thing
    // the history hook can read on a create, since a save carries no query
    // options for the reason to travel in.
    applyAuditLocals(row, this.req, actorId);
    await row.save();

    this.logger.log(`[${platform}] ${phone} created payment type ${reference}`);
    return row;
  }

  /**
   * Rewords a payment type or switches it on and off.
   *
   * The name is not editable and the DTO does not carry it — `payment.service` decides whether a payment is a
   * refund by comparing that string against `PaymentTypeEnum.REFUND`, and both
   * it and `office.service` group their takings by it, so a rename would report
   * the money wrong.
   * There is no delete either: a row live payments point at cannot be removed
   * without orphaning them.
   *
   * Written with `findOneAndUpdate` and an audit context, which is the only
   * path that diffs the previous row against the update — a `save()` here
   * would leave a history entry saying a change happened but not what.
   */
  async updatePaymentType(reference: string, data: UpdatePaymentTypeDto) {
    this.can('UPDATE', 'PaymentType');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const actorId = new Types.ObjectId(this.req.user.userId);
    const row = await this.resolvePaymentType(reference);

    const updated = await this.paymentTypeModel.findOneAndUpdate(
      { _id: row._id },
      { ...data },
      {
        context: auditContext(this.req, actorId),
        returnDocument: 'after',
      } as never,
    );

    this.logger.log(
      `[${platform}] ${phone} updated payment type ${row.reference}`,
    );
    return updated;
  }
}
