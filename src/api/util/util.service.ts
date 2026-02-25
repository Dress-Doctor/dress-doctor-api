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
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { Category } from 'src/schema/catalog/category.schema';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';

@Injectable()
export class UtilService {
  private readonly logger = new Logger(UtilService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(UserType.name) private readonly userTypeModel: Model<UserType>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,

    @InjectModel(PickupStatus.name)
    private readonly pickupStatusModel: Model<PickupStatus>,
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

  async findAllUserType({ page, size, ...query }: PaginationDto) {
    this.can('READ', 'UserType');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;

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

  async findAllPickupStatuses({ page, size, ...query }: PaginationDto) {
    this.can('READ', 'PickupRequest');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const totalPickupStatus = await this.pickupStatusModel.countDocuments();
    const pickupStatuses = await this.pickupStatusModel
      .find()
      .sort(sort)
      .skip(skip)
      .limit(size);

    const totalPages = Math.ceil(totalPickupStatus / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all pickup statuses`);
    return { total: totalPickupStatus, data: pickupStatuses, nextPage };
  }

  async findAllCategories({ page, size, ...query }: PaginationDto) {
    this.can('READ', 'Category');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const categories = await this.categoryModel
      .find()
      .sort(sort)
      .skip(skip)
      .limit(size);

    const totalCategories = await this.categoryModel.countDocuments();
    const totalPages = Math.ceil(totalCategories / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all categories`);
    return { total: totalCategories, data: categories, nextPage };
  }
}
