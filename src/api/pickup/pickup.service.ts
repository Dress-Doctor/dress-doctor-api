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
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { OfficeType } from 'src/schema/office/office-type.schema';
import { Office } from 'src/schema/office/office.schema';
import { PickupAssignment } from 'src/schema/pickup/pickup-assignment.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { PickupStatusEnum } from 'src/schema/pickup/pickup.dto';
import { Customer } from 'src/schema/user/customer.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { UserTypeEum } from 'src/schema/user/user.dto';
import { User } from 'src/schema/user/user.schema';
import { AssignPickupDto } from './dto/assign-pickup.dto';
import { CreatePickupDto } from './dto/create-pickup.dto';
import { FindPickupDto } from './dto/find-pickup.dto';

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

    private readonly codeService: CodeGeneratorService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(UserType.name) private readonly userTypeModel: Model<UserType>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
  ) {}

  async schedulePickup(data: CreatePickupDto) {
    const { platform, apiClientId, officeId } = this.req.data;
    const userType = await this.userTypeModel.findOne({
      userTypeName: UserTypeEum.CUSTOMER,
    });

    // Create or update user
    const foundedUser = await this.userModel.findOneAndUpdate(
      { phone: data.phone },
      { ...data, userTypeId: userType!._id },
      { upsert: true, new: true },
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
          context: { changedBy: foundedUser._id },
          upsert: true,
          new: true,
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
          context: { changedBy: foundedUser._id },
          upsert: true,
          new: true,
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

  async assignPickup(data: AssignPickupDto) {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;
    const userId = new Types.ObjectId(this.req.user.userId);

    if (!ability.can('ASSIGN', 'PickupAssignment')) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} ${log}`);
      throw new BadRequestException(`You are ${log}`);
    }

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

    const pendingPickupStatus = await this.pickupStatusModel.findOne({
      pickupStatusName: PickupStatusEnum.PENDING,
    });

    const pickupRequestExists = await this.pickupRequestModel.findOne({
      _id: data.pickupRequestId,
      pickupStatusId: pendingPickupStatus?._id,
    });

    if (!pickupRequestExists) {
      const log = `This pickup request is no longer pending and cannot be assigned.`;
      this.logger.error(`[${platform}] ${phone} ${log}`);
      throw new BadRequestException(log);
    }

    await this.pickupAssignmentModel.findOneAndUpdate(
      { agentId: userExists._id, pickupRequestId: pickupRequestExists._id },
      {
        agentId: userExists._id,
        assignedAt: data.assignedAt ?? new Date(),
        pickupRequestId: pickupRequestExists._id,
      },
      { context: { changedBy: userId }, upsert: true, new: true } as never,
    );

    const assignedPickupStatus = await this.pickupStatusModel.findOne({
      pickupStatusName: PickupStatusEnum.ASSIGNED,
    });
    await this.pickupRequestModel.findOneAndUpdate(
      { _id: pickupRequestExists._id },
      { pickupStatusId: assignedPickupStatus!._id },
      { context: { changedBy: userId }, upsert: true, new: true } as never,
    );

    this.logger.log(
      `[${platform}] ${phone} pickup-request successfully assigned to ${userExists.phone}`,
    );
    return 'Pickup request successfully assigned';
  }

  async findAllPickup({ page, size, ...query }: FindPickupDto) {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;

    if (!ability.can('READ', 'PickupRequest')) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} ${log}`);
      throw new BadRequestException(`You are ${log}`);
    }

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
}
