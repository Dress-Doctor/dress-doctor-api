import { AbilityBuilder } from '@casl/ability';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppAbility } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { SubscriptionPlan } from 'src/schema/subscription/subscription-plan.schema';
import {
  BillingCycleEnum,
  QuotaTypeEnum,
  SubscriptionStatusEnum,
} from 'src/schema/subscription/subscription.dto';
import { Subscription } from 'src/schema/subscription/subscription.schema';
import { User } from 'src/schema/user/user.schema';
import { SubscriptionService } from './subscription.service';

const manageAllAbility = () => {
  const { can, build } = new AbilityBuilder(AppAbility);
  can('manage', 'all');
  return build();
};

const selfAbility = (selfId: Types.ObjectId) => {
  const { can, build } = new AbilityBuilder(AppAbility);
  can('READ', 'Subscription', { customerId: selfId.toString() } as never);
  can('CREATE', 'Subscription', { customerId: selfId.toString() } as never);
  can('UPDATE', 'Subscription', { customerId: selfId.toString() } as never);
  return build();
};

describe('SubscriptionService', () => {
  const selfId = new Types.ObjectId();
  const planId = new Types.ObjectId();

  let userModel: { findById: jest.Mock };
  let subscriptionModel: {
    findOne: jest.Mock;
    findById: jest.Mock;
  } & jest.Mock;
  let planModel: { findOne: jest.Mock; findById: jest.Mock };
  let request: {
    data: { platform: string; officeId?: Types.ObjectId };
    user: { phone: string; userId: string; ability: unknown };
  };
  let savedDocs: Record<string, unknown>[];

  const plan = (over: Record<string, unknown> = {}) => ({
    _id: planId,
    planName: 'Basic',
    price: 20000,
    billingCycle: BillingCycleEnum.MONTHLY,
    quotaType: QuotaTypeEnum.PIECES,
    quotaAmount: 40,
    overagePolicy: 'PER_UNIT',
    rolloverPeriods: 1,
    isActive: true,
    ...over,
  });

  beforeEach(() => {
    savedDocs = [];
    userModel = { findById: jest.fn().mockResolvedValue({ _id: selfId }) };

    // Constructable model mock: `new this.subscriptionModel(fields)` yields a
    // doc whose save() records the fields.
    const ctor = jest.fn().mockImplementation((fields: object) => {
      const doc = {
        ...fields,
        $locals: {} as Record<string, unknown>,
        save: jest.fn().mockImplementation(() => {
          savedDocs.push(doc as Record<string, unknown>);
          return Promise.resolve(doc);
        }),
      };
      return doc;
    }) as unknown as { findOne: jest.Mock; findById: jest.Mock } & jest.Mock;
    ctor.findOne = jest.fn().mockResolvedValue(null);
    ctor.findById = jest.fn();
    subscriptionModel = ctor;

    planModel = {
      findOne: jest.fn().mockResolvedValue(plan()),
      findById: jest.fn().mockResolvedValue(plan()),
    };
    request = {
      data: { platform: 'WEB' },
      user: {
        phone: '600',
        userId: selfId.toString(),
        ability: selfAbility(selfId),
      },
    };
  });

  const build = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: AppUtilService, useValue: { parseSortParam: () => ({}) } },
        { provide: REQUEST, useValue: request },
        { provide: getModelToken(User.name), useValue: userModel },
        {
          provide: getModelToken(Subscription.name),
          useValue: subscriptionModel,
        },
        { provide: getModelToken(SubscriptionPlan.name), useValue: planModel },
      ],
    }).compile();
    return module.resolve<SubscriptionService>(SubscriptionService);
  };

  describe('subscribe', () => {
    it('snapshots quota fields from the plan and starts an ACTIVE monthly period', async () => {
      const service = await build();
      await service.subscribe({ planId: planId.toString() });

      const doc = savedDocs[0] as {
        status: string;
        quotaType: string;
        quotaAmount: number;
        remainingQuota: number;
        rolledOverQuota: number;
        currentPeriodStart: Date;
        currentPeriodEnd: Date;
      };
      expect(doc.status).toBe(SubscriptionStatusEnum.ACTIVE);
      expect(doc.quotaType).toBe(QuotaTypeEnum.PIECES);
      expect(doc.quotaAmount).toBe(40);
      expect(doc.remainingQuota).toBe(40);
      expect(doc.rolledOverQuota).toBe(0);

      const months =
        (doc.currentPeriodEnd.getFullYear() -
          doc.currentPeriodStart.getFullYear()) *
          12 +
        (doc.currentPeriodEnd.getMonth() - doc.currentPeriodStart.getMonth());
      expect(months).toBe(1);
    });

    it('rejects a second live subscription (SUBSCRIPTION_EXISTS)', async () => {
      subscriptionModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
      });
      const service = await build();

      await expect(
        service.subscribe({ planId: planId.toString() }),
      ).rejects.toThrow(ConflictException);
    });

    it('a customer cannot subscribe someone else (scoped 404)', async () => {
      const service = await build();

      await expect(
        service.subscribe({
          planId: planId.toString(),
          customerId: new Types.ObjectId().toString(),
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('staff (manage all) can subscribe any customer', async () => {
      request.user.ability = manageAllAbility();
      request.user.userId = new Types.ObjectId().toString();
      const target = new Types.ObjectId();
      userModel.findById.mockResolvedValue({ _id: target });
      const service = await build();

      await service.subscribe({
        planId: planId.toString(),
        customerId: target.toString(),
      });

      expect(
        (savedDocs[0] as { customerId: Types.ObjectId }).customerId.toString(),
      ).toBe(target.toString());
    });
  });

  describe('lifecycle transitions', () => {
    const liveSub = (status: SubscriptionStatusEnum) => {
      const doc = {
        _id: new Types.ObjectId(),
        customerId: selfId,
        status,
        $locals: {} as Record<string, unknown>,
        save: jest.fn().mockImplementation(() => Promise.resolve(doc)),
      };
      return doc;
    };

    it('pause: ACTIVE → PAUSED', async () => {
      const sub = liveSub(SubscriptionStatusEnum.ACTIVE);
      subscriptionModel.findOne.mockResolvedValue(sub);
      const service = await build();

      await service.pause(sub._id.toString());
      expect(sub.status).toBe(SubscriptionStatusEnum.PAUSED);
    });

    it('resume rejects a CANCELLED subscription', async () => {
      const sub = liveSub(SubscriptionStatusEnum.CANCELLED);
      subscriptionModel.findOne.mockResolvedValue(sub);
      const service = await build();

      await expect(service.resume(sub._id.toString())).rejects.toThrow(
        ConflictException,
      );
    });

    it('out-of-scope id is a 404, not a leak', async () => {
      subscriptionModel.findOne.mockResolvedValue(null);
      const service = await build();

      await expect(
        service.cancel(new Types.ObjectId().toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('renewPeriod — rollover once (§2.2)', () => {
    const renewable = (over: Record<string, unknown>) => {
      const doc = {
        _id: new Types.ObjectId(),
        planId,
        billingCycle: BillingCycleEnum.MONTHLY,
        quotaAmount: 40,
        remainingQuota: 0,
        rolledOverQuota: 0,
        currentPeriodStart: new Date('2026-06-01'),
        currentPeriodEnd: new Date('2026-07-01'),
        save: jest.fn().mockImplementation(() => Promise.resolve(doc)),
        ...over,
      };
      return doc;
    };

    it('unused base quota carries over into the next period', async () => {
      // Used 30 of 40, no prior rollover → carry 10 → next period 50.
      const sub = renewable({ remainingQuota: 10 });
      subscriptionModel.findById.mockResolvedValue(sub);
      const service = await build();

      await service.renewPeriod(sub._id);

      expect(sub.rolledOverQuota).toBe(10);
      expect(sub.remainingQuota).toBe(50);
    });

    it('a surviving prior rollover EXPIRES — it never rolls twice', async () => {
      // Period quota 40 + 15 carried in = 55; customer used 5 (consumes
      // rollover first → 10 rollover survives, base untouched at 40).
      // Carry = base remaining (40), NOT 50 — the surviving 10 expires.
      const sub = renewable({ remainingQuota: 50, rolledOverQuota: 15 });
      subscriptionModel.findById.mockResolvedValue(sub);
      const service = await build();

      await service.renewPeriod(sub._id);

      expect(sub.rolledOverQuota).toBe(40);
      expect(sub.remainingQuota).toBe(80); // 40 base + 40 carry
    });

    it('carry is capped at quotaAmount × rolloverPeriods', async () => {
      const sub = renewable({ remainingQuota: 40, rolledOverQuota: 0 });
      subscriptionModel.findById.mockResolvedValue(sub);
      const service = await build();

      await service.renewPeriod(sub._id);

      expect(sub.rolledOverQuota).toBe(40); // min(40, 40×1)
      expect(sub.remainingQuota).toBe(80);
    });

    it('rolloverPeriods 0 → nothing carries', async () => {
      planModel.findById.mockResolvedValue(plan({ rolloverPeriods: 0 }));
      const sub = renewable({ remainingQuota: 25 });
      subscriptionModel.findById.mockResolvedValue(sub);
      const service = await build();

      await service.renewPeriod(sub._id);

      expect(sub.rolledOverQuota).toBe(0);
      expect(sub.remainingQuota).toBe(40);
    });

    it('the new period starts where the old one ended', async () => {
      const sub = renewable({ remainingQuota: 0 });
      subscriptionModel.findById.mockResolvedValue(sub);
      const service = await build();

      await service.renewPeriod(sub._id);

      expect(sub.currentPeriodStart.toISOString()).toBe(
        new Date('2026-07-01').toISOString(),
      );
      expect(sub.currentPeriodEnd.toISOString()).toBe(
        new Date('2026-08-01').toISOString(),
      );
    });
  });
});
