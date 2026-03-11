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
import { Item } from 'src/schema/catalog/item.schema';
import { ServiceType } from 'src/schema/catalog/service-type.schema';
import { Service } from 'src/schema/catalog/service.schema';
import { SubCategory } from 'src/schema/catalog/sub-category.schema';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { Currency } from 'src/schema/catalog/currency.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';
import { PaymentMethod } from 'src/schema/payment/payment-method.schema';
import { PaymentStatus } from 'src/schema/payment/payment-status.schema';

@Injectable()
export class UtilService {
  private readonly logger = new Logger(UtilService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(UserType.name) private readonly userTypeModel: Model<UserType>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    @InjectModel(SubCategory.name)
    private readonly subCategoryModel: Model<SubCategory>,
    @InjectModel(Service.name) private readonly serviceModel: Model<Service>,
    @InjectModel(Item.name) private readonly itemModel: Model<Item>,
    @InjectModel(ServiceType.name)
    private readonly serviceTypeModel: Model<ServiceType>,

    @InjectModel(Currency.name)
    private readonly currencyModel: Model<Currency>,

    @InjectModel(PickupStatus.name)
    private readonly pickupStatusModel: Model<PickupStatus>,

    @InjectModel(OrderStatus.name)
    private readonly orderStatusModel: Model<OrderStatus>,

    @InjectModel(PaymentMethod.name)
    private readonly paymentMethodModel: Model<PaymentMethod>,

    @InjectModel(PaymentStatus.name)
    private readonly paymentStatusModel: Model<PaymentStatus>,
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
      .limit(size)
      .lean();

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
      .limit(size)
      .lean();

    const totalPages = Math.ceil(totalPickupStatus / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all pickup statuses`);
    return { total: totalPickupStatus, data: pickupStatuses, nextPage };
  }

  async findAllCurrencies({ page, size, ...query }: PaginationDto) {
    this.can('READ', 'Currency');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const totalCurrencies = await this.currencyModel.countDocuments();
    const currencies = await this.currencyModel
      .find()
      .sort(sort)
      .skip(skip)
      .limit(size)
      .lean();

    const totalPages = Math.ceil(totalCurrencies / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all currencies`);
    return { total: totalCurrencies, data: currencies, nextPage };
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
      .limit(size)
      .lean();

    const totalCategories = await this.categoryModel.countDocuments();
    const totalPages = Math.ceil(totalCategories / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all categories`);
    return { total: totalCategories, data: categories, nextPage };
  }

  async findAllSubCategories({ page, size, ...query }: PaginationDto) {
    this.can('READ', 'SubCategory');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const subCategories = await this.subCategoryModel
      .find()
      .sort(sort)
      .skip(skip)
      .limit(size)
      .lean();

    const totalSubCategories = await this.subCategoryModel.countDocuments();
    const totalPages = Math.ceil(totalSubCategories / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all sub categories`);
    return { total: totalSubCategories, data: subCategories, nextPage };
  }

  async findAllServices({ page, size, ...query }: PaginationDto) {
    this.can('READ', 'Service');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const services = await this.serviceModel
      .find()
      .sort(sort)
      .skip(skip)
      .limit(size)
      .lean();

    const totalServices = await this.serviceModel.countDocuments();
    const totalPages = Math.ceil(totalServices / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all services`);
    return { total: totalServices, data: services, nextPage };
  }

  async findAllItems({ page, size, ...query }: PaginationDto) {
    this.can('READ', 'Item');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const items = await this.itemModel.aggregate([
      { $sort: sort },
      { $skip: skip },
      { $limit: size },
      {
        $lookup: {
          as: 'service',
          from: 'service',
          foreignField: '_id',
          localField: 'serviceId',
        },
      },

      { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'currency',
          from: 'currency',
          foreignField: '_id',
          localField: 'currencyId',
        },
      },
      { $unwind: { path: '$currency', preserveNullAndEmptyArrays: true } },

      // Service Type
      {
        $lookup: {
          as: 'serviceType',
          foreignField: '_id',
          from: 'service_type',
          localField: 'serviceTypeId',
        },
      },
      { $unwind: { path: '$serviceType', preserveNullAndEmptyArrays: true } },

      // Item → Categories
      {
        $lookup: {
          localField: '_id',
          from: 'item_category',
          as: 'itemCategories',
          foreignField: 'itemId',
        },
      },

      {
        $lookup: {
          from: 'category',
          as: 'categories',
          foreignField: '_id',
          localField: 'itemCategories.categoryId',
        },
      },
      // Item → Subcategories
      {
        $lookup: {
          localField: '_id',
          foreignField: 'itemId',
          as: 'itemSubCategories',
          from: 'item_sub_category',
        },
      },

      {
        $lookup: {
          foreignField: '_id',
          as: 'subCategories',
          from: 'sub_category',
          localField: 'itemSubCategories.subCategoryId',
        },
      },

      { $project: { itemCategories: 0, itemSubCategories: 0 } },
    ]);

    const totalItems = await this.itemModel.countDocuments();
    const totalPages = Math.ceil(totalItems / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all items`);
    return { total: totalItems, data: items, nextPage };
  }

  async findAllServiceTypes({ page, size, ...query }: PaginationDto) {
    this.can('READ', 'ServiceType');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const serviceTypes = await this.serviceTypeModel
      .find()
      .sort(sort)
      .skip(skip)
      .limit(size)
      .lean();

    const totalServiceTypes = await this.serviceTypeModel.countDocuments();
    const totalPages = Math.ceil(totalServiceTypes / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all service types`);
    return { total: totalServiceTypes, data: serviceTypes, nextPage };
  }

  async findAllOrderStatuses({ page, size, ...query }: PaginationDto) {
    this.can('READ', 'OrderStatus');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const totalOrderStatuses = await this.orderStatusModel.countDocuments();
    const orderStatuses = await this.orderStatusModel
      .find()
      .sort(sort)
      .skip(skip)
      .limit(size)
      .lean();

    const totalPages = Math.ceil(totalOrderStatuses / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all order statuses`);
    return { total: totalOrderStatuses, data: orderStatuses, nextPage };
  }

  async findAllPaymentMethod({ page, size, ...query }: PaginationDto) {
    this.can('READ', 'PaymentMethod');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const totalPaymentMethod = await this.paymentMethodModel.countDocuments();
    const paymentMethods = await this.paymentMethodModel
      .find()
      .sort(sort)
      .skip(skip)
      .limit(size)
      .lean();

    const totalPages = Math.ceil(totalPaymentMethod / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all payment methods`);
    return { total: totalPaymentMethod, data: paymentMethods, nextPage };
  }

  async findAllPaymentStatuses({ page, size, ...query }: PaginationDto) {
    this.can('READ', 'PaymentStatus');

    const platform = this.req.data.platform;
    const phone = this.req.user.phone;
    const logBase = `[${platform}] ${phone}`;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const totalPaymentStatus = await this.paymentStatusModel.countDocuments();
    const paymentStatus = await this.paymentStatusModel
      .find()
      .sort(sort)
      .skip(skip)
      .limit(size)
      .lean();

    const totalPages = Math.ceil(totalPaymentStatus / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(
      `${logBase} has successfully retrieve all payment statuses`,
    );
    return { total: totalPaymentStatus, data: paymentStatus, nextPage };
  }
}
