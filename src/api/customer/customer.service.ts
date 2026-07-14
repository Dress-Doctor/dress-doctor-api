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
import { Model, PipelineStage, Types } from 'mongoose';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { scopeFilter } from 'src/helper/casl/casl-scope';
import { maskPhone } from 'src/helper/pii';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Customer } from 'src/schema/user/customer.schema';
import { followUpSchemaName } from 'src/schema/follow-up/follow-up.schema';
import { Referral } from 'src/schema/user/referral.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { UserTypeEum } from 'src/schema/user/user.dto';
import { User } from 'src/schema/user/user.schema';
import { FindCustomerDto } from './dto/find-customer.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';

// Canonical "inactive" threshold until the settings collection lands (§19).
export const DEFAULT_INACTIVE_DAYS = 14;

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    private readonly codeService: CodeGeneratorService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(UserType.name) private readonly userTypeModel: Model<UserType>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(Referral.name) private readonly referralModel: Model<Referral>,
  ) {}

  private can(action: CaslActionsDto, subject: CaslSubjectsDto) {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;

    if (!ability.can(action, subject)) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} is ${log}`);
      throw new BadRequestException(`You are ${log}`);
    }
  }

  /**
   * Register a customer: creates the `User`(customer) + its 1:1 `Customer`
   * profile with a generated customerCode and the customer's own referralCode.
   * A supplied `referralCode` links `referredBy` and opens a PENDING referral.
   */
  async register(data: RegisterCustomerDto) {
    this.can('CREATE', 'Customer');
    const platform = this.req.data.platform;
    const actorId = new Types.ObjectId(this.req.user.userId);
    const base = `[${platform}] ${this.req.user.phone}`;

    const customerType = await this.userTypeModel.findOne({
      userTypeName: UserTypeEum.CUSTOMER.toString(),
    });
    if (!customerType) {
      this.logger.error(`${base} CUSTOMER user type not seeded`);
      throw new BadRequestException('Customer user type not configured');
    }

    const phoneTaken = await this.userModel.exists({ phone: data.phone });
    if (phoneTaken) {
      this.logger.warn(`${base} phone ${maskPhone(data.phone)} already exists`);
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A user with this phone already exists',
      });
    }

    if (data.email) {
      const emailTaken = await this.userModel.exists({ email: data.email });
      if (emailTaken) {
        this.logger.warn(`${base} email already taken`);
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'The provided email has been taken',
        });
      }
    }

    // Resolve the referrer (if any) before creating anything.
    let referrer: Customer | null = null;
    if (data.referralCode) {
      referrer = await this.customerModel.findOne({
        referralCode: data.referralCode,
      });
      if (!referrer) {
        this.logger.error(`${base} unknown referral code ${data.referralCode}`);
        throw new BadRequestException({
          code: 'INVALID_REFERRAL_CODE',
          message: 'The referral code is not valid',
        });
      }
    }

    const user = new this.userModel({
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      whatsappPhone: data.whatsappPhone,
      email: data.email,
      gender: data.gender,
      userTypeId: customerType._id,
    });
    user.$locals.changedBy = actorId;
    await user.save();

    let referredBy: Types.ObjectId | undefined;
    if (referrer) {
      const referral = new this.referralModel({
        referrerId: referrer.userId,
        referredUserId: user._id,
      });
      referral.$locals.changedBy = actorId;
      await referral.save();
      referredBy = referral._id;
    }

    const [customerCode, referralCode] = await Promise.all([
      this.codeService.generateCustomerCode(),
      this.codeService.generateReferralCode(),
    ]);

    const customer = new this.customerModel({
      userId: user._id,
      customerCode,
      referralCode,
      pickupAddress: data.pickupAddress,
      homeOfficeId: data.homeOfficeId
        ? new Types.ObjectId(data.homeOfficeId)
        : undefined,
      referredBy,
    });
    customer.$locals.changedBy = actorId;
    await customer.save();

    this.logger.log(`${base} registered customer ${customerCode}`);
    return { customerCode, referralCode };
  }

  async findAll({ page, size, ...query }: FindCustomerDto) {
    this.can('READ', 'Customer');

    const match: Record<string, unknown> = {};
    if (query.homeOfficeId)
      match.homeOfficeId = new Types.ObjectId(query.homeOfficeId);

    if (query.inactiveDays) {
      const threshold = new Date(
        Date.now() - query.inactiveDays * 24 * 60 * 60 * 1000,
      );
      // Never-ordered customers count as inactive too.
      match.$or = [
        { lastOrderAt: { $lte: threshold } },
        { lastOrderAt: { $exists: false } },
      ];
    }

    const userMatch: Record<string, unknown> = {};
    if (query.q) {
      const rx = new RegExp(this.appUtilService.escapeRegex(query.q), 'i');
      userMatch.$or = [
        { 'user.firstName': rx },
        { 'user.lastName': rx },
        { 'user.phone': rx },
      ];
    }

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $lookup: {
          from: 'user',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $match: userMatch },
    ];

    // Inactive view (§2.4): attach the latest follow-up so the list shows
    // whether CS was already alerted and whether it's resolved.
    if (query.inactiveDays) {
      pipeline.push(
        {
          $lookup: {
            from: followUpSchemaName,
            let: { cid: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$customerId', '$$cid'] } } },
              { $sort: { triggeredAt: -1 } },
              { $limit: 1 },
            ],
            as: 'followUp',
          },
        },
        { $addFields: { followUp: { $arrayElemAt: ['$followUp', 0] } } },
      );
    }

    const countResult = await this.customerModel.aggregate<{ total: number }>([
      ...pipeline,
      { $count: 'total' },
    ]);
    const total = countResult[0]?.total ?? 0;

    const data = await this.customerModel.aggregate([
      ...pipeline,
      { $sort: sort },
      { $skip: skip },
      { $limit: size },
    ]);

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;
    return { total, data, nextPage };
  }

  /**
   * Customers inactive for at least `inactiveDays` (default 14). Threshold
   * should come from `settings` once that collection exists (§19) — defaulted
   * for now. Follow-up status is Phase 2 (WhatsApp job + follow-ups log).
   */
  async findInactive(query: FindCustomerDto) {
    const inactiveDays = query.inactiveDays ?? DEFAULT_INACTIVE_DAYS;
    return this.findAll({ ...query, inactiveDays });
  }

  async findOne(id: string) {
    this.can('READ', 'Customer');
    // Self-scope: a customer/affiliate reading another user's profile is filtered
    // out by the seeded { userId: '$self' } condition — the record simply isn't
    // found. Staff/global roles are unrestricted.
    const scope = scopeFilter(this.req.user.ability, 'READ', 'Customer');
    const customer = await this.customerModel
      .findOne({ _id: new Types.ObjectId(id), ...scope })
      .populate({ model: User.name, path: 'userId', select: '-passwordHash' });

    if (!customer) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Customer not found',
      });
    }
    return customer;
  }
}
