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
import { auditContext } from 'src/helper/service/audit-context';
import { Customer } from 'src/schema/user/customer.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { UserTypeEum } from 'src/schema/user/user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from 'src/schema/user/user.schema';
import { FindAllUserDto } from './dto/find-all-user.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { Role } from 'src/schema/admin/role.schema';
import { UserRole } from 'src/schema/admin/user-role.schema';
import { Office } from 'src/schema/office/office.schema';
import { OfficeUser } from 'src/schema/office/office-user.schema';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    private readonly codeService: CodeGeneratorService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(UserType.name) private readonly userTypeModel: Model<UserType>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(UserRole.name) private readonly userRoleModel: Model<UserRole>,
    @InjectModel(Office.name) private readonly officeModel: Model<Office>,
    @InjectModel(OfficeUser.name)
    private readonly officeUserModel: Model<OfficeUser>,
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

    const userExists = await this.userModel.findOne({ phone: data.phone });
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

    if (userTypeExists.userTypeName === UserTypeEum.CUSTOMER.toString()) {
      const newUser = await this.userModel.findOneAndUpdate(
        { phone: data.phone },
        { ...data, userTypeId },
        {
          context: auditContext(this.req, userId),
          upsert: true,
          returnDocument: 'after',
        } as never,
      );

      // Create new customer document
      const referralCode = await this.codeService.generateReferralCode();
      await this.customerModel.findOneAndUpdate(
        { userId: (newUser as unknown as User)._id },
        { referralCode, userId: (newUser as unknown as User)._id },
        {
          context: auditContext(this.req, userId),
          upsert: true,
          returnDocument: 'after',
        } as never,
      );
    }

    if (userTypeExists.userTypeName === UserTypeEum.ADMIN.toString()) {
      if (!password) {
        const log = 'is required to create an admin user';
        this.logger.error(`[${platform}] ${phone} password ${log}`);
        throw new BadRequestException(`Password ${log}`);
      }

      const hashedPassword = await this.codeService.hashPlainText(password);
      await this.userModel.findOneAndUpdate(
        { phone: data.phone },
        { ...data, userTypeId, passwordHash: hashedPassword },
        {
          context: auditContext(this.req, userId),
          upsert: true,
          returnDocument: 'after',
        } as never,
      );
    }

    this.logger.log(
      `[${platform}] ${phone} has successfully created a new user with type ${userTypeExists.userTypeName}.`,
    );

    return 'User successfully created';
  }

  async findAll({ page, size, ...query }: FindAllUserDto) {
    this.can('READ', 'User');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const whereClause: Record<string, unknown> = {};
    if (query.userType) {
      // The taxonomy lives in the user_type collection, so the name is resolved
      // to its id rather than matched against a hardcoded enum.
      const userType = await this.userTypeModel.findOne({
        userTypeName: query.userType.trim().toUpperCase(),
      });
      if (!userType) {
        this.logger.error(
          `[${platform}] ${phone} passed an invalid user type ${query.userType}`,
        );
        throw new BadRequestException({
          code: 'INVALID_USER_TYPE',
          message: 'Invalid user type',
        });
      }
      whereClause.userTypeId = userType._id;
    }
    if (query.q) {
      const rx = new RegExp(this.appUtilService.escapeRegex(query.q), 'i');
      whereClause.$or = [
        { firstName: rx },
        { lastName: rx },
        { email: rx },
        { phone: rx },
        { whatsappPhone: rx },
      ];
    }

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const users = await this.userModel
      .find(whereClause)
      .populate({ model: UserType.name, path: 'userTypeId' })
      .sort(sort)
      .skip(skip)
      .limit(size);

    const totalUsers = await this.userModel.countDocuments(whereClause);
    const totalPages = Math.ceil(totalUsers / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(
      `[${platform}] ${phone} has successfully retrieved all users`,
    );
    return { total: totalUsers, data: users, nextPage };
  }

  async findOne(id: string) {
    this.can('READ', 'User');
    const user = await this.userModel
      .findById(new Types.ObjectId(id))
      .select('-passwordHash')
      .populate({ model: UserType.name, path: 'userTypeId' });

    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }
    return user;
  }

  async update(id: string, data: UpdateUserDto) {
    this.can('UPDATE', 'User');
    const userId = new Types.ObjectId(id);
    const actorId = new Types.ObjectId(this.req.user.userId);

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

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

    const updated = await this.userModel.findOneAndUpdate(
      { _id: userId },
      data,
      {
        context: auditContext(this.req, actorId),
        returnDocument: 'after',
      } as never,
    );

    return updated;
  }

  async assignRole(id: string, data: AssignRoleDto) {
    this.can('manage', 'User');
    const userId = new Types.ObjectId(id);
    const actorId = new Types.ObjectId(this.req.user.userId);

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

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

  async revokeRole(id: string, roleId: string) {
    this.can('manage', 'User');
    const userId = new Types.ObjectId(id);
    const role = new Types.ObjectId(roleId);

    await Promise.all([
      this.userRoleModel.deleteOne({ userId, roleId: role }),
      this.officeUserModel.deleteMany({ userId, roleId: role }),
    ]);
    return 'Role revoked successfully';
  }

  async deactivate(id: string) {
    this.can('manage', 'User');
    const userId = new Types.ObjectId(id);
    const actorId = new Types.ObjectId(this.req.user.userId);

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

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
}
