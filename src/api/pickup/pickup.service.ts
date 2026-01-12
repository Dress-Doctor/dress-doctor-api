import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { PickupStatusEnum } from 'src/schema/pickup/pickup.dto';
import { Customer } from 'src/schema/user/customer.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { UserTypeEum } from 'src/schema/user/user.dto';
import { User } from 'src/schema/user/user.schema';
import { NewPickupDto } from './dto/create-pickup.dto';

@Injectable()
export class PickupService {
  private readonly logger = new Logger(PickupRequest.name);

  constructor(
    @InjectModel(UserType.name) private readonly userTypeModel: Model<UserType>,
    @InjectModel(PickupStatus.name)
    private readonly pickupStatusModel: Model<PickupStatus>,
    @InjectModel(PickupRequest.name)
    private readonly pickupRequestModel: Model<PickupRequest>,
    private readonly codeService: CodeGeneratorService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
  ) {}

  async create(data: NewPickupDto) {
    const {
      officeId,
      pickupAddress,
      pickupTime,
      pickupDate,
      ...newUserPayload
    } = data;
    const userType = await this.userTypeModel.findOne({
      userTypeName: UserTypeEum.CUSTOMER,
    });

    // Create or update user
    const foundedUser = await this.userModel.findOneAndUpdate(
      { phone: data.phone },
      { ...newUserPayload, userTypeId: userType?._id },
      { upsert: true, new: true },
    );

    // Check if customer document exist
    let foundedCustomer = await this.customerModel.findOne({
      userId: foundedUser._id,
    });

    if (!foundedCustomer) {
      // Create new customer document
      const referralCode = await this.codeService.generateReferralCode();
      foundedCustomer = await this.customerModel.create({
        referralCode,
        userId: foundedUser._id,
      });
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
        `${data.phone} already have another request in progress.`,
      );
      throw new BadRequestException(
        'You already have another request in progress. Please be patient, we will call you.',
      );
    }
    // Create pickup
    const newPickupRequest = await this.pickupRequestModel.create({
      pickupTime,
      pickupDate,
      pickupAddress,
      customerId: foundedUser._id,
      officeId: new Types.ObjectId(officeId),
      pickupStatusId: pendingPickupStatus!._id,
    });

    const customerInfo = await this.customerModel
      .findById(foundedCustomer._id)
      .populate({
        model: User.name,
        path: 'userId',
        populate: { model: UserType.name, path: 'userTypeId' },
      });

    this.logger.log(`${data.phone} has successfully schedule a pickup`);
    return { customer: customerInfo, pickupRequest: newPickupRequest };
  }
}
