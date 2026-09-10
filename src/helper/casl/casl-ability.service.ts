import { AbilityBuilder, MongoAbility, MongoQuery } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { MergeType, Model } from 'mongoose';
import { Permission } from 'src/schema/admin/permission.schema';
import { RolePermission } from 'src/schema/admin/role-permission.schema';
import { UserRole } from 'src/schema/admin/user-role.schema';
import { OfficeUser } from 'src/schema/office/office-user.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';
import { AppAbility, AppAbilityDto, ConditionsDto } from './casl.dto';

type UserDto = User | MergeType<User, { userTypeId: UserType }>;

/** Caller context used to resolve condition placeholders ($self, $office). */
export interface AbilityContext {
  office?: string;
}

@Injectable()
export class CaslAbilityService {
  constructor(
    @InjectModel(UserRole.name)
    private readonly userRoleModel: Model<UserRole>,

    @InjectModel(RolePermission.name)
    private readonly rolePermissionModel: Model<RolePermission>,

    @InjectModel(OfficeUser.name)
    private readonly officeUserModel: Model<OfficeUser>,
  ) {}

  /**
   * Resolve `$self`/`$office` placeholders in a seeded condition against the
   * caller. `$self` → the caller's user id; `$office` → the office the caller is
   * operating in (null when none, so office-scoped rules match nothing rather
   * than everything). Done by JSON substitution so nested conditions work.
   */
  private resolveConditions(
    conditions: MongoQuery | undefined,
    self: string,
    office?: string,
  ): MongoQuery<any> | undefined {
    if (!conditions) return undefined;
    const json = JSON.stringify(conditions)
      .split('"$self"')
      .join(JSON.stringify(self))
      .split('"$office"')
      .join(office ? JSON.stringify(office) : 'null');
    return JSON.parse(json) as MongoQuery<any>;
  }

  /**
   * Every way a role reaches this user, and the office each one speaks for.
   *
   * Two collections, because there are two kinds of grant. `UserRole` is a
   * role held everywhere — its `$office` is the office the request is being
   * made in. `OfficeUser` is a posting at one branch, and its `$office` is
   * that branch, not the request's: nothing in the admin panel sets the
   * `office_ref` cookie the request office is read from, so a posting that
   * leaned on it would resolve to whichever office happens to be the default
   * and grant the wrong branch.
   *
   * Only live postings count. Revoking one flags it inactive rather than
   * deleting it, so the row stays in the audit trail — reading it back without
   * this filter would hand the authority straight back.
   */
  private async grantsFor(user: UserDto, requestOffice?: string) {
    const [userRoles, postings] = await Promise.all([
      this.userRoleModel.find({ userId: user._id }).lean(),
      this.officeUserModel.find({ userId: user._id, isActive: true }).lean(),
    ]);

    return [
      ...userRoles.map((row) => ({
        roleId: row.roleId,
        office: requestOffice,
      })),
      ...postings.map((row) => ({
        roleId: row.roleId,
        office: row.officeId?.toString(),
      })),
    ];
  }

  async createForUser(
    user: UserDto,
    context: AbilityContext = {},
  ): Promise<MongoAbility<AppAbilityDto, ConditionsDto>> {
    const { can, build } = new AbilityBuilder(AppAbility);

    const grants = await this.grantsFor(user, context.office);
    if (!grants.length) return build();

    const self = user._id.toString();
    const roleIds = grants.map((grant) => grant.roleId);
    const rolePermissions = await this.rolePermissionModel
      .find({ roleId: { $in: roleIds } })
      .populate<{ permissionId: Permission }>({
        model: Permission.name,
        path: 'permissionId',
      })
      .lean();

    // A role can arrive by more than one grant — held globally and posted at a
    // branch. Each grant contributes its own rules, so the branch condition and
    // the global one both stand rather than one quietly replacing the other.
    const byRole = new Map<string, typeof rolePermissions>();
    for (const rolePermission of rolePermissions) {
      const key = rolePermission.roleId.toString();
      const bucket = byRole.get(key) ?? [];
      bucket.push(rolePermission);
      byRole.set(key, bucket);
    }

    for (const grant of grants) {
      for (const rolePermission of byRole.get(grant.roleId.toString()) ?? []) {
        const permission = rolePermission.permissionId;

        if (!permission || !permission.isActive) continue;

        const action = permission.action;
        const subject = permission.subject;

        const conditions = this.resolveConditions(
          rolePermission.conditions,
          self,
          grant.office,
        );
        if (conditions) can(action, subject, conditions);
        else can(action, subject);
      }
    }

    return build({
      detectSubjectType(subject: any) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return subject.__caslSubjectType__ ?? subject.constructor.name;
      },
    });
  }
}
