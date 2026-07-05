import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Customer } from 'src/schema/user/customer.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { UserTypeEum } from 'src/schema/user/user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from 'src/schema/user/user.schema';
import { FindAllUserDto } from './dto/find-all-user.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';

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
        { context: { changedBy: userId }, upsert: true, new: true } as never,
      );

      // Create new customer document
      const referralCode = await this.codeService.generateReferralCode();
      await this.customerModel.findOneAndUpdate(
        { userId: (newUser as unknown as User)._id },
        { referralCode, userId: (newUser as unknown as User)._id },
        { context: { changedBy: userId }, upsert: true, new: true } as never,
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
        { context: { changedBy: userId }, upsert: true, new: true } as never,
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

    let whereClause = {};
    if (query.userTypeId)
      whereClause = { userTypeId: new Types.ObjectId(query.userTypeId) };

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
}
