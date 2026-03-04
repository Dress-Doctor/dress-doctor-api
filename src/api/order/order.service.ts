import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Currency } from 'src/schema/catalog/currency.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { OrderStatusEnum } from 'src/schema/order/order.dto';
import { Order } from 'src/schema/order/order.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { User } from 'src/schema/user/user.schema';
import { CreateOrderDto } from './dto/create-order.dto';
import { FindOrderDto } from './dto/find-order.dto';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<Order>,

    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    private readonly codeService: CodeGeneratorService,
    private readonly appUtilService: AppUtilService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Currency.name) private readonly currencyModel: Model<Currency>,
    @InjectModel(OrderStatus.name)
    private readonly orderStatusModel: Model<OrderStatus>,

    @InjectModel(PickupRequest.name)
    private readonly pickupRequestModel: Model<PickupRequest>,
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

  async createOrder(data: CreateOrderDto) {
    this.can('CREATE', 'Order');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const customerId = new Types.ObjectId(data.customerId);
    const customer = await this.userModel.findById(customerId);
    if (!customer) {
      this.logger.error(
        `[${platform}] ${phone} invalid customer id ${data.customerId}`,
      );
      throw new BadRequestException('Invalid customer id');
    }

    const currencyId = new Types.ObjectId(data.currencyId);
    const currency = await this.currencyModel.findById(currencyId);
    if (!currency) {
      this.logger.error(
        `[${platform}] ${phone} invalid currency id ${data.currencyId}`,
      );
      throw new BadRequestException('Invalid currency id');
    }

    const pickupRequestId = new Types.ObjectId(data.pickupRequestId);
    const pickupRequest =
      await this.pickupRequestModel.findById(pickupRequestId);
    if (!pickupRequest) {
      this.logger.error(
        `[${platform}] ${phone} invalid pickup request id ${data.pickupRequestId}`,
      );
      throw new BadRequestException('Invalid pickup request id');
    }

    const existingOrder = await this.orderModel.findOne({
      customerId,
      pickupRequestId,
    });
    if (existingOrder) {
      this.logger.error(
        `[${platform}] ${phone} order already exists for customer ${data.customerId} and pickup request ${data.pickupRequestId}`,
      );
      throw new BadRequestException(
        'An order already exists for this customer and pickup request',
      );
    }

    const orderStatusDraft = OrderStatusEnum.DRAFT;
    const orderStatus = await this.orderStatusModel.findOne({
      orderStatusName: orderStatusDraft,
    });
    if (!orderStatus) {
      this.logger.error(
        `[${platform}] ${phone} order status ${orderStatusDraft} not found in database`,
      );
      throw new BadRequestException('Order status not found');
    }

    await this.orderModel.findOneAndUpdate(
      { customerId: customerId, pickupRequestId: pickupRequestId },
      {
        ...data,
        customerId,
        currencyId,
        pickupRequestId,
        orderStatusId: orderStatus._id,
        orderCode: await this.codeService.generateOrderReference(),
      },
      {
        context: { changedBy: new Types.ObjectId(this.req.user.userId) },
        upsert: true,
        new: true,
      } as never,
    );

    this.logger.log(
      `[${platform}] ${phone} has successfully created order for pickup request ${data.pickupRequestId}`,
    );
    return { message: 'Order created successfully' };
  }

  async findAll({ page, size, ...query }: FindOrderDto) {
    this.can('READ', 'Order');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const logBase = `[${platform}] ${phone}`;

    const whereClause = {};
    const customerId = query.customerId;
    if (customerId) whereClause['customerId'] = new Types.ObjectId(customerId);

    const pickupRequestId = query.pickupRequestId;
    if (pickupRequestId)
      whereClause['pickupRequestId'] = new Types.ObjectId(pickupRequestId);

    const orderStatusId = query.orderStatusId;
    if (orderStatusId)
      whereClause['orderStatusId'] = new Types.ObjectId(orderStatusId);

    const orderCode = query.orderCode;
    if (orderCode) whereClause['orderCode'] = orderCode;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);
    const total = await this.orderModel.countDocuments(whereClause);
    const data = await this.orderModel.aggregate([
      { $match: whereClause },
      { $sort: sort },
      { $skip: skip },
      { $limit: size },

      {
        $lookup: {
          from: 'order_item',
          localField: '_id',
          foreignField: 'orderId',
          as: 'orderItems',
          pipeline: [
            {
              $lookup: {
                from: 'item',
                localField: 'itemId',
                foreignField: '_id',
                as: 'item',
                pipeline: [
                  {
                    $lookup: {
                      from: 'service',
                      localField: 'serviceId',
                      foreignField: '_id',
                      as: 'service',
                    },
                  },
                  {
                    $unwind: {
                      path: '$service',
                      preserveNullAndEmptyArrays: true,
                    },
                  },

                  {
                    $lookup: {
                      from: 'service_type',
                      localField: 'serviceTypeId',
                      foreignField: '_id',
                      as: 'serviceType',
                    },
                  },
                  {
                    $unwind: {
                      path: '$serviceType',
                      preserveNullAndEmptyArrays: true,
                    },
                  },

                  {
                    $lookup: {
                      from: 'currency',
                      localField: 'currencyId',
                      foreignField: '_id',
                      as: 'currency',
                    },
                  },
                  {
                    $unwind: {
                      path: '$currency',
                      preserveNullAndEmptyArrays: true,
                    },
                  },
                ],
              },
            },
            {
              $unwind: {
                path: '$item',
                preserveNullAndEmptyArrays: true,
              },
            },
          ],
        },
      },
    ]);

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all items`);
    return { total, data, nextPage };
  }
}
