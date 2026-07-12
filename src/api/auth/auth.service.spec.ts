import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { NotificationService } from 'src/helper/service/notification.service';
import { OtpService } from 'src/helper/service/otp.service';
import { OTPChannelEnum } from 'src/schema/otp/otp.dto';
import { RefreshToken } from 'src/schema/user/refresh-token.schema';
import { UserTypeEum } from 'src/schema/user/user.dto';
import { User } from 'src/schema/user/user.schema';
import { AuthService } from './auth.service';

type MockUser = {
  phone: string;
  firstName: string;
  email?: string;
  whatsappPhone?: string;
  isActive: boolean;
  passwordHash: string;
  userTypeId: { userTypeName: string };
};

const CUSTOMER = UserTypeEum.CUSTOMER.toString();
const STAFF = UserTypeEum.ADMIN.toString();

describe('AuthService', () => {
  let service: AuthService;
  let userModel: { findOne: jest.Mock; findById: jest.Mock };
  let otpService: { requestOtp: jest.Mock; verifyOtp: jest.Mock };
  let codeService: { verifyHash: jest.Mock };
  let notificationService: { addToQueue: jest.Mock };
  let refreshTokenModel: {
    create: jest.Mock;
    findOne: jest.Mock;
    updateOne: jest.Mock;
  };

  const buildUser = (over: Partial<MockUser> = {}): MockUser => ({
    phone: '698765294',
    firstName: 'Ada',
    email: 'ada@example.com',
    whatsappPhone: '237698765294',
    isActive: true,
    passwordHash: 'hashed',
    userTypeId: { userTypeName: CUSTOMER },
    ...over,
  });

  // userModel.findOne(...).populate(...) resolves to the user (or null).
  const mockFindOne = (user: MockUser | null) =>
    userModel.findOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue(user),
    });

  beforeEach(async () => {
    userModel = { findOne: jest.fn(), findById: jest.fn() };
    refreshTokenModel = {
      create: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    otpService = {
      requestOtp: jest.fn().mockResolvedValue({
        code: '123456',
        otpRef: 'otp-ref',
        expiresAt: new Date(Date.now() + 5 * 60_000),
        minutes: 5,
      }),
      verifyOtp: jest.fn().mockResolvedValue(true),
    };
    codeService = { verifyHash: jest.fn() };
    notificationService = {
      addToQueue: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('access.jwt') },
        },
        { provide: OtpService, useValue: otpService },
        { provide: CodeGeneratorService, useValue: codeService },
        { provide: NotificationService, useValue: notificationService },
        { provide: REQUEST, useValue: { data: { platform: 'WEB' } } },
        { provide: getModelToken(User.name), useValue: userModel },
        {
          provide: getModelToken(RefreshToken.name),
          useValue: refreshTokenModel,
        },
      ],
    }).compile();

    service = await module.resolve<AuthService>(AuthService);
  });

  describe('initiateLogin', () => {
    it('customer: issues an OTP without a password', async () => {
      mockFindOne(buildUser({ userTypeId: { userTypeName: CUSTOMER } }));

      const res = await service.initiateLogin({
        phone: '698765294',
        otpChannel: OTPChannelEnum.WHATSAPP,
      });

      expect(codeService.verifyHash).not.toHaveBeenCalled();
      expect(otpService.requestOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '698765294',
          channel: OTPChannelEnum.WHATSAPP,
        }),
      );
      expect(res.otpRef).toBe('otp-ref');
    });

    it('routes a WhatsApp OTP to whatsappPhone, not email (bug fix)', async () => {
      mockFindOne(
        buildUser({
          email: 'ada@example.com',
          whatsappPhone: '237698765294',
        }),
      );

      await service.initiateLogin({
        phone: '698765294',
        otpChannel: OTPChannelEnum.WHATSAPP,
      });

      expect(notificationService.addToQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          otpChannel: OTPChannelEnum.WHATSAPP,
          recipients: [expect.objectContaining({ address: '237698765294' })],
        }),
      );
    });

    it('routes an email OTP to email', async () => {
      mockFindOne(buildUser());

      await service.initiateLogin({
        phone: '698765294',
        otpChannel: OTPChannelEnum.EMAIL,
      });

      expect(notificationService.addToQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: [expect.objectContaining({ address: 'ada@example.com' })],
        }),
      );
    });

    it('never logs the OTP code', async () => {
      const logSpy = jest
        .spyOn(service['logger'], 'log')
        .mockImplementation(() => undefined);
      mockFindOne(buildUser());

      await service.initiateLogin({
        phone: '698765294',
        otpChannel: OTPChannelEnum.WHATSAPP,
      });

      for (const call of logSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain('123456');
      }
    });

    it('staff: requires a valid password before issuing an OTP', async () => {
      mockFindOne(buildUser({ userTypeId: { userTypeName: STAFF } }));
      codeService.verifyHash.mockResolvedValue(false);

      await expect(
        service.initiateLogin({
          phone: '698765294',
          otpChannel: OTPChannelEnum.WHATSAPP,
          password: 'wrong',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(otpService.requestOtp).not.toHaveBeenCalled();
    });

    it('staff: with no password supplied is rejected', async () => {
      mockFindOne(buildUser({ userTypeId: { userTypeName: STAFF } }));

      await expect(
        service.initiateLogin({
          phone: '698765294',
          otpChannel: OTPChannelEnum.WHATSAPP,
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(otpService.requestOtp).not.toHaveBeenCalled();
    });

    it('staff: valid password issues an OTP', async () => {
      mockFindOne(buildUser({ userTypeId: { userTypeName: STAFF } }));
      codeService.verifyHash.mockResolvedValue(true);

      await service.initiateLogin({
        phone: '698765294',
        otpChannel: OTPChannelEnum.WHATSAPP,
        password: 'right',
      });

      expect(otpService.requestOtp).toHaveBeenCalledTimes(1);
    });

    it('rejects an inactive account with ACCOUNT_INACTIVE', async () => {
      mockFindOne(buildUser({ isActive: false }));

      await expect(
        service.initiateLogin({
          phone: '698765294',
          otpChannel: OTPChannelEnum.WHATSAPP,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an unknown user with INVALID_CREDENTIALS', async () => {
      mockFindOne(null);

      await expect(
        service.initiateLogin({
          phone: '000000000',
          otpChannel: OTPChannelEnum.WHATSAPP,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a WhatsApp OTP when no whatsappPhone is configured', async () => {
      mockFindOne(buildUser({ whatsappPhone: undefined }));

      await expect(
        service.initiateLogin({
          phone: '698765294',
          otpChannel: OTPChannelEnum.WHATSAPP,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('completeLogin', () => {
    it('verifies the OTP then issues an access + refresh pair', async () => {
      mockFindOne(buildUser());

      const res = await service.completeLogin({
        code: '123456',
        otpRef: 'otp-ref',
        identifier: '698765294',
      });

      expect(otpService.verifyOtp).toHaveBeenCalled();
      expect(res.accessToken).toBe('access.jwt');
      expect(typeof res.refreshToken).toBe('string');
      expect(res.refreshToken.length).toBeGreaterThan(0);
      expect(refreshTokenModel.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('refresh', () => {
    const validStored = () => ({
      userId: { toString: () => 'uid' },
      revokedAt: undefined as Date | undefined,
      replacedByTokenHash: undefined as string | undefined,
      expiresAt: new Date(Date.now() + 1_000_000),
      save: jest.fn().mockResolvedValue(undefined),
    });

    const mockUserById = () => {
      const doc = {
        _id: 'uid',
        phone: '698765294',
        isActive: true,
        populate: jest.fn().mockResolvedValue({
          userTypeId: { userTypeName: CUSTOMER },
        }),
      };
      userModel.findById.mockReturnValue(doc);
    };

    it('rotates: issues a new pair and revokes the presented token', async () => {
      const stored = validStored();
      refreshTokenModel.findOne.mockResolvedValue(stored);
      mockUserById();

      const res = await service.refresh({ refreshToken: 'raw-token' });

      expect(res.accessToken).toBe('access.jwt');
      expect(typeof res.refreshToken).toBe('string');
      expect(stored.revokedAt).toBeInstanceOf(Date);
      expect(stored.replacedByTokenHash).toEqual(expect.any(String));
      expect(stored.save).toHaveBeenCalled();
    });

    it('rejects a revoked token', async () => {
      const stored = validStored();
      stored.revokedAt = new Date();
      refreshTokenModel.findOne.mockResolvedValue(stored);

      await expect(
        service.refresh({ refreshToken: 'raw-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired token', async () => {
      const stored = validStored();
      stored.expiresAt = new Date(Date.now() - 1000);
      refreshTokenModel.findOne.mockResolvedValue(stored);

      await expect(
        service.refresh({ refreshToken: 'raw-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unknown token', async () => {
      refreshTokenModel.findOne.mockResolvedValue(null);

      await expect(
        service.refresh({ refreshToken: 'raw-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the presented refresh token', async () => {
      await service.logout({ refreshToken: 'raw-token' });
      expect(refreshTokenModel.updateOne).toHaveBeenCalledTimes(1);
      const [filter, update] = refreshTokenModel.updateOne.mock.calls[0] as [
        { tokenHash: string; revokedAt: { $exists: boolean } },
        { revokedAt: Date },
      ];
      expect(filter.revokedAt).toEqual({ $exists: false });
      expect(typeof filter.tokenHash).toBe('string');
      expect(update.revokedAt).toBeInstanceOf(Date);
    });
  });
});
