import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';
import { CompleteLoginDto, InitiateLoginDto } from './dto/login.dto';

import { REQUEST } from '@nestjs/core';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import { OtpService } from 'src/helper/service/otp.service';
import { OTPChannelEnum, OTPPurposeEnum } from 'src/schema/otp/otp.dto';
import { UserTypeEum } from 'src/schema/user/user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { Customer } from 'src/schema/user/customer.schema';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly codeService: CodeGeneratorService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(UserType.name) private readonly userTypeModel: Model<UserType>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
  ) {}

  private async signToken(user: User) {
    return await this.jwtService.signAsync({
      sub: user._id,
      phone: user.phone,
    });
  }

  async initiateLogin(data: InitiateLoginDto) {
    const platform = this.req.data.platform;
    const foundedUser = await this.userModel
      .findOne({ phone: data.phone })
      .populate<{
        userTypeId: UserType;
      }>({ model: UserType.name, path: 'userTypeId' });

    if (!foundedUser) {
      this.logger.error(`[${platform}] This user ${data.phone} doesn't exists`);
      throw new BadRequestException('Invalid login credentials');
    }

    if (foundedUser && !foundedUser.isActive) {
      this.logger.error(
        `[${platform}] This account ${data.phone} has been deactivate`,
      );
      throw new BadRequestException(
        'Your account has been deactivated. Please contact admin',
      );
    }

    const otpCode = await this.otpService.requestOtp({
      identifier: data.phone,
      purpose: OTPPurposeEnum.LOGIN,
      channel: OTPChannelEnum.WHATSAPP,
    });

    const res = {
      otpRef: otpCode.otpRef,
      expiresAt: otpCode.expiresAt,
      message: 'We have sent you a code to verify your phone.',
    };

    if (
      foundedUser.userTypeId.userTypeName === UserTypeEum.CUSTOMER.toString()
    ) {
      this.logger.log(
        `[${platform}] OTP verification code ${otpCode.code} send to ${data.phone}`,
      );
      return res;
    }

    const isValid = await this.codeService.verifyHash(
      data.password!,
      foundedUser.passwordHash,
    );
    if (!isValid) {
      this.logger.error(
        `[${platform}] This user ${data.phone} sent the wrong password`,
      );
      throw new BadRequestException('Invalid login credentials');
    }

    this.logger.log(
      `[${platform}] OTP verification code ${otpCode.code} send to ${data.phone}`,
    );
    return res;
  }

  async completeLogin(data: CompleteLoginDto) {
    const platform = this.req.data.platform;

    const foundedUser = await this.userModel.findOne({
      phone: data.identifier,
    });
    if (!foundedUser) {
      this.logger.error(
        `[${platform}] This user ${data.identifier} doesn't exists.`,
      );
      throw new BadRequestException(`Invalid ${data.identifier}`);
    }

    await this.otpService.verifyOtp(data);
    const token = await this.signToken(foundedUser);

    this.logger.log(`[${platform}] ${data.identifier} have successfully login`);
    return { accessToken: token, message: 'Login successful' };
  }

  async createNewUser(data: CreateUserDto) {
    // todo: check for duplicate email
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

    const newUser = await this.userModel.findOneAndUpdate(
      { phone: data.phone },
      { ...data, userTypeId },
      { context: { changedBy: userId }, upsert: true, new: true } as never,
    );

    if (userTypeExists.userTypeName === UserTypeEum.CUSTOMER.toString()) {
      // Create new customer document
      const referralCode = await this.codeService.generateReferralCode();
      await this.customerModel.findOneAndUpdate(
        { userId: (newUser as unknown as User)._id },
        { referralCode, userId: (newUser as unknown as User)._id },
        { context: { changedBy: userId }, upsert: true, new: true } as never,
      );
    }

    this.logger.log(
      `[${platform}] ${phone} has successfully created a new user with type ${userTypeExists.userTypeName}.`,
    );

    return 'User successfully created';
  }
}
