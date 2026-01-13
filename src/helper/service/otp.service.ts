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
import { Model } from 'mongoose';
import appConfig from 'src/config/app-config';
import { type AppRequest } from 'src/dto/request-data.dto';
import { PermissionActionEnum, SubjectEnum } from 'src/schema/admin/admin.dto';
import { OtpRequest, OtpRequestDoc } from 'src/schema/otp/otp-request.schema';
import {
  OtpSecurityState,
  OtpSecurityStateDoc,
} from 'src/schema/otp/otp-security-state.schema';
import { RequestOtpDto, VerifyOtpDto } from 'src/schema/otp/otp.dto';
import { AppAbilityDto, ConditionsDto } from '../casl/casl.dto';
import { CodeGeneratorService } from './code-generator.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
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

  private generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000);
  }

  private async getOrCreateState(data: RequestOtpDto) {
    return this.otpSecurityStateModel.findOneAndUpdate(
      data,
      { $setOnInsert: data },
      { new: true, upsert: true },
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

  private async handleFailure(state: OtpSecurityStateDoc) {
    const platform = this.request.data.platform;
    const identifier = state.identifier;

    const now = new Date();
    if (state.verifyCoolDownUntil && state.verifyCoolDownUntil > now) {
      const waitTime = this.getWaitTime(state.verifyCoolDownUntil);
      this.logger.error(
        `[${platform}] ${identifier} has to wait for ${waitTime} minute(s) before requesting another code.`,
      );
      throw new BadRequestException(
        `Please wait for ${waitTime} minute(s) before requesting another code.`,
      );
    }

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
      `[${platform}] ${identifier} has to wait for ${waitTime} minute(s) before requesting another code.`,
    );

    throw new BadRequestException(
      `Please wait for ${waitTime} minute(s) before requesting another code.`,
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
    const identifier = state.identifier;

    if (state.isLocked) {
      this.logger.error(
        `[${platform}] ${identifier} account has been locked due to OTP abuse`,
      );
      throw new ForbiddenException(
        'Your account has been locked due to OTP abuse. Please contact support',
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

  async requestOtp(data: RequestOtpDto) {
    const { identifier, channel, purpose } = data;

    const normalized = this.normalize(identifier);
    const state = await this.getOrCreateState({
      channel,
      purpose,
      identifier: normalized,
    });

    await this.handleOtpRequestAttempt(state);

    const code = this.generateCode();
    const codeHash = await this.codeService.hashPlainText(code);

    const newOtpRequest = await this.otpRequestModel.create({
      channel,
      purpose,
      codeHash,
      identifier: normalized,
      expiresAt: this.addMinutes(new Date(), this.BASE_COOL_DOWN_MINUTES),
    });

    return { code, channel, expiresAt: newOtpRequest.expiresAt, purpose };
  }

  async verifyOtp(data: VerifyOtpDto) {
    const platform = this.request.data.platform;
    const { identifier, channel, purpose, code } = data;

    const normalized = this.normalize(identifier);
    const state = await this.getOrCreateState({
      channel,
      purpose,
      identifier: normalized,
    });

    if (state.isLocked) {
      this.logger.error(
        `[${platform}] ${identifier} account has been locked due to OTP abuse`,
      );
      throw new ForbiddenException(
        'Your account has been locked due to OTP abuse. Please contact support',
      );
    }

    const now = new Date();
    if (state.verifyCoolDownUntil && state.verifyCoolDownUntil > now) {
      const waitTime = this.getWaitTime(state.verifyCoolDownUntil);
      this.logger.error(
        `[${platform}] ${identifier} has to wait for ${waitTime} minute(s) before requesting another code.`,
      );
      throw new BadRequestException(
        `Please wait for ${waitTime} minute(s) before requesting another code.`,
      );
    }

    const otp = await this.otpRequestModel.findOne({
      channel,
      purpose,
      isUsed: false,
      identifier: normalized,
      expiresAt: { $gt: now },
      usedAt: { $exists: false },
    });

    if (!otp) {
      await this.handleFailure(state);
      this.logger.error(
        `[${platform}] Invalid or expired verification code for ${identifier}`,
      );
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    const isValid = await this.codeService.verifyHash(code, otp.codeHash);
    if (!isValid) {
      await this.handleFailure(state);
      this.logger.error(
        `[${platform}] Invalid or expired verification code for ${identifier}`,
      );
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    await this.handleSuccess(state, otp);
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
