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
import { Connection, Model, Types } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { ScopeEnum } from 'src/schema/admin/admin.dto';
import { Permission } from 'src/schema/admin/permission.schema';
import { RolePermission } from 'src/schema/admin/role-permission.schema';
import { Role } from 'src/schema/admin/role.schema';
import { UserRole } from 'src/schema/admin/user-role.schema';
import { officeSchemaName } from 'src/schema/office/office.schema';
import {
  OfficeUser,
  officeUserSchemaName,
} from 'src/schema/office/office-user.schema';
import { CreateRoleDto } from './dto/create-role.dto';
import { DuplicateRoleDto } from './dto/duplicate-role.dto';
import { FindRoleDto } from './dto/find-role.dto';
import { FindRoleHoldersDto } from './dto/find-role-holders.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

/** One action on one subject, as the permission matrix lists it. */
export type PermissionOption = {
  _id: Types.ObjectId;
  action: string;
  subject: string;
  description?: string;
};

/** A permission a role holds, and how widely it holds it. */
export type HeldPermission = PermissionOption & { scope: ScopeEnum };

/**
 * One person holding a role, and how they came to hold it.
 *
 * No Mongo ids: a holder is addressed by the staff reference the rest of the
 * panel already links by, and their branch by its office code.
 */
export type RoleHolder = {
  scope: ScopeEnum;
  grantedAt: Date;
  reference?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone: string;
  isActive: boolean;
  officeName?: string;
  officeCode?: string;
};

@Injectable()
export class RoleService {
  private readonly logger = new Logger(RoleService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    private readonly codeService: CodeGeneratorService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(Permission.name)
    private readonly permissionModel: Model<Permission>,
    @InjectModel(RolePermission.name)
    private readonly rolePermissionModel: Model<RolePermission>,
    @InjectModel(UserRole.name) private readonly userRoleModel: Model<UserRole>,
    @InjectModel(OfficeUser.name)
    private readonly officeUserModel: Model<OfficeUser>,
  ) {}

  private get logBase() {
    const { platform } = this.req.data;
    const { phone } = this.req.user;
    return `[${platform}] ${phone}`;
  }

  private can(action: CaslActionsDto, subject: CaslSubjectsDto) {
    const { ability } = this.req.user;

    if (!ability.can(action, subject)) {
      const log = 'not authorized to perform this action';
      this.logger.error(`${this.logBase} is ${log}`);
      throw new ForbiddenException(`You are ${log}`);
    }
  }

  /** The role behind a reference, or a 404 naming what was asked for. */
  private async resolveRole(reference: string) {
    const role = await this.roleModel.findOne({ reference });
    if (!role) {
      this.logger.error(`${this.logBase} asked for unknown role ${reference}`);
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Role not found',
      });
    }
    return role;
  }

  /**
   * Refuses a name another role already answers to.
   *
   * Case-insensitive and anchored: "cashier" and "Cashier" are the same role
   * to everyone reading the screen, and two of them is a bug nobody can see.
   * `except` is the role being renamed, which must not clash with itself.
   */
  private async assertNameFree(roleName: string, except?: Types.ObjectId) {
    const clash = await this.roleModel.findOne({
      ...(except ? { _id: { $ne: except } } : {}),
      roleName: new RegExp(
        `^${this.appUtilService.escapeRegex(roleName)}$`,
        'i',
      ),
    });

    if (clash) {
      this.logger.error(`${this.logBase} tried to use taken name ${roleName}`);
      throw new ConflictException({
        code: 'ROLE_EXISTS',
        message: 'A role with that name already exists',
      });
    }
  }

  /**
   * How many people hold this role — globally and at a branch, counted apart.
   *
   * Both are needed before switching a role off or narrowing what it grants:
   * the number is the size of the blast radius, and a screen that showed one
   * figure would understate it.
   */
  private async holdersOf(roleId: Types.ObjectId) {
    const [global, perOffice] = await Promise.all([
      this.userRoleModel.countDocuments({ roleId }),
      this.officeUserModel.countDocuments({ roleId, isActive: true }),
    ]);
    return { global, perOffice, total: global + perOffice };
  }

  private buildFilter(query: Omit<FindRoleDto, 'page' | 'size'>) {
    const base: Record<string, unknown> = {};

    if (query.q) {
      const q = new RegExp(this.appUtilService.escapeRegex(query.q), 'i');
      base.$or = [{ reference: q }, { roleName: q }, { description: q }];
    }

    const status =
      query.isActive === undefined ? {} : { isActive: query.isActive };

    return { base, status };
  }

  /**
   * The roles file. Each row carries how many permissions it grants and how
   * many people hold it, because those two numbers are what the list is read
   * for — a role's name says what it is called, not what it does.
   */
  async findAll({ page, size, ...query }: FindRoleDto) {
    this.can('READ', 'Role');

    const { base, status } = this.buildFilter(query);
    const where = { ...base, ...status };

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const [roles, total] = await Promise.all([
      this.roleModel.find(where).sort(sort).skip(skip).limit(size).lean(),
      this.roleModel.countDocuments(where),
    ]);

    const roleIds = roles.map((role) => role._id);
    const [grants, globalHolders, officeHolders] = await Promise.all([
      this.rolePermissionModel.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { roleId: { $in: roleIds } } },
        { $group: { _id: '$roleId', n: { $sum: 1 } } },
      ]),
      this.userRoleModel.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { roleId: { $in: roleIds } } },
        { $group: { _id: '$roleId', n: { $sum: 1 } } },
      ]),
      this.officeUserModel.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { roleId: { $in: roleIds }, isActive: true } },
        { $group: { _id: '$roleId', n: { $sum: 1 } } },
      ]),
    ]);

    const countIn = (
      rows: { _id: Types.ObjectId; n: number }[],
      roleId: Types.ObjectId,
    ) => rows.find((row) => row._id.equals(roleId))?.n ?? 0;

    const totalPages = Math.ceil(total / size);

    this.logger.log(`${this.logBase} has retrieved all roles`);
    return {
      total,
      nextPage: page < totalPages ? page + 1 : null,
      data: roles.map((role) => ({
        ...role,
        permissionCount: countIn(grants, role._id),
        holders:
          countIn(globalHolders, role._id) + countIn(officeHolders, role._id),
      })),
    };
  }

  /** Headline counts for the roles file, over the same filters. */
  async getKpis(query: Omit<FindRoleDto, 'page' | 'size'>) {
    this.can('READ', 'Role');

    const { base, status } = this.buildFilter(query);

    const [total, byStatus] = await Promise.all([
      this.roleModel.countDocuments({ ...base, ...status }),
      this.roleModel.aggregate<{ _id: boolean; n: number }>([
        { $match: base },
        { $group: { _id: '$isActive', n: { $sum: 1 } } },
      ]),
    ]);

    const countIn = (isActive: boolean) =>
      byStatus.find((row) => row._id === isActive)?.n ?? 0;

    const active = countIn(true);
    const inactive = countIn(false);

    this.logger.log(`${this.logBase} has retrieved role kpis`);
    return {
      total,
      totalActive: active,
      totalInactive: inactive,
      byStatus: { all: active + inactive, active, inactive },
    };
  }

  /**
   * Every permission that exists, for the matrix to draw its rows from.
   *
   * The whole catalogue in one read — it is ~120 rows that change only when
   * the API grows a new subject, so paging it would cost more than it saved.
   */
  async listPermissions(): Promise<PermissionOption[]> {
    this.can('READ', 'Permission');

    const permissions = await this.permissionModel
      .find({ isActive: true })
      .select('action subject description')
      .sort({ subject: 1, action: 1 })
      .lean();

    this.logger.log(`${this.logBase} has retrieved the permission catalogue`);
    return permissions as PermissionOption[];
  }

  /** One role: what it is, what it grants, and how many people hold it. */
  async findByReference(reference: string) {
    this.can('READ', 'Role');

    const role = await this.resolveRole(reference);
    const [held, holders] = await Promise.all([
      this.rolePermissionModel
        .find({ roleId: role._id })
        .populate<{ permissionId: Permission }>({
          model: Permission.name,
          path: 'permissionId',
        })
        .lean(),
      this.holdersOf(role._id),
    ]);

    const permissions: HeldPermission[] = held
      .filter((row) => !!row.permissionId)
      .map((row) => ({
        _id: row.permissionId._id,
        action: row.permissionId.action,
        subject: row.permissionId.subject,
        description: row.permissionId.description,
        scope: row.scope,
      }));

    this.logger.log(`${this.logBase} has retrieved role ${reference}`);
    return { ...role.toObject(), permissions, holders };
  }

  /**
   * The people holding this role, named.
   *
   * One list out of two collections: a global grant in `user_role` and a
   * branch posting in `office_user` are different grants, and the screen has
   * to show both together with the branch each posting names. Newest grant
   * first, because the recent ones are what somebody is checking.
   *
   * Gated on staff as well as roles. The counts on the detail page say how
   * many people a change would reach and need only `READ Role`; this says who
   * they are, which is a staff read whatever screen asks for it.
   */
  async holders(reference: string, { page, size }: FindRoleHoldersDto) {
    this.can('READ', 'Role');
    this.can('READ', 'User');

    const role = await this.resolveRole(reference);
    const { total } = await this.holdersOf(role._id);

    const rows = await this.userRoleModel.aggregate<RoleHolder>([
      { $match: { roleId: role._id } },
      {
        $project: {
          _id: 0,
          userId: 1,
          officeId: { $literal: null },
          scope: { $literal: ScopeEnum.GLOBAL },
          grantedAt: '$createdAt',
        },
      },
      {
        $unionWith: {
          coll: officeUserSchemaName,
          pipeline: [
            { $match: { roleId: role._id, isActive: true } },
            {
              $project: {
                _id: 0,
                userId: 1,
                officeId: 1,
                scope: { $literal: ScopeEnum.OFFICE },
                grantedAt: '$createdAt',
              },
            },
          ],
        },
      },
      { $sort: { grantedAt: -1 } },
      { $skip: (page - 1) * size },
      { $limit: size },
      // Looked up after the page is cut, so a role held by two hundred people
      // still joins the twenty rows on screen.
      {
        $lookup: {
          from: 'user',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $lookup: {
          from: officeSchemaName,
          localField: 'officeId',
          foreignField: '_id',
          as: 'office',
        },
      },
      { $unwind: { path: '$office', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          scope: 1,
          grantedAt: 1,
          reference: '$user.reference',
          firstName: '$user.firstName',
          lastName: '$user.lastName',
          email: '$user.email',
          phone: '$user.phone',
          isActive: '$user.isActive',
          officeName: '$office.officeName',
          officeCode: '$office.officeCode',
        },
      },
    ]);

    const totalPages = Math.ceil(total / size);

    this.logger.log(`${this.logBase} has retrieved holders of ${reference}`);
    return {
      total,
      nextPage: page < totalPages ? page + 1 : null,
      data: rows,
    };
  }

  async create(data: CreateRoleDto) {
    this.can('CREATE', 'Role');

    const roleName = data.roleName.trim();
    await this.assertNameFree(roleName);

    const reference = await this.codeService.generateRoleReference();
    const role = await this.roleModel.create({
      reference,
      roleName,
      description: data.description?.trim(),
      isActive: true,
    });

    this.logger.log(`${this.logBase} added role ${reference}`);
    // A new role grants nothing until somebody says what it may do.
    return { reference: role.reference };
  }

  /**
   * Copies a role, grants and all, under a new name.
   *
   * One call rather than "add a role, then set its permissions" from the
   * screen: two calls can fail between them, and what that leaves behind is an
   * empty role somebody has to notice and clean up. Both writes run in one
   * transaction, so the copy either exists granting what the original grants,
   * or does not exist at all.
   *
   * Nobody holds the copy. It is a starting point to edit, not a second way to
   * give people the authority the original already carries.
   */
  async duplicate(reference: string, data: DuplicateRoleDto) {
    this.can('CREATE', 'Role');
    // Copying grants is granting them, so it takes the same authority as
    // setting them by hand.
    this.can('UPDATE', 'RolePermission');

    const source = await this.resolveRole(reference);
    const roleName = data.roleName.trim();
    await this.assertNameFree(roleName);

    // Read before the transaction opens: it is the source's own grants that
    // are copied, not a set posted back from a screen that may be stale.
    const held = await this.rolePermissionModel
      .find({ roleId: source._id })
      .lean();

    const newReference = await this.codeService.generateRoleReference();

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const [copy] = await this.roleModel.create(
          [
            {
              isActive: true,
              roleName,
              reference: newReference,
              description: data.description?.trim() ?? source.description,
            },
          ],
          { session },
        );

        if (held.length) {
          await this.rolePermissionModel.insertMany(
            held.map((row) => ({
              roleId: copy._id,
              permissionId: row.permissionId,
              scope: row.scope,
              conditions: row.conditions,
            })),
            { session },
          );
        }
      });
    } finally {
      await session.endSession();
    }

    this.logger.log(
      `${this.logBase} copied role ${reference} to ${newReference} with ` +
        `${held.length} permission(s)`,
    );
    return { reference: newReference, permissionCount: held.length };
  }

  async update(reference: string, data: UpdateRoleDto) {
    this.can('UPDATE', 'Role');

    const role = await this.resolveRole(reference);

    if (data.roleName) {
      const roleName = data.roleName.trim();
      await this.assertNameFree(roleName, role._id);
      role.roleName = roleName;
    }

    if (data.description !== undefined) {
      role.description = data.description.trim();
    }
    if (data.isActive !== undefined) role.isActive = data.isActive;

    await role.save();

    this.logger.log(`${this.logBase} updated role ${reference}`);
    return 'Role updated successfully';
  }

  /**
   * Set what a role may do, as a whole.
   *
   * Replaced rather than merged: the screen holds a matrix of ticks and sends
   * the state it is showing, so what is stored is what somebody looked at.
   * Both writes run in one transaction — a half-applied permission set is a
   * role that grants something nobody chose.
   */
  async setPermissions(reference: string, data: SetRolePermissionsDto) {
    // The authority to change what a role may do, which is the authority to
    // change what everybody holding it may do. Its own subject for that reason.
    this.can('UPDATE', 'RolePermission');

    const role = await this.resolveRole(reference);

    // Every id has to name a real, active permission. One that does not is a
    // stale screen or a hand-written payload; either way the whole set is
    // refused rather than quietly stored minus the rows that did not resolve.
    const ids = data.permissions.map(
      (entry) => new Types.ObjectId(entry.permissionId),
    );
    const found = await this.permissionModel.countDocuments({
      _id: { $in: ids },
      isActive: true,
    });
    if (found !== new Set(ids.map(String)).size) {
      this.logger.error(`${this.logBase} sent an unknown permission id`);
      throw new BadRequestException({
        code: 'INVALID_PERMISSION',
        message: 'One or more permissions do not exist',
      });
    }

    const rows = data.permissions.map((entry) => ({
      roleId: role._id,
      permissionId: new Types.ObjectId(entry.permissionId),
      scope: entry.scope ?? ScopeEnum.GLOBAL,
    }));

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.rolePermissionModel.deleteMany(
          { roleId: role._id },
          { session },
        );
        if (rows.length) {
          await this.rolePermissionModel.insertMany(rows, { session });
        }
      });
    } finally {
      await session.endSession();
    }

    /**
     * Nobody's live session changes here. An ability is built per request from
     * these rows (`CaslAbilityService`), so the next request every holder makes
     * already carries the new set — there is no cache to clear and no sign-out
     * to force.
     */
    this.logger.log(
      `${this.logBase} set ${rows.length} permission(s) on role ${reference}`,
    );
    return 'Role permissions updated successfully';
  }
}
