import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { InjectModel } from '@nestjs/mongoose';
import { User } from 'src/schema/user/user.schema';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { UserType } from 'src/schema/user/user-type.schema';
import {
  OTPChannelEnum,
  OTPPurposeEnum,
  UserTypeEum,
} from 'src/schema/user/user.dto';
import { OtpCode } from 'src/schema/user/otp-code.schema';
import { MergeType } from 'mongoose';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly codeService: CodeGeneratorService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(OtpCode.name) private readonly otpModel: Model<OtpCode>,
  ) {}

  private async signToken(user: MergeType<User, { userTypeId: UserType }>) {
    return await this.jwtService.signAsync({
      sub: user._id,
      phone: user.phone,
    });
  }

  async login(data: LoginDto) {
    const foundedUser = await this.userModel
      .findOne({ phone: data.phone })
      .populate<{
        userTypeId: UserType;
      }>({ model: UserType.name, path: 'userTypeId' });

    if (!foundedUser) {
      this.logger.error(`This user ${data.phone} doesn't exists`);
      throw new BadRequestException('Invalid login credentials');
    }

    if (foundedUser && !foundedUser.isActive) {
      this.logger.error(`This account ${data.phone} has been deactivate`);
      throw new BadRequestException(
        'Your account has been deactivated. Please contact admin',
      );
    }

    const otpCode = await this.codeService.generateOtpCode();
    const newOtpCode = await this.otpModel.create({
      code: otpCode,
      isUsed: false,
      userId: foundedUser._id,
      purpose: OTPPurposeEnum.LOGIN,
      channel: OTPChannelEnum.WHATSAPP,
      expiredAt: new Date(Date.now() + 1000 * 60 * 5), // 5min
    });

    const res = {
      isUsed: false,
      purpose: OTPPurposeEnum.LOGIN,
      expiredAt: newOtpCode.expiredAt,
      channel: OTPChannelEnum.WHATSAPP,
      message: 'We have sent you a code to verify your phone.',
    };

    if (
      foundedUser.userTypeId.userTypeName === UserTypeEum.CUSTOMER.toString()
    ) {
      this.logger.log(`OTP verification code ${otpCode} send to ${data.phone}`);
      return res;
    }

    const isValid = await this.codeService.verifyHash(
      data.password,
      foundedUser.passwordHash,
    );
    if (!isValid) {
      this.logger.error(`This user ${data.phone} sent the wrong password`);
      throw new BadRequestException('Invalid login credentials');
    }

    this.logger.log(`OTP verification code ${otpCode} send to ${data.phone}`);
    return res;
  }
}
