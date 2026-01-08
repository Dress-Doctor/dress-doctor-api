import { Injectable, Logger } from '@nestjs/common';
import { CreatePickupDto } from './dto/create-pickup.dto';
import { UpdatePickupDto } from './dto/update-pickup.dto';
import { InjectModel } from '@nestjs/mongoose';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { Model } from 'mongoose';
import { User } from 'src/schema/user/user.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { UserType } from 'src/schema/user/user-type.schema';
import { UserTypeEum } from 'src/schema/user/user.dto';
import { OfficeType } from 'src/schema/office/office-type.schema';
import { OfficeTypeEnum } from 'src/schema/office/office.dto';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { PickupStatusEnum } from 'src/schema/pickup/pickup.dto';

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

  async create(data: CreatePickupDto) {
    const { pickupAddress, pickupTime, pickupDate, ...newUserPayload } = data;
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

    const pickupStatus = await this.pickupStatusModel.findOne({
      pickupStatusName: PickupStatusEnum.PENDING,
    });

    // Create pickup
    const newPickupRequest = await this.pickupRequestModel.create({
      pickupTime,
      pickupDate,
      pickupAddress,
      customerId: foundedCustomer._id,
      pickupStatusId: pickupStatus?._id,
    });

    return foundedUser;
  }

  findAll() {
    return `This action returns all pickup`;
  }

  findOne(id: number) {
    return `This action returns a #${id} pickup`;
  }

  update(id: number, updatePickupDto: UpdatePickupDto) {
    return `This action updates a #${id} pickup`;
  }

  remove(id: number) {
    return `This action removes a #${id} pickup`;
  }
}
