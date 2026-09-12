import { ForbiddenError, MongoAbility } from '@casl/ability';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'crypto';
import { Model } from 'mongoose';
import appConfig from 'src/config/app-config';
import { type AppRequest } from 'src/dto/request-data.dto';
import { PermissionActionEnum, SubjectEnum } from 'src/schema/admin/admin.dto';
import { OtpRequest, OtpRequestDoc } from 'src/schema/otp/otp-request.schema';
import {
  OtpSecurityState,
  OtpSecurityStateDoc,
} from 'src/schema/otp/otp-security-state.schema';
import {
  OTPPurposeEnum,
  RequestOtpDto,
  VerifyOtpDto,
} from 'src/schema/otp/otp.dto';
import { AppAbilityDto, ConditionsDto } from '../casl/casl.dto';
import { maskPhone } from '../pii';
import { CodeGeneratorService } from './code-generator.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly expiredCode = 'Invalid or expired verification code';
  private readonly accountLocked = 'account has been locked due to OTP abuse';
  private readonly BASE_COOL_DOWN_MINUTES = appConfig.otpBaseCoolDownMin;

  constructor(
    private readonly codeService: CodeGeneratorService,
    @Inject(REQUEST) private readonly request: AppRequest,
    @InjectModel(OtpSecurityState.name)
    private readonly otpSecurityStateModel: Model<OtpSecurityStateDoc>,

    @InjectModel(OtpRequest.name)
    private readonly otpRequestModel: Model<OtpRequestDoc>,
  ) {}

  private normalize(value: string) {
    return value.trim().toLowerCase();
  }

  /**
   * A six-digit code, from the system's cryptographic random source.
   *
   * `Math.random()` is not one: its output comes from a seeded generator that
   * can be predicted from enough earlier values, which is not a property a
   * sign-in code may have. `randomInt` takes an exclusive upper bound, so the
   * range is 100000-999999 and the result is always six digits.
   */
  private generateCode() {
    return randomInt(100000, 1000000).toString();
  }

  private addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000);
  }

  private async getOrCreateState(data: RequestOtpDto) {
    return this.otpSecurityStateModel.findOneAndUpdate(
      data,
      { $setOnInsert: data },
      { returnDocument: 'after', upsert: true },
    );
  }

  private getWaitTime(expiresAt: Date) {
    const now = new Date();
    const remainingTimeInSeconds = Math.ceil(
      (expiresAt.getTime() - now.getTime()) / 1000,
    );
    return Math.ceil(remainingTimeInSeconds / 60);
  }

  private getCoolDownMinutes(level: number): number {
    return this.BASE_COOL_DOWN_MINUTES * Math.pow(2, level - 1);
  }

  /**
   * Refuse the attempt outright while a verify cool-down is running.
   *
   * This used to sit inside `handleFailure`, which runs only once a code has
   * been found wrong — so a correct code submitted mid-cool-down went straight
   * through. That made the cool-down a message rather than a limit: a guesser
   * could keep firing at full speed and would still be let in the moment they
   * hit the right six digits.
   *
   * Called before the submitted code is looked at, so every attempt is refused
   * the same way and nothing about the code leaks through the answer.
   *
   * It only reads. An attempt made during a cool-down is not counted, so it
   * neither lengthens the wait nor resets it — the wait ends when the clock
   * says it does.
   */
  private assertNotCoolingDown(state: OtpSecurityStateDoc) {
    if (!state.verifyCoolDownUntil) return;
    if (state.verifyCoolDownUntil <= new Date()) return;

    const platform = this.request.data.platform;
    const waitTime = this.getWaitTime(state.verifyCoolDownUntil);

    this.logger.error(
      `[${platform}] ${maskPhone(state.identifier)} has to wait for ${waitTime} minute(s) before trying.`,
    );
    throw new BadRequestException(
      `Please wait for ${waitTime} minute(s) before trying.`,
    );
  }

  /**
   * Count a wrong code, and start the next cool-down once too many have been
   * wrong. Never reached while a cool-down is running — `assertNotCoolingDown`
   * has already turned the attempt away — so it does not check for one.
   */
  private async handleFailure(state: OtpSecurityStateDoc) {
    const platform = this.request.data.platform;
    const identifier = maskPhone(state.identifier);
    const now = new Date();

    state.failedAttempts += 1;
    if (state.failedAttempts <= 3) {
      await state.save();
      return;
    }

    state.verifyCoolDownLevel += 1;
    const coolDownMinutes = this.getCoolDownMinutes(state.verifyCoolDownLevel);

    state.verifyCoolDownUntil = this.addMinutes(now, coolDownMinutes);

    await state.save();

    const waitTime = this.getWaitTime(state.verifyCoolDownUntil);
    this.logger.error(
      `[${platform}] ${identifier} has to wait for ${waitTime} minute(s) before trying.`,
    );

    // "before trying", not "before requesting another code": what is blocked
    // is checking a code, and a resend is still allowed during this wait.
    throw new BadRequestException(
      `Please wait for ${waitTime} minute(s) before trying.`,
    );
  }

  private async handleSuccess(state: OtpSecurityStateDoc, otp: OtpRequestDoc) {
    // Verification reset
    state.failedAttempts = 0;
    state.verifyCoolDownLevel = 0;
    state.verifyCoolDownUntil = undefined;

    // Request reset
    state.requestAttempts = 0;
    state.requestCoolDownLevel = 0;
    state.requestCoolDownUntil = undefined;

    state.lastSuccessAt = new Date();

    otp.usedAt = new Date();
    otp.isUsed = true;

    await Promise.all([state.save(), otp.save()]);
  }

  private async handleOtpRequestAttempt(state: OtpSecurityStateDoc) {
    const platform = this.request.data.platform;
    const identifier = maskPhone(state.identifier);

    if (state.isLocked) {
      this.logger.error(`[${platform}] ${identifier} ${this.accountLocked}`);
      throw new ForbiddenException(
        `Your ${this.accountLocked}. Please contact support`,
      );
    }

    const now = new Date();
    if (state.requestCoolDownUntil && state.requestCoolDownUntil > now) {
      const waitTime = this.getWaitTime(state.requestCoolDownUntil);
      this.logger.error(
        `[${platform}] ${identifier} has to wait for ${waitTime} minute(s) before requesting another code.`,
      );
      throw new BadRequestException(
        `Please wait for ${waitTime} minute(s) before requesting another code.`,
      );
    }

    if (state.requestCoolDownUntil && state.requestCoolDownUntil <= now) {
      state.requestAttempts = 2;
      state.requestCoolDownUntil = undefined;
    }

    state.requestAttempts += 1;

    // Allow first 3 attempts
    if (state.requestAttempts <= 3) {
      await state.save();
      return;
    }

    // Escalate coolDown
    state.requestCoolDownLevel += 1;
    const coolDownMinutes = this.getCoolDownMinutes(state.requestCoolDownLevel);
    state.requestCoolDownUntil = this.addMinutes(now, coolDownMinutes);
    await state.save();

    const waitTime = this.getWaitTime(state.requestCoolDownUntil);
    this.logger.error(
      `[${platform}] ${identifier} has to wait for ${waitTime} minute(s) before requesting another code.`,
    );

    throw new BadRequestException(
      `Please wait for ${waitTime} minute(s) before requesting another code.`,
    );
  }

  /**
   * Retire every code still outstanding for this identifier and purpose, so
   * only the newest one can be verified.
   *
   * Keyed on identifier and purpose, deliberately not on channel: someone who
   * asks for the code by email after asking by WhatsApp has told us the first
   * one never reached them, and leaving it alive would be a second live code
   * on a channel they have walked away from.
   *
   * Rows that are already used or already expired are left alone — `verifyOtp`
   * refuses them anyway, and rewriting them would blur when each one died.
   */
  private async supersedeOutstanding(
    identifier: string,
    purpose: OTPPurposeEnum,
  ) {
    const now = new Date();

    await this.otpRequestModel.updateMany(
      {
        identifier,
        purpose,
        isUsed: false,
        expiresAt: { $gt: now },
        supersededAt: { $exists: false },
      },
      { $set: { supersededAt: now } },
    );
  }

  async requestOtp(data: RequestOtpDto) {
    const { identifier, channel, purpose } = data;

    const normalized = this.normalize(identifier);
    const state = await this.getOrCreateState({
      channel,
      purpose,
      identifier: normalized,
    });

    await this.handleOtpRequestAttempt(state);

    // After the cool-down gate, so a request that is refused for abuse cannot
    // kill a code the person is still legitimately holding. Before the insert,
    // so the new row is not caught by its own sweep.
    await this.supersedeOutstanding(normalized, purpose);

    const code = this.generateCode();
    const codeHash = await this.codeService.hashPlainText(code);

    const newOtpRequest = await this.otpRequestModel.create({
      channel,
      purpose,
      codeHash,
      identifier: normalized,
      expiresAt: this.addMinutes(new Date(), this.BASE_COOL_DOWN_MINUTES),
    });

    return {
      code,
      otpRef: newOtpRequest.otpRef,
      expiresAt: newOtpRequest.expiresAt,
      minutes: this.BASE_COOL_DOWN_MINUTES,
    };
  }

  async verifyOtp({ code, otpRef, identifier }: VerifyOtpDto) {
    const now = new Date();
    const platform = this.request.data.platform;
    const otpRequest = await this.otpRequestModel.findOne({
      otpRef,
      identifier,
      isUsed: false,
      expiresAt: { $gt: now },
      usedAt: { $exists: false },
      // A code a later request replaced. Same answer as expired or already
      // used: the row exists, but it is no longer the one that counts.
      supersededAt: { $exists: false },
    });

    if (!otpRequest) {
      this.logger.error(`[${platform}] ${this.expiredCode}`);
      throw new UnauthorizedException(this.expiredCode);
    }

    const state = await this.getOrCreateState({
      channel: otpRequest.channel,
      purpose: otpRequest.purpose,
      identifier: otpRequest.identifier,
    });

    if (state.isLocked) {
      this.logger.error(
        `[${platform}] ${maskPhone(otpRequest.identifier)} ${this.accountLocked}`,
      );
      throw new ForbiddenException(
        `Your ${this.accountLocked}. Please contact support`,
      );
    }

    this.assertNotCoolingDown(state);

    const isValid = await this.codeService.verifyHash(
      code,
      otpRequest.codeHash,
    );
    if (!isValid) {
      await this.handleFailure(state);
      this.logger.warn(
        `[${platform}] ${this.expiredCode} for ${maskPhone(otpRequest.identifier)}`,
      );
      throw new UnauthorizedException(this.expiredCode);
    }

    await this.handleSuccess(state, otpRequest);
    return true;
  }

  async unlockOtp(
    identifier: string,
    ability: MongoAbility<AppAbilityDto, ConditionsDto>,
  ) {
    ForbiddenError.from(ability).throwUnlessCan(
      PermissionActionEnum.UNLOCK,
      SubjectEnum.OtpSecurityState,
    );

    await this.otpSecurityStateModel.updateMany(
      { identifier },
      {
        isLocked: false,
        coolDownLevel: 0,
        failedAttempts: 0,
        coolDownUntil: null,
      },
    );
  }
}
