import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';
import { CompleteLoginDto, InitiateLoginDto } from './dto/login.dto';

import { REQUEST } from '@nestjs/core';
import appConfig from 'src/config/app-config';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import { NotificationService } from 'src/helper/service/notification.service';
import { OtpService } from 'src/helper/service/otp.service';
import {
  LanguageEum,
  NotificationTemplateNameEnum,
} from 'src/schema/notification/notification.dto';
import { OTPChannelEnum, OTPPurposeEnum } from 'src/schema/otp/otp.dto';
import { UserTypeEum } from 'src/schema/user/user.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly codeService: CodeGeneratorService,
    private readonly notificationService: NotificationService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  private async signToken(user: User) {
    return await this.jwtService.signAsync({
      sub: user._id,
      phone: user.phone,
    });
  }

  async initiateLogin(data: InitiateLoginDto) {
    const platform = this.req.data.platform;
    const year = new Date().getFullYear();
    const { supportEmail, supportPhones } = appConfig;

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

    // OTP CHANNEL
    const email = foundedUser.email;
    const whatsapp = foundedUser.whatsappPhone;
    const isEmail = data.otpChannel === OTPChannelEnum.EMAIL;
    if (isEmail && !email) {
      const errorMessage =
        'No email is configured for this account. Please use WhatsApp to receive the OTP.';

      this.logger.error(
        `[${platform}] Email OTP requested but no email configured for user ${data.phone}`,
      );

      throw new BadRequestException(errorMessage);
    }

    if (
      foundedUser.userTypeId.userTypeName === UserTypeEum.CUSTOMER.toString()
    ) {
      const otpCode = await this.otpService.requestOtp({
        identifier: data.phone,
        channel: data.otpChannel,
        purpose: OTPPurposeEnum.LOGIN,
      });

      this.logger.log(
        `[${platform}] OTP verification code ${otpCode.code} send to ${isEmail ? email : whatsapp}`,
      );

      await this.notificationService.addToQueue({
        variables: {
          supportEmail,
          supportPhones,
          code: otpCode.code,
          year: year.toString(),
          firstName: foundedUser.firstName,
          minutes: otpCode.minutes.toString(),
        },
        language: LanguageEum.EN,
        otpChannel: data.otpChannel,
        templateName: NotificationTemplateNameEnum.LOGIN_VERIFICATION_CODE,
        recipients: [
          { name: foundedUser.firstName, address: foundedUser.email! },
        ],
      });
      return {
        otpRef: otpCode.otpRef,
        expiresAt: otpCode.expiresAt,
        message: 'We have sent you a code to verify your account.',
      };
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

    const otpCode = await this.otpService.requestOtp({
      identifier: data.phone,
      channel: data.otpChannel,
      purpose: OTPPurposeEnum.LOGIN,
    });

    this.logger.log(
      `[${platform}] OTP verification code ${otpCode.code} send to ${isEmail ? email : whatsapp}`,
    );

    await this.notificationService.addToQueue({
      variables: {
        supportEmail,
        supportPhones,
        code: otpCode.code,
        year: year.toString(),
        firstName: foundedUser.firstName,
        minutes: otpCode.minutes.toString(),
      },
      language: LanguageEum.EN,
      otpChannel: data.otpChannel,
      templateName: NotificationTemplateNameEnum.LOGIN_VERIFICATION_CODE,
      recipients: [
        { name: foundedUser.firstName, address: foundedUser.email! },
      ],
    });

    return {
      otpRef: otpCode.otpRef,
      expiresAt: otpCode.expiresAt,
      message: 'We have sent you a code to verify your account.',
    };
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
}
