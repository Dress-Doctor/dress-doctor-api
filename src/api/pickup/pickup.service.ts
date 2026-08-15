import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { auditContext } from 'src/helper/service/audit-context';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { OfficeType } from 'src/schema/office/office-type.schema';
import { Office } from 'src/schema/office/office.schema';
import { PickupAssignment } from 'src/schema/pickup/pickup-assignment.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { PickupStatusEnum } from 'src/schema/pickup/pickup.dto';
import { Order } from 'src/schema/order/order.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { OrderStatusEnum } from 'src/schema/order/order.dto';
import { Customer } from 'src/schema/user/customer.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { UserTypeEum } from 'src/schema/user/user.dto';
import { User } from 'src/schema/user/user.schema';
import {
  AssignPickupDto,
  PickupRequestParamsDto,
} from './dto/assign-pickup.dto';
import { CreatePickupDto } from './dto/create-pickup.dto';
import { FindPickupDto } from './dto/find-pickup.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';

@Injectable()
export class PickupService {
  private readonly logger = new Logger(PickupRequest.name);

  constructor(
    private readonly appUtilService: AppUtilService,

    @InjectModel(PickupStatus.name)
    private readonly pickupStatusModel: Model<PickupStatus>,

    @InjectModel(PickupRequest.name)
    private readonly pickupRequestModel: Model<PickupRequest>,

    @InjectModel(PickupAssignment.name)
    private readonly pickupAssignmentModel: Model<PickupAssignment>,

    @InjectModel(Order.name)
    private readonly orderModel: Model<Order>,

    @InjectModel(OrderStatus.name)
    private readonly orderStatusModel: Model<OrderStatus>,

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

  async schedulePickup(data: CreatePickupDto) {
    const { platform, apiClientId, officeId } = this.req.data;
    const userType = await this.userTypeModel.findOne({
      userTypeName: UserTypeEum.CUSTOMER,
    });

    // Create or update user
    const foundedUser = await this.userModel.findOneAndUpdate(
      { phone: data.phone },
      { ...data, userTypeId: userType!._id },
      { upsert: true, returnDocument: 'after' },
    );

    // Check if customer document exist
    let customerExists = await this.customerModel.exists({
      userId: foundedUser._id,
    });

    if (!customerExists) {
      // Create new customer document
      const referralCode = await this.codeService.generateReferralCode();
      const newCustomer = await this.customerModel.findOneAndUpdate(
        { userId: foundedUser._id },
        { referralCode, userId: foundedUser._id },
        {
          context: auditContext(this.req, foundedUser._id),
          upsert: true,
          returnDocument: 'after',
        } as never,
      );
      customerExists = { _id: (newCustomer as unknown as Customer)._id };
    }

    const pendingPickupStatus = await this.pickupStatusModel.findOne({
      pickupStatusName: PickupStatusEnum.PENDING,
    });

    // Check if another pickup request is in progress
    const pendingPickupRequest = await this.pickupRequestModel.findOne({
      customerId: foundedUser._id,
      pickupStatusId: pendingPickupStatus!._id,
    });

    if (pendingPickupRequest) {
      this.logger.log(
        `[${platform}] ${data.phone} already have another request in progress.`,
      );
      throw new BadRequestException(
        'You already have another request in progress. Please be patient, we will call you.',
      );
    }
    // Create pickup
    const newPickupRequest = await this.pickupRequestModel
      .findOneAndUpdate(
        {
          customerId: foundedUser._id,
          pickupStatusId: pendingPickupStatus!._id,
        },
        {
          customerId: foundedUser._id,
          pickupTime: data.pickupTime,
          pickupDate: data.pickupDate,
          pickupAddress: data.pickupAddress,
          officeId: new Types.ObjectId(officeId),
          pickupStatusId: pendingPickupStatus!._id,
          apiClientId: new Types.ObjectId(apiClientId),
          reference: await this.codeService.generatePickupReference(),
        },
        {
          context: auditContext(this.req, foundedUser._id),
          upsert: true,
          returnDocument: 'after',
        } as never,
      )
      .populate({ path: 'pickupStatusId' });

    // const newPickupRequest = await this.pickupRequestModel.create({
    //   customerId: foundedUser._id,
    //   pickupTime: data.pickupTime,
    //   pickupDate: data.pickupDate,
    //   pickupAddress: data.pickupAddress,
    //   officeId: new Types.ObjectId(officeId),
    //   pickupStatusId: pendingPickupStatus!._id,
    //   apiClientId: new Types.ObjectId(apiClientId),
    // });
    // await newPickupRequest.populate({ path: 'pickupStatusId' });

    const customerInfo = await this.customerModel
      .findById(customerExists._id)
      .populate({
        model: User.name,
        path: 'userId',
        populate: { model: UserType.name, path: 'userTypeId' },
      });

    this.logger.log(`${data.phone} has successfully schedule a pickup`);
    return { customer: customerInfo, pickupRequest: newPickupRequest };
  }

  async findAllPickup({ page, size, ...query }: FindPickupDto) {
    this.can('READ', 'PickupRequest');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    let whereClause = {};

    // Pickup Status Filter
    if (query.pickupStatusId) {
      const pickupStatus = await this.pickupStatusModel.findOne({
        _id: new Types.ObjectId(query.pickupStatusId),
      });
      if (!pickupStatus) {
        const log = `[${platform}] ${phone} pickupStatusId=${query.pickupStatusId} doesn't exists`;
        this.logger.error(log);
        throw new NotFoundException('Invalid pickupStatusId');
      }

      whereClause = { ...whereClause, pickupStatusId: pickupStatus._id };
    }

    // Pickup Reference Filter
    if (query.reference)
      whereClause = { ...whereClause, reference: query.reference };

    const pickups = await this.pickupRequestModel
      .find(whereClause)
      .populate({ model: User.name, path: 'customerId' })
      .populate({
        model: Office.name,
        path: 'officeId',
        populate: { model: OfficeType.name, path: 'officeTypeId' },
      })
      .populate({ path: 'pickupStatusId', model: PickupStatus.name })
      .sort(sort)
      .skip(skip)
      .limit(size);

    const totalPickups =
      await this.pickupRequestModel.countDocuments(whereClause);
    const nextPage = page < totalPickups ? page + 1 : null;

    this.logger.log(
      `[${platform}] ${phone} has successfully retrieve all pickups`,
    );
    return { total: totalPickups, data: pickups, nextPage };
  }

  async assignPickup(param: PickupRequestParamsDto, data: AssignPickupDto) {
    this.can('ASSIGN', 'PickupAssignment');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;
    const userId = new Types.ObjectId(this.req.user.userId);

    const userType = await this.userTypeModel.findOne({
      userTypeName: UserTypeEum.ADMIN,
    });
    const userExists = await this.userModel.findOne({
      _id: data.agentId,
      userTypeId: userType?._id,
    });

    if (!userExists) {
      const log = `You can't assign a pickup request to a Customer or Affiliate Partner`;
      this.logger.error(`[${platform}] ${phone} ${log}`);
      throw new BadRequestException(log);
    }

    const confirmPickupStatus = await this.pickupStatusModel.findOne({
      pickupStatusName: PickupStatusEnum.CONFIRMED,
    });

    const pickupRequestId = new Types.ObjectId(param.pickupId);
    const pickupRequestExists =
      await this.pickupRequestModel.findById(pickupRequestId);

    if (!pickupRequestExists) {
      this.logger.error(`${base} invalid pickupId ${param.pickupId}`);
      throw new NotFoundException('Pickup not found');
    }

    if (
      pickupRequestExists.pickupStatusId.toString() !==
      confirmPickupStatus?._id.toString()
    ) {
      this.logger.error(
        `${base} cannot assign pickup ${pickupRequestExists.reference} because it is not in CONFIRMED status`,
      );
      throw new BadRequestException(
        'Can only assign pickup in confirmed status',
      );
    }

    await this.pickupAssignmentModel.findOneAndUpdate(
      { agentId: userExists._id, pickupRequestId: pickupRequestExists._id },
      {
        agentId: userExists._id,
        assignedAt: data.assignedAt ?? new Date(),
        pickupRequestId: pickupRequestExists._id,
      },
      {
        context: auditContext(this.req, userId),
        upsert: true,
        returnDocument: 'after',
      } as never,
    );

    const assignedPickupStatus = await this.pickupStatusModel.findOne({
      pickupStatusName: PickupStatusEnum.ASSIGNED,
    });
    await this.pickupRequestModel.findOneAndUpdate(
      { _id: pickupRequestExists._id },
      { pickupStatusId: assignedPickupStatus!._id },
      {
        context: auditContext(this.req, userId),
        upsert: true,
        returnDocument: 'after',
      } as never,
    );

    this.logger.log(
      `[${platform}] ${phone} pickup-request successfully assigned to ${userExists.phone}`,
    );
    return 'Pickup request successfully assigned';
  }

  async confirmPickup(pickupRequestId: string) {
    this.can('CONFIRM', 'PickupRequest');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const pickupObjectId = new Types.ObjectId(pickupRequestId);
    const pickupRequest =
      await this.pickupRequestModel.findById(pickupObjectId);
    if (!pickupRequest) {
      this.logger.error(`${base} invalid pickupRequestId ${pickupRequestId}`);
      throw new NotFoundException('Pickup not found');
    }

    // lookup pending status
    const pendingStatus = await this.pickupStatusModel.findOne({
      pickupStatusName: PickupStatusEnum.PENDING,
    });
    if (!pendingStatus) {
      this.logger.error(`${base} pending pickup status not found`);
      throw new BadRequestException('Pending pickup status not configured');
    }

    if (
      pickupRequest.pickupStatusId.toString() !== pendingStatus._id.toString()
    ) {
      this.logger.error(
        `${base} cannot confirm pickup ${pickupRequest.reference} because it is not in PENDING status`,
      );
      throw new BadRequestException(
        'Can only confirm pickups in pending status',
      );
    }

    // lookup pending status
    const confirmStatus = await this.pickupStatusModel.findOne({
      pickupStatusName: PickupStatusEnum.CONFIRMED,
    });
    if (!confirmStatus) {
      this.logger.error(`${base} confirmed pickup status not found`);
      throw new BadRequestException('Confirmed pickup status not configured');
    }

    const userId = new Types.ObjectId(this.req.user.userId);
    await this.pickupRequestModel.findOneAndUpdate(
      { _id: pickupRequest._id },
      { pickupStatusId: confirmStatus._id, confirmedBy: userId },
      {
        context: auditContext(this.req, userId),
        returnDocument: 'after',
      } as never,
    );

    this.logger.log(`${base} pickup ${pickupRequest.reference} confirmed`);
    return 'Pickup confirmed successfully';
  }

  async cancelPickup(pickupRequestId: string) {
    this.can('UPDATE', 'PickupRequest');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const pickupObjectId = new Types.ObjectId(pickupRequestId);
    const pickupRequest =
      await this.pickupRequestModel.findById(pickupObjectId);
    if (!pickupRequest) {
      this.logger.error(`${base} invalid pickupRequestId ${pickupRequestId}`);
      throw new NotFoundException('Pickup not found');
    }

    const cancelledStatus = await this.pickupStatusModel.findOne({
      pickupStatusName: PickupStatusEnum.CANCELLED,
    });
    if (!cancelledStatus) {
      this.logger.error(`${base} cancelled pickup status not found`);
      throw new BadRequestException('Cancelled pickup status not configured');
    }

    // disallow cancelling already cancelled pickups
    if (
      pickupRequest.pickupStatusId.toString() === cancelledStatus._id.toString()
    ) {
      this.logger.error(
        `${base} pickup ${pickupRequest.reference} is already cancelled`,
      );
      throw new BadRequestException('Pickup is already cancelled');
    }

    // disallow cancelling picked up pickups
    const pickedUpStatus = await this.pickupStatusModel.findOne({
      pickupStatusName: PickupStatusEnum.PICKED_UP,
    });
    if (
      pickedUpStatus &&
      pickupRequest.pickupStatusId.toString() === pickedUpStatus._id.toString()
    ) {
      this.logger.error(
        `${base} cannot cancel picked up pickup ${pickupRequest.reference}`,
      );
      throw new BadRequestException('Cannot cancel a picked up pickup');
    }

    const userId = new Types.ObjectId(this.req.user.userId);
    await this.pickupRequestModel.findOneAndUpdate(
      { _id: pickupRequest._id },
      { pickupStatusId: cancelledStatus._id },
      {
        context: auditContext(this.req, userId),
        returnDocument: 'after',
      } as never,
    );

    // Cancel any associated orders
    const cancelledOrderStatus = await this.orderStatusModel.findOne({
      orderStatusName: OrderStatusEnum.CANCELLED,
    });
    if (cancelledOrderStatus) {
      const associatedOrders = await this.orderModel.find({
        pickupRequestId: pickupRequest._id,
      });

      for (const order of associatedOrders) {
        // Skip if already delivered or cancelled
        const deliveredStatus = await this.orderStatusModel.findOne({
          orderStatusName: OrderStatusEnum.DELIVERED,
        });
        if (
          order.orderStatusId.toString() === cancelledOrderStatus._id.toString()
        ) {
          continue; // Already cancelled
        }
        if (
          deliveredStatus &&
          order.orderStatusId.toString() === deliveredStatus._id.toString()
        ) {
          continue; // Cannot cancel delivered order
        }

        // Update order status to cancelled
        await this.orderModel.findOneAndUpdate(
          { _id: order._id },
          { orderStatusId: cancelledOrderStatus._id },
          {
            context: auditContext(this.req, userId),
            returnDocument: 'after',
          } as never,
        );
        this.logger.log(
          `${base} order ${order.orderCode} cancelled due to pickup cancellation`,
        );
      }
    }

    this.logger.log(`${base} pickup ${pickupRequest.reference} cancelled`);
    return 'Pickup cancelled successfully';
  }
}
