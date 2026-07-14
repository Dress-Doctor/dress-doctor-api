import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as crypto from 'crypto';
import { Model, Types } from 'mongoose';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { RefreshToken } from 'src/schema/user/refresh-token.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';
import { CompleteLoginDto, InitiateLoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';

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

/** Minimal user shape needed to mint tokens (populated or raw doc). */
type TokenUser = Pick<User, '_id' | 'phone'>;

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
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshToken>,
  ) {}

  private async signToken(user: TokenUser, userType: string) {
    return await this.jwtService.signAsync({
      sub: user._id,
      phone: user.phone,
      userType,
      office: this.req.data.officeId?.toString(),
    });
  }

  /** SHA-256 so a stored refresh token can be looked up by value on refresh. */
  private hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Issue a fresh access + refresh pair. The opaque refresh token is returned to
   * the caller once; only its hash is persisted (rotated/revocable at rest).
   */
  private async issueTokens(user: TokenUser, userType: string) {
    const accessToken = await this.signToken(user, userType);

    const refreshToken = crypto.randomBytes(48).toString('hex');
    // Refresh tokens outlive the short access token; rotated on every use.
    const ttlDays = Number(process.env.JWT_REFRESH_TTL_DAYS) || 30;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await this.refreshTokenModel.create({
      userId: user._id,
      tokenHash: this.hashRefreshToken(refreshToken),
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  private async resolveUserType(userId: Types.ObjectId): Promise<string> {
    const user = await this.userModel.findById(userId).populate<{
      userTypeId: UserType;
    }>({ model: UserType.name, path: 'userTypeId' });
    return user?.userTypeId?.userTypeName ?? '';
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

    const foundedUser = await this.userModel
      .findOne({ phone: data.identifier })
      .populate<{ userTypeId: UserType }>({
        model: UserType.name,
        path: 'userTypeId',
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
    const userType = foundedUser.userTypeId?.userTypeName ?? '';
    const { accessToken, refreshToken } = await this.issueTokens(
      foundedUser,
      userType,
    );

    this.logger.log(`[${platform}] ${data.identifier} have successfully login`);
    return { accessToken, refreshToken, message: 'Login successful' };
  }

  /**
   * Rotate a refresh token: validate the presented token, revoke it, and issue a
   * fresh access + refresh pair. A revoked/expired/unknown token is rejected.
   */
  async refresh(data: RefreshTokenDto) {
    const platform = this.req.data.platform;
    const tokenHash = this.hashRefreshToken(data.refreshToken);

    const stored = await this.refreshTokenModel.findOne({ tokenHash });
    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt.getTime() <= Date.now()
    ) {
      this.logger.error(`[${platform}] refresh presented an invalid token`);
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token',
      });
    }

    const user = await this.userModel.findById(stored.userId);
    if (!user || !user.isActive) {
      this.logger.error(
        `[${platform}] refresh for missing/inactive user ${stored.userId.toString()}`,
      );
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token',
      });
    }

    const userType = await this.resolveUserType(stored.userId);
    const tokens = await this.issueTokens(user, userType);

    stored.revokedAt = new Date();
    stored.replacedByTokenHash = this.hashRefreshToken(tokens.refreshToken);
    await stored.save();

    this.logger.log(`[${platform}] ${user.phone} rotated a refresh token`);
    return tokens;
  }

  /** Revoke a single refresh token (idempotent — unknown tokens are a no-op). */
  async logout(data: RefreshTokenDto) {
    const tokenHash = this.hashRefreshToken(data.refreshToken);
    await this.refreshTokenModel.updateOne(
      { tokenHash, revokedAt: { $exists: false } },
      { revokedAt: new Date() },
    );
    return { message: 'Logged out successfully' };
  }

  /** The authenticated caller's own identity + resolved CASL abilities. */
  async me() {
    const { userId, ability } = this.req.user;
    const user = await this.userModel
      .findById(userId)
      .select('-passwordHash')
      .populate<{ userTypeId: UserType }>({
        model: UserType.name,
        path: 'userTypeId',
      });

    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Session is no longer valid',
      });
    }

    return { user, abilities: ability.rules };
  }
}
