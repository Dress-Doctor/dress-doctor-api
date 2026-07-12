import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
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

/** Just the user fields OTP delivery needs — works for populated or raw docs. */
type OtpTarget = Pick<User, 'phone' | 'firstName' | 'email' | 'whatsappPhone'>;

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

  /**
   * Resolve the destination the OTP must be sent to for the requested channel.
   * WhatsApp OTPs target `whatsappPhone`, email OTPs target `email` — fixing the
   * prior bug where every channel was routed to `email`. The WhatsApp *send path*
   * (approved template + processor) is Phase 2; until then the notification queue
   * delivers over the existing email/console channel, but the recipient the OTP is
   * addressed to is now channel-correct.
   */
  private resolveOtpRecipient(user: OtpTarget, channel: OTPChannelEnum) {
    const address =
      channel === OTPChannelEnum.EMAIL ? user.email : user.whatsappPhone;

    if (!address) {
      const missing =
        channel === OTPChannelEnum.EMAIL ? 'email' : 'WhatsApp number';
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: `No ${missing} is configured for this account.`,
      });
    }

    return { name: user.firstName, address };
  }

  /**
   * Issue a LOGIN OTP and enqueue its delivery. The generated code is never
   * logged (CLAUDE.md §12 / Phase 1 §3.1). Shared by the customer (OTP-only) and
   * staff (post-password) branches so there is a single issuance path.
   */
  private async issueLoginOtp(user: OtpTarget, channel: OTPChannelEnum) {
    const year = new Date().getFullYear();
    const { supportEmail, supportPhones } = appConfig;

    const recipient = this.resolveOtpRecipient(user, channel);

    const otpCode = await this.otpService.requestOtp({
      identifier: user.phone,
      channel,
      purpose: OTPPurposeEnum.LOGIN,
    });

    await this.notificationService.addToQueue({
      variables: {
        supportEmail,
        supportPhones,
        code: otpCode.code,
        year: year.toString(),
        firstName: user.firstName,
        minutes: otpCode.minutes.toString(),
      },
      language: LanguageEum.EN,
      otpChannel: channel,
      templateName: NotificationTemplateNameEnum.LOGIN_VERIFICATION_CODE,
      recipients: [recipient],
    });

    return {
      otpRef: otpCode.otpRef,
      expiresAt: otpCode.expiresAt,
      message: 'We have sent you a code to verify your account.',
    };
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
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid login credentials',
      });
    }

    if (!foundedUser.isActive) {
      this.logger.error(
        `[${platform}] This account ${data.phone} has been deactivated`,
      );
      throw new ForbiddenException({
        code: 'ACCOUNT_INACTIVE',
        message: 'Your account has been deactivated. Please contact admin',
      });
    }

    const isCustomer =
      foundedUser.userTypeId.userTypeName === UserTypeEum.CUSTOMER.toString();

    // Staff are 2FA: password is checked before an OTP is ever issued.
    if (!isCustomer) {
      if (!data.password) {
        this.logger.error(`[${platform}] Staff ${data.phone} sent no password`);
        throw new UnauthorizedException({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid login credentials',
        });
      }

      const isValid = await this.codeService.verifyHash(
        data.password,
        foundedUser.passwordHash,
      );
      if (!isValid) {
        this.logger.error(
          `[${platform}] This user ${data.phone} sent the wrong password`,
        );
        throw new UnauthorizedException({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid login credentials',
        });
      }
    }

    return await this.issueLoginOtp(foundedUser, data.otpChannel);
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
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid login credentials',
      });
    }

    await this.otpService.verifyOtp(data);
    const token = await this.signToken(foundedUser);

    this.logger.log(`[${platform}] ${data.identifier} have successfully login`);
    return { accessToken: token, message: 'Login successful' };
  }
}
