import { AbilityBuilder, MongoAbility, MongoQuery } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { MergeType, Model } from 'mongoose';
import { Permission } from 'src/schema/admin/permission.schema';
import { RolePermission } from 'src/schema/admin/role-permission.schema';
import { UserRole } from 'src/schema/admin/user-role.schema';
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

  async createForUser(
    user: UserDto,
    context: AbilityContext = {},
  ): Promise<MongoAbility<AppAbilityDto, ConditionsDto>> {
    const { can, build } = new AbilityBuilder(AppAbility);

    const userRoles = await this.userRoleModel.find({ userId: user._id });
    if (!userRoles.length) return build();

    const self = user._id.toString();
    const roleIds = userRoles.map((userRole) => userRole.roleId);
    const rolePermissions = await this.rolePermissionModel
      .find({ roleId: { $in: roleIds } })
      .populate<{ permissionId: Permission }>({
        model: Permission.name,
        path: 'permissionId',
      })
      .lean();

    for (const rolePermission of rolePermissions) {
      const permission = rolePermission.permissionId;

      if (!permission || !permission.isActive) continue;

      const action = permission.action;
      const subject = permission.subject;

      const conditions = this.resolveConditions(
        rolePermission.conditions,
        self,
        context.office,
      );
      if (conditions) can(action, subject, conditions);
      else can(action, subject);
    }

    return build({
      detectSubjectType(subject: any) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return subject.__caslSubjectType__ ?? subject.constructor.name;
      },
    });
  }
}
