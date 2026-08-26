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
import { maskPhone } from 'src/helper/pii';
import { phoneQuery } from 'src/helper/phone';

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

  /**
   * Resolve a login identifier (phone or email) to the user lookup query and the
   * OTP channel it implies: an email logs in over email, a phone over WhatsApp.
   */
  private resolveLoginIdentity(identifier: string): {
    channel: OTPChannelEnum;
    query: Record<string, unknown>;
  } {
    if (identifier.includes('@')) {
      return { channel: OTPChannelEnum.EMAIL, query: { email: identifier } };
    }

    /**
     * Matched against every stored spelling, not one: phones are now kept with
     * their country code, while rows written before that carry bare national
     * digits. Somebody signing in with the 9 digits they have always typed must
     * still find their account, whether or not the backfill has been run.
     */
    return {
      channel: OTPChannelEnum.WHATSAPP,
      query: { phone: phoneQuery(identifier) },
    };
  }

  /**
   * Resolve a login identifier to an authenticated user + its OTP channel:
   * verify the account exists and is active, and (for staff) that the password
   * is valid. Shared by initiate-login and resend-otp so both gate identically.
   */
  private async authenticateForOtp(data: InitiateLoginDto) {
    const platform = this.req.data.platform;
    const { channel, query } = this.resolveLoginIdentity(data.identifier);

    const foundedUser = await this.userModel.findOne(query).populate<{
      userTypeId: UserType;
    }>({ model: UserType.name, path: 'userTypeId' });

    if (!foundedUser) {
      this.logger.warn(
        `[${platform}] login for unknown identifier ${maskPhone(data.identifier)}`,
      );
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid login credentials',
      });
    }

    if (!foundedUser.isActive) {
      this.logger.warn(
        `[${platform}] login for deactivated account ${maskPhone(data.identifier)}`,
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
        this.logger.warn(
          `[${platform}] staff ${maskPhone(data.identifier)} sent no password`,
        );
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
        this.logger.warn(
          `[${platform}] wrong password for ${maskPhone(data.identifier)}`,
        );
        throw new UnauthorizedException({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid login credentials',
        });
      }
    }

    return { user: foundedUser, channel };
  }

  async initiateLogin(data: InitiateLoginDto) {
    const { user, channel } = await this.authenticateForOtp(data);
    return await this.issueLoginOtp(user, channel);
  }

  /**
   * Re-issue a fresh LOGIN OTP for an identifier that already passed
   * initiate-login. Re-authenticates through the same gate (staff still need
   * their password); per-identifier request cool-downs in OtpService throttle
   * abuse. The previously issued code stays valid until it expires.
   */
  async resendOtp(data: InitiateLoginDto) {
    const { user, channel } = await this.authenticateForOtp(data);
    return await this.issueLoginOtp(user, channel);
  }

  async completeLogin(data: CompleteLoginDto) {
    const platform = this.req.data.platform;
    const { query } = this.resolveLoginIdentity(data.identifier);

    const foundedUser = await this.userModel.findOne(query).populate<{
      userTypeId: UserType;
    }>({ model: UserType.name, path: 'userTypeId' });
    if (!foundedUser) {
      this.logger.warn(
        `[${platform}] verify for unknown identifier ${maskPhone(data.identifier)}`,
      );
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid login credentials',
      });
    }

    // OTP is keyed by the user's phone (issueLoginOtp), regardless of whether the
    // caller logged in with a phone or an email — verify against that.
    await this.otpService.verifyOtp({
      code: data.code,
      otpRef: data.otpRef,
      identifier: foundedUser.phone,
    });
    const userType = foundedUser.userTypeId?.userTypeName ?? '';
    const { accessToken, refreshToken } = await this.issueTokens(
      foundedUser,
      userType,
    );

    this.logger.log(
      `[${platform}] ${maskPhone(data.identifier)} have successfully login`,
    );
    return { accessToken, refreshToken, message: 'Login successful' };
  }

  /**
   * Rotate a refresh token: validate the presented token, revoke it, and issue a
   * fresh access + refresh pair. Unknown/expired tokens are rejected. Replaying a
   * token that was already rotated (revoked) is treated as a breach: the user's
   * entire live refresh-token chain is revoked so a stolen token can't be reused.
   */
  async refresh(refreshToken: string) {
    const platform = this.req.data.platform;
    const tokenHash = this.hashRefreshToken(refreshToken);
    const invalid = new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Invalid or expired refresh token',
    });

    const stored = await this.refreshTokenModel.findOne({ tokenHash });
    if (!stored) {
      this.logger.warn(`[${platform}] refresh presented an unknown token`);
      throw invalid;
    }

    // Reuse detection: a revoked token being replayed means the chain leaked.
    if (stored.revokedAt) {
      await this.refreshTokenModel.updateMany(
        { userId: stored.userId, revokedAt: { $exists: false } },
        { revokedAt: new Date() },
      );
      this.logger.error(
        `[${platform}] refresh-token reuse detected for user ${stored.userId.toString()} — revoked live chain`,
      );
      throw invalid;
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      this.logger.warn(`[${platform}] refresh presented an expired token`);
      throw invalid;
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

    this.logger.log(
      `[${platform}] ${maskPhone(user.phone)} rotated a refresh token`,
    );
    return tokens;
  }

  /** Revoke a single refresh token (idempotent — unknown tokens are a no-op). */
  async logout(refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);
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
