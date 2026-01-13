import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';
import { LoginDto } from './dto/login.dto';

import { MergeType } from 'mongoose';
import { AppRequest } from 'src/dto/request-data.dto';
import { OtpService } from 'src/helper/service/otp.service';
import { OTPChannelEnum, OTPPurposeEnum } from 'src/schema/otp/otp.dto';
import { UserTypeEum } from 'src/schema/user/user.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly codeService: CodeGeneratorService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  private async signToken(user: MergeType<User, { userTypeId: UserType }>) {
    return await this.jwtService.signAsync({
      sub: user._id,
      phone: user.phone,
    });
  }

  async login(data: LoginDto, req: AppRequest['data']) {
    const platform = req.platform;
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
      isUsed: false,
      purpose: otpCode.purpose,
      channel: otpCode.channel,
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
      data.password,
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
}
