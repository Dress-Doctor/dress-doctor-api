import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  type AppRequestWithUser,
  PaginationDto,
} from 'src/dto/request-data.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { UserType } from 'src/schema/user/user-type.schema';
import { UserTypeEum } from 'src/schema/user/user.dto';
import { User } from 'src/schema/user/user.schema';

@Injectable()
export class UtilService {
  private readonly logger = new Logger(UtilService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(UserType.name) private readonly userTypeModel: Model<UserType>,
  ) {}

  async findAllUserType({ page, size, ...query }: PaginationDto) {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;

    if (!ability.can('READ', 'UserType')) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} ${log}`);
      throw new BadRequestException(`You are ${log}`);
    }

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const totalUserTypes = await this.userModel.countDocuments();
    const userTypes = await this.userTypeModel
      .find()
      .sort(sort)
      .skip(skip)
      .limit(size);

    const totalPages = Math.ceil(totalUserTypes / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(
      `[${platform}] ${phone} has successfully retrieve all user types`,
    );

    return { total: totalUserTypes, data: userTypes, nextPage };
  }

  async findAllAdminUsers({ page, size, ...query }: PaginationDto) {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;

    if (!ability.can('READ', 'User')) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} ${log}`);
      throw new BadRequestException(`You are ${log}`);
    }

    const adminUserType = await this.userTypeModel.findOne({
      userTypeName: UserTypeEum.ADMIN,
    });
    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const adminUsers = await this.userModel
      .find({ userTypeId: adminUserType?._id })
      .populate({ model: UserType.name, path: 'userTypeId' })
      .sort(sort)
      .skip(skip)
      .limit(size);

    const totalAdminUsers = await this.userModel.countDocuments();
    const totalPages = Math.ceil(totalAdminUsers / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(
      `[${platform}] ${phone} has successfully retrieve all admin users`,
    );
    return { total: totalAdminUsers, data: adminUsers, nextPage };
  }
}
