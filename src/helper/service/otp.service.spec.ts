import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { OtpRequest } from 'src/schema/otp/otp-request.schema';
import { OtpSecurityState } from 'src/schema/otp/otp-security-state.schema';
import { OTPChannelEnum, OTPPurposeEnum } from 'src/schema/otp/otp.dto';
import { CodeGeneratorService } from './code-generator.service';
import { OtpService } from './otp.service';

/**
 * One row of `otp_request`, as the fake collection below holds it. `save` is
 * there because `handleSuccess` mutates the document it was handed and saves
 * it — the mutation lands on the object in the array either way.
 */
type OtpRow = {
  otpRef: string;
  identifier: string;
  channel: OTPChannelEnum;
  purpose: OTPPurposeEnum;
  codeHash: string;
  expiresAt: Date;
  usedAt?: Date;
  isUsed: boolean;
  supersededAt?: Date;
  save: jest.Mock;
};

/** The operators the service actually filters with. */
type Condition = { $gt?: Date; $exists?: boolean };

/**
 * Does one row satisfy a Mongo-shaped filter?
 *
 * The OTP rules live in the filters — "not used", "not expired", "not
 * superseded" — so a mock that only records the filter would assert the code
 * was written, not that it works. This applies the filter for real, which is
 * what lets a test say an old code cannot be verified and mean it.
 */
function matches(row: OtpRow, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([field, expected]) => {
    const actual = (row as unknown as Record<string, unknown>)[field];

    if (expected instanceof Date) {
      return actual instanceof Date && actual.getTime() === expected.getTime();
    }

    if (expected && typeof expected === 'object') {
      const condition = expected as Condition;

      if (condition.$exists !== undefined) {
        return (actual !== undefined && actual !== null) === condition.$exists;
      }

      if (condition.$gt !== undefined) {
        return (
          actual instanceof Date && actual.getTime() > condition.$gt.getTime()
        );
      }
    }

    return actual === expected;
  });
}

describe('OtpService', () => {
  let service: OtpService;
  /** The fake `otp_request` collection, newest last. */
  let rows: OtpRow[];
  let otpRequestModel: {
    create: jest.Mock;
    findOne: jest.Mock;
    updateMany: jest.Mock;
  };
  let otpSecurityStateModel: { findOneAndUpdate: jest.Mock };
  let codeService: { hashPlainText: jest.Mock; verifyHash: jest.Mock };
  /** One state document per identifier + channel + purpose, as the index says. */
  let states: Map<string, Record<string, unknown> & { save: jest.Mock }>;

  const identifier = '670678660';
  const channel = OTPChannelEnum.WHATSAPP;
  const purpose = OTPPurposeEnum.LOGIN;
  const request = { identifier, channel, purpose };

  /** The real hasher is bcrypt; this keeps the code↔hash relationship honest. */
  const hashOf = (code: string) => `hash:${code}`;

  const seed = (
    row: Partial<OtpRow> & { otpRef: string; codeHash: string },
  ) => {
    const full: OtpRow = {
      identifier,
      channel,
      purpose,
      isUsed: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      save: jest.fn().mockResolvedValue(undefined),
      ...row,
    };
    rows.push(full);
    return full;
  };

  beforeEach(async () => {
    rows = [];
    states = new Map();

    otpRequestModel = {
      create: jest.fn().mockImplementation((doc: Partial<OtpRow>) =>
        Promise.resolve(
          seed({
            otpRef: `ref-${rows.length + 1}`,
            codeHash: '',
            ...doc,
          } as Partial<OtpRow> & { otpRef: string; codeHash: string }),
        ),
      ),
      findOne: jest
        .fn()
        .mockImplementation((filter: Record<string, unknown>) =>
          Promise.resolve(rows.find((row) => matches(row, filter)) ?? null),
        ),
      updateMany: jest
        .fn()
        .mockImplementation(
          (
            filter: Record<string, unknown>,
            update: { $set: Partial<OtpRow> },
          ) => {
            const hit = rows.filter((row) => matches(row, filter));
            for (const row of hit) Object.assign(row, update.$set);
            return Promise.resolve({ modifiedCount: hit.length });
          },
        ),
    };

    otpSecurityStateModel = {
      findOneAndUpdate: jest
        .fn()
        .mockImplementation((filter: Record<string, string>) => {
          const key = `${filter.identifier}|${filter.channel}|${filter.purpose}`;
          if (!states.has(key)) {
            states.set(key, {
              ...filter,
              isLocked: false,
              requestAttempts: 0,
              requestCoolDownLevel: 0,
              requestCoolDownUntil: undefined,
              failedAttempts: 0,
              verifyCoolDownLevel: 0,
              verifyCoolDownUntil: undefined,
              save: jest.fn().mockResolvedValue(undefined),
            });
          }
          return Promise.resolve(states.get(key));
        }),
    };

    codeService = {
      hashPlainText: jest
        .fn()
        .mockImplementation((code: string) => Promise.resolve(hashOf(code))),
      verifyHash: jest
        .fn()
        .mockImplementation((plain: string, hashed: string) =>
          Promise.resolve(hashed === hashOf(plain)),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: CodeGeneratorService, useValue: codeService },
        { provide: REQUEST, useValue: { data: { platform: 'WEB' } } },
        {
          provide: getModelToken(OtpRequest.name),
          useValue: otpRequestModel,
        },
        {
          provide: getModelToken(OtpSecurityState.name),
          useValue: otpSecurityStateModel,
        },
      ],
    }).compile();

    service = await module.resolve<OtpService>(OtpService);
  });

  describe('generateCode', () => {
    it('always produces a six-digit code', () => {
      const generate = () =>
        (service as unknown as { generateCode: () => string }).generateCode();

      const codes = Array.from({ length: 500 }, generate);

      for (const code of codes) expect(code).toMatch(/^\d{6}$/);
      // A generator stuck on one value would also pass the shape check.
      expect(new Set(codes).size).toBeGreaterThan(1);
    });
  });

  describe('requestOtp', () => {
    it('retires the previous code, so only the newest one is live', async () => {
      const first = await service.requestOtp(request);
      const second = await service.requestOtp(request);

      expect(first.otpRef).not.toBe(second.otpRef);

      const [older, newer] = rows;
      expect(older.supersededAt).toBeInstanceOf(Date);
      expect(newer.supersededAt).toBeUndefined();
      // Superseded is not the same as used — nobody signed in with it.
      expect(older.isUsed).toBe(false);
      expect(older.usedAt).toBeUndefined();
    });

    it('retires a code requested on another channel for the same purpose', async () => {
      await service.requestOtp({
        ...request,
        channel: OTPChannelEnum.WHATSAPP,
      });
      await service.requestOtp({ ...request, channel: OTPChannelEnum.EMAIL });

      expect(rows[0].supersededAt).toBeInstanceOf(Date);
      expect(rows[1].supersededAt).toBeUndefined();
    });

    it('leaves another purpose alone', async () => {
      const other = seed({
        otpRef: 'other-purpose',
        codeHash: hashOf('111111'),
        purpose: OTPPurposeEnum.EMAIL_VERIFICATION,
      });

      await service.requestOtp(request);

      expect(other.supersededAt).toBeUndefined();
    });

    it('leaves used and expired rows as they are', async () => {
      const used = seed({
        otpRef: 'used',
        codeHash: hashOf('111111'),
        isUsed: true,
        usedAt: new Date(),
      });
      const expired = seed({
        otpRef: 'expired',
        codeHash: hashOf('222222'),
        expiresAt: new Date(Date.now() - 60 * 1000),
      });

      await service.requestOtp(request);

      // Both are already refused by `verifyOtp`; stamping them would only blur
      // when each one actually died.
      expect(used.supersededAt).toBeUndefined();
      expect(expired.supersededAt).toBeUndefined();
    });

    it('does not retire a live code when the request is refused for abuse', async () => {
      // Three requests are allowed; the fourth trips the cool-down.
      await service.requestOtp(request);
      await service.requestOtp(request);
      const live = await service.requestOtp(request);

      await expect(service.requestOtp(request)).rejects.toThrow(
        BadRequestException,
      );

      const stillLive = rows.find((row) => row.otpRef === live.otpRef);
      expect(stillLive?.supersededAt).toBeUndefined();
      await expect(
        service.verifyOtp({
          identifier,
          code: live.code,
          otpRef: live.otpRef,
        }),
      ).resolves.toBe(true);
    });

    it('issues a code that expires in five minutes', async () => {
      const before = Date.now();
      const { expiresAt, minutes } = await service.requestOtp(request);

      expect(minutes).toBe(5);
      expect(expiresAt.getTime() - before).toBeGreaterThan(4.9 * 60 * 1000);
      expect(expiresAt.getTime() - before).toBeLessThanOrEqual(5 * 60 * 1000);
    });
  });

  describe('verifyOtp', () => {
    it('accepts the newest code', async () => {
      await service.requestOtp(request);
      const latest = await service.requestOtp(request);

      await expect(
        service.verifyOtp({
          identifier,
          code: latest.code,
          otpRef: latest.otpRef,
        }),
      ).resolves.toBe(true);
    });

    it('refuses a code a later request superseded', async () => {
      const older = await service.requestOtp(request);
      await service.requestOtp(request);

      await expect(
        service.verifyOtp({
          identifier,
          code: older.code,
          otpRef: older.otpRef,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('refuses an expired code', async () => {
      seed({
        otpRef: 'expired',
        codeHash: hashOf('123456'),
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.verifyOtp({ identifier, code: '123456', otpRef: 'expired' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('refuses a code that was already used', async () => {
      const otp = await service.requestOtp(request);
      const attempt = {
        identifier,
        code: otp.code,
        otpRef: otp.otpRef,
      };

      await expect(service.verifyOtp(attempt)).resolves.toBe(true);
      await expect(service.verifyOtp(attempt)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('marks the row used rather than superseded on success', async () => {
      const otp = await service.requestOtp(request);

      await service.verifyOtp({
        identifier,
        code: otp.code,
        otpRef: otp.otpRef,
      });

      expect(rows[0].isUsed).toBe(true);
      expect(rows[0].usedAt).toBeInstanceOf(Date);
      expect(rows[0].supersededAt).toBeUndefined();
    });

    it('refuses a code that belongs to somebody else', async () => {
      const otp = await service.requestOtp(request);

      await expect(
        service.verifyOtp({
          code: otp.code,
          otpRef: otp.otpRef,
          identifier: '690000001',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    describe('the verify cool-down', () => {
      const stateOf = () =>
        states.get(`${identifier}|${channel}|${purpose}`) as Record<
          string,
          unknown
        >;

      /** Any six digits that are not the real code. */
      const wrongCodeFor = (code: string) =>
        code === '000000' ? '111111' : '000000';

      /** Four wrong guesses: three counted, the fourth starts the wait. */
      const burnToCoolDown = async () => {
        const otp = await service.requestOtp(request);
        const wrong = {
          identifier,
          otpRef: otp.otpRef,
          code: wrongCodeFor(otp.code),
        };

        for (let attempt = 0; attempt < 4; attempt += 1) {
          await expect(service.verifyOtp(wrong)).rejects.toThrow();
        }

        expect(stateOf().verifyCoolDownUntil).toBeInstanceOf(Date);
        return { otp, wrong };
      };

      /** What the clock does, without waiting five real minutes for it. */
      const lapseCoolDown = () => {
        stateOf().verifyCoolDownUntil = new Date(Date.now() - 1000);
      };

      it('counts the first three misses without locking anyone out', async () => {
        const otp = await service.requestOtp(request);
        const wrong = {
          identifier,
          otpRef: otp.otpRef,
          code: wrongCodeFor(otp.code),
        };

        for (let attempt = 0; attempt < 3; attempt += 1) {
          await expect(service.verifyOtp(wrong)).rejects.toThrow(
            UnauthorizedException,
          );
        }

        expect(stateOf().failedAttempts).toBe(3);
        expect(stateOf().verifyCoolDownUntil).toBeUndefined();
      });

      it('starts an escalating cool-down on the fourth miss', async () => {
        await burnToCoolDown();

        expect(stateOf().verifyCoolDownLevel).toBe(1);
        expect(stateOf().failedAttempts).toBe(4);
      });

      it('refuses a wrong code during the cool-down', async () => {
        const { wrong } = await burnToCoolDown();

        await expect(service.verifyOtp(wrong)).rejects.toThrow(
          BadRequestException,
        );
      });

      it('refuses the correct code during the cool-down', async () => {
        const { otp } = await burnToCoolDown();

        await expect(
          service.verifyOtp({
            identifier,
            code: otp.code,
            otpRef: otp.otpRef,
          }),
        ).rejects.toThrow(BadRequestException);
        // Nobody signed in, so the code is still unspent.
        expect(rows[0].isUsed).toBe(false);
      });

      it('never looks at the submitted code during the cool-down', async () => {
        const { otp } = await burnToCoolDown();
        codeService.verifyHash.mockClear();

        await expect(
          service.verifyOtp({
            identifier,
            code: otp.code,
            otpRef: otp.otpRef,
          }),
        ).rejects.toThrow(BadRequestException);

        // Right and wrong are refused identically, so the answer says nothing
        // about the code that was tried.
        expect(codeService.verifyHash).not.toHaveBeenCalled();
      });

      it('neither extends nor resets the cool-down for attempts made during it', async () => {
        const { otp, wrong } = await burnToCoolDown();
        const until = stateOf().verifyCoolDownUntil as Date;
        const attempts = stateOf().failedAttempts;
        const level = stateOf().verifyCoolDownLevel;

        await expect(service.verifyOtp(wrong)).rejects.toThrow(
          BadRequestException,
        );
        await expect(
          service.verifyOtp({
            identifier,
            code: otp.code,
            otpRef: otp.otpRef,
          }),
        ).rejects.toThrow(BadRequestException);

        // The wait ends when the clock says it does — hammering it neither
        // lengthens it nor buys a fresh start.
        expect(stateOf().verifyCoolDownUntil).toBe(until);
        expect(stateOf().failedAttempts).toBe(attempts);
        expect(stateOf().verifyCoolDownLevel).toBe(level);
      });

      it('accepts the correct code once the cool-down has passed', async () => {
        const { otp } = await burnToCoolDown();

        lapseCoolDown();

        await expect(
          service.verifyOtp({
            identifier,
            code: otp.code,
            otpRef: otp.otpRef,
          }),
        ).resolves.toBe(true);
        expect(rows[0].isUsed).toBe(true);
      });

      it('escalates to the next level on the first miss after it passes', async () => {
        const { wrong } = await burnToCoolDown();

        lapseCoolDown();

        await expect(service.verifyOtp(wrong)).rejects.toThrow(
          BadRequestException,
        );

        // failedAttempts was never reset, so the next miss trips level 2 —
        // five minutes becomes ten.
        expect(stateOf().verifyCoolDownLevel).toBe(2);
        expect(stateOf().failedAttempts).toBe(5);
      });

      it('still lets a code be resent, but not verified, during the cool-down', async () => {
        const { otp } = await burnToCoolDown();

        // The request limit and the verify limit are separate counters, so a
        // resend goes through — it is not what the wait is about.
        const resent = await service.requestOtp(request);
        expect(resent.otpRef).not.toBe(otp.otpRef);
        expect(rows[0].supersededAt).toBeInstanceOf(Date);

        // A fresh code is no way around the wait.
        await expect(
          service.verifyOtp({
            identifier,
            code: resent.code,
            otpRef: resent.otpRef,
          }),
        ).rejects.toThrow(BadRequestException);

        lapseCoolDown();

        await expect(
          service.verifyOtp({
            identifier,
            code: resent.code,
            otpRef: resent.otpRef,
          }),
        ).resolves.toBe(true);
      });

      it('clears the counters once a code is verified', async () => {
        const otp = await service.requestOtp(request);
        await expect(
          service.verifyOtp({
            identifier,
            otpRef: otp.otpRef,
            code: wrongCodeFor(otp.code),
          }),
        ).rejects.toThrow(UnauthorizedException);
        expect(stateOf().failedAttempts).toBe(1);

        await service.verifyOtp({
          identifier,
          code: otp.code,
          otpRef: otp.otpRef,
        });

        expect(stateOf().failedAttempts).toBe(0);
        expect(stateOf().verifyCoolDownLevel).toBe(0);
        expect(stateOf().verifyCoolDownUntil).toBeUndefined();
        expect(stateOf().requestAttempts).toBe(0);
        expect(stateOf().lastSuccessAt).toBeInstanceOf(Date);
      });
    });

    it('refuses everything while the account is locked', async () => {
      const otp = await service.requestOtp(request);

      const state = states.get(`${identifier}|${channel}|${purpose}`);
      if (state) state.isLocked = true;

      await expect(
        service.verifyOtp({
          identifier,
          code: otp.code,
          otpRef: otp.otpRef,
        }),
      ).rejects.toThrow(/locked/);
    });
  });
});
