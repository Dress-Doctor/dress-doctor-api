import { AbilityBuilder } from '@casl/ability';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppAbility } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { OrderStatusEnum } from 'src/schema/order/order.dto';
import { Order } from 'src/schema/order/order.schema';
import { RewardLedger } from 'src/schema/reward/reward-ledger.schema';
import { RewardRule } from 'src/schema/reward/reward-rule.schema';
import { RewardTier } from 'src/schema/reward/reward-tier.schema';
import { RewardLedgerTypeEnum } from 'src/schema/reward/reward.dto';
import { Setting } from 'src/schema/settings/settings.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { RewardAccrualService } from './reward-accrual.service';
import { RewardService } from './reward.service';

const manageAllAbility = () => {
  const { can, build } = new AbilityBuilder(AppAbility);
  can('manage', 'all');
  return build();
};

/** A customer's real seeded shape: CREATE/READ RewardLedger only on self. */
const selfAbility = (selfId: Types.ObjectId) => {
  const { can, build } = new AbilityBuilder(AppAbility);
  can('READ', 'RewardLedger', { customerId: selfId.toString() } as never);
  can('CREATE', 'RewardLedger', { customerId: selfId.toString() } as never);
  return build();
};

describe('RewardService.redeem', () => {
  const selfId = new Types.ObjectId();
  const orderId = new Types.ObjectId();
  const draftStatusId = new Types.ObjectId();

  let orderModel: { findOne: jest.Mock; updateOne: jest.Mock };
  let orderStatusModel: { findOne: jest.Mock };
  let customerModel: { findOne: jest.Mock; updateOne: jest.Mock };
  let ledgerModel: { create: jest.Mock };
  let settingModel: { findOne: jest.Mock };
  let accrual: { balanceOf: jest.Mock };
  let request: {
    headers: Record<string, string>;
    data: { platform: string };
    user: { phone: string; userId: string; ability: unknown };
  };

  const order = (over: Record<string, unknown> = {}) => ({
    _id: orderId,
    orderCode: 'OR-9',
    customerId: selfId,
    orderStatusId: draftStatusId,
    totalAmount: 4000,
    amountPaid: 0,
    ...over,
  });

  beforeEach(() => {
    orderModel = {
      findOne: jest.fn().mockResolvedValue(order()),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    orderStatusModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: draftStatusId,
        orderStatusName: OrderStatusEnum.DRAFT,
      }),
    };
    customerModel = {
      findOne: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    ledgerModel = { create: jest.fn().mockResolvedValue([{}]) };
    settingModel = {
      findOne: jest.fn().mockResolvedValue({ value: 1 }), // 1 pt = 1 XAF
    };
    accrual = {
      balanceOf: jest
        .fn()
        .mockResolvedValueOnce(1000) // in-txn balance check
        .mockResolvedValue(700), // post-write recompute
    };
    request = {
      headers: {},
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
        RewardService,
        { provide: AppUtilService, useValue: { parseSortParam: () => ({}) } },
        { provide: RewardAccrualService, useValue: accrual },
        { provide: REQUEST, useValue: request },
        {
          provide: getConnectionToken(),
          useValue: {
            startSession: jest.fn().mockResolvedValue({
              withTransaction: async (fn: () => Promise<void>) => fn(),
              endSession: jest.fn(),
            }),
          },
        },
        { provide: getModelToken(Order.name), useValue: orderModel },
        {
          provide: getModelToken(OrderStatus.name),
          useValue: orderStatusModel,
        },
        { provide: getModelToken(Customer.name), useValue: customerModel },
        { provide: getModelToken(RewardRule.name), useValue: {} },
        { provide: getModelToken(RewardTier.name), useValue: {} },
        { provide: getModelToken(RewardLedger.name), useValue: ledgerModel },
        { provide: getModelToken(Setting.name), useValue: settingModel },
      ],
    }).compile();
    return module.resolve<RewardService>(RewardService);
  };

  it('applies the discount + REDEEM ledger row in one transaction', async () => {
    const service = await build();
    const result = await service.redeem({
      points: 300,
      orderId: orderId.toString(),
    });

    expect(result).toMatchObject({ redeemedPoints: 300, discount: 300 });

    // Ledger row: negative signed points against the order.
    const row = (ledgerModel.create.mock.calls[0] as unknown[][])[0][0] as {
      type: RewardLedgerTypeEnum;
      points: number;
    };
    expect(row.type).toBe(RewardLedgerTypeEnum.REDEEM);
    expect(row.points).toBe(-300);

    // Order: rewardDiscount/redeemedPoints incremented, total floored.
    const [, orderUpdate] = orderModel.updateOne.mock.calls[0] as [
      unknown,
      {
        $inc: { redeemedPoints: number; rewardDiscount: number };
        $set: { totalAmount: number; balanceDue: number };
      },
    ];
    expect(orderUpdate.$inc).toEqual({
      redeemedPoints: 300,
      rewardDiscount: 300,
    });
    expect(orderUpdate.$set.totalAmount).toBe(3700);

    // Cached balance set from the ledger-derived recompute (700), not math.
    const [, custUpdate] = customerModel.updateOne.mock.calls[0] as [
      unknown,
      { $set: { rewardPoints: number } },
    ];
    expect(custUpdate.$set.rewardPoints).toBe(700);
  });

  it("can't redeem more than the ledger balance", async () => {
    accrual.balanceOf = jest.fn().mockResolvedValue(100);
    const service = await build();

    await expect(
      service.redeem({ points: 300, orderId: orderId.toString() }),
    ).rejects.toThrow(BadRequestException);
    expect(ledgerModel.create).not.toHaveBeenCalled();
  });

  it('rejects a discount exceeding the order total (REDEEM_EXCEEDS_TOTAL)', async () => {
    settingModel.findOne.mockResolvedValue({ value: 100 }); // 1 pt = 100 XAF
    const service = await build();

    await expect(
      service.redeem({ points: 300, orderId: orderId.toString() }), // 30,000 > 4,000
    ).rejects.toThrow(BadRequestException);
  });

  it('only DRAFT orders can take a redemption', async () => {
    orderModel.findOne.mockResolvedValue(
      order({ orderStatusId: new Types.ObjectId() }),
    );
    const service = await build();

    await expect(
      service.redeem({ points: 100, orderId: orderId.toString() }),
    ).rejects.toThrow(BadRequestException);
  });

  it("a customer cannot redeem on someone else's order (scoped 404)", async () => {
    // The scope filter + customerId mismatch means the query finds nothing.
    orderModel.findOne.mockResolvedValue(null);
    const service = await build();

    await expect(
      service.redeem({
        points: 100,
        orderId: orderId.toString(),
        customerId: new Types.ObjectId().toString(), // someone else
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('a second redemption on the same order hits the unique index → ALREADY_REDEEMED', async () => {
    ledgerModel.create.mockRejectedValue(
      Object.assign(new Error('E11000'), { code: 11000 }),
    );
    const service = await build();

    await expect(
      service.redeem({ points: 100, orderId: orderId.toString() }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ALREADY_REDEEMED' }) as object,
    });
  });

  it('staff without CREATE RewardLedger are refused', async () => {
    const { can, build: buildAbility } = new AbilityBuilder(AppAbility);
    can('READ', 'Order');
    request.user.ability = buildAbility();
    const service = await build();

    await expect(
      service.redeem({ points: 100, orderId: orderId.toString() }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a manager can redeem on behalf of a customer', async () => {
    request.user.ability = manageAllAbility();
    request.user.userId = new Types.ObjectId().toString(); // staff actor
    const service = await build();

    const result = await service.redeem({
      customerId: selfId.toString(),
      points: 100,
      orderId: orderId.toString(),
    });
    expect(result.redeemedPoints).toBe(100);
  });
});
