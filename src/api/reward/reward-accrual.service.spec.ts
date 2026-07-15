import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { OrderPaymentStatusEnum } from 'src/schema/order/order.dto';
import { Order } from 'src/schema/order/order.schema';
import { RewardLedger } from 'src/schema/reward/reward-ledger.schema';
import { RewardRule } from 'src/schema/reward/reward-rule.schema';
import { RewardTier } from 'src/schema/reward/reward-tier.schema';
import {
  RewardLedgerTypeEnum,
  RewardRuleTypeEnum,
  RewardTierMetricEnum,
} from 'src/schema/reward/reward.dto';
import { Customer } from 'src/schema/user/customer.schema';
import { RewardAccrualService } from './reward-accrual.service';

describe('RewardAccrualService', () => {
  let service: RewardAccrualService;
  let orderModel: { findById: jest.Mock };
  let customerModel: { findOne: jest.Mock; updateOne: jest.Mock };
  let ruleModel: { find: jest.Mock };
  let tierModel: { find: jest.Mock };
  let ledgerModel: {
    exists: jest.Mock;
    create: jest.Mock;
    aggregate: jest.Mock;
  };

  const customerId = new Types.ObjectId();
  const orderId = new Types.ObjectId();

  const order = (over: Record<string, unknown> = {}) => ({
    _id: orderId,
    orderCode: 'OR-1',
    customerId,
    totalAmount: 5250,
    paymentStatus: OrderPaymentStatusEnum.PAID,
    ...over,
  });

  const accrualRule = (criteria = { per: 100, points: 1 }) => ({
    type: RewardRuleTypeEnum.ACCRUAL,
    criteria,
    isActive: true,
  });
  const milestoneRule = (criteria = { everyNthOrder: 5, points: 500 }) => ({
    type: RewardRuleTypeEnum.MILESTONE,
    criteria,
    isActive: true,
  });

  const tier = (name: string, threshold: number, rank: number) => ({
    _id: new Types.ObjectId(),
    tierName: name,
    metric: RewardTierMetricEnum.SPEND,
    threshold,
    rank,
    isActive: true,
  });
  const tiers = [
    tier('Gold', 500000, 2),
    tier('Silver', 100000, 1),
    tier('Standard', 0, 0),
  ];

  const sortable = (rows: unknown[]) => ({
    sort: jest.fn().mockResolvedValue(rows),
  });

  beforeEach(async () => {
    orderModel = { findById: jest.fn().mockResolvedValue(order()) };
    customerModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        userId: customerId,
        totalOrders: 0,
        totalSpend: 0,
      }),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    ruleModel = {
      find: jest.fn().mockResolvedValue([accrualRule(), milestoneRule()]),
    };
    tierModel = { find: jest.fn().mockReturnValue(sortable(tiers)) };
    ledgerModel = {
      exists: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue([{}]),
      aggregate: jest.fn().mockResolvedValue([{ _id: null, balance: 52 }]),
    };

    const connection = {
      startSession: jest.fn().mockResolvedValue({
        withTransaction: async (fn: () => Promise<void>) => fn(),
        endSession: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RewardAccrualService,
        { provide: getConnectionToken(), useValue: connection },
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: getModelToken(Customer.name), useValue: customerModel },
        { provide: getModelToken(RewardRule.name), useValue: ruleModel },
        { provide: getModelToken(RewardTier.name), useValue: tierModel },
        { provide: getModelToken(RewardLedger.name), useValue: ledgerModel },
      ],
    }).compile();

    service = module.get(RewardAccrualService);
  });

  const ledgerRow = () =>
    (ledgerModel.create.mock.calls[0] as unknown[][])[0][0] as {
      type: RewardLedgerTypeEnum;
      points: number;
      orderId: Types.ObjectId;
      meta: { accrual: number; milestone: number };
    };

  it('credits floor(totalAmount / per) × points per the active ACCRUAL rule', async () => {
    const result = await service.accrueForOrder(orderId.toString());

    // 5250 / 100 → 52 (floored), ×1 point.
    expect(result).toMatchObject({ credited: true, accrual: 52 });
    expect(ledgerRow().type).toBe(RewardLedgerTypeEnum.EARN);
    expect(ledgerRow().meta.accrual).toBe(52);
  });

  it('applies the MILESTONE bonus on every Nth paid order', async () => {
    // 4 prior paid orders → this is the 5th.
    customerModel.findOne.mockResolvedValue({
      _id: new Types.ObjectId(),
      userId: customerId,
      totalOrders: 4,
      totalSpend: 40000,
    });

    const result = await service.accrueForOrder(orderId.toString());

    expect(result.milestone).toBe(500);
    expect(result.points).toBe(52 + 500);
  });

  it('no milestone off the Nth ordinal', async () => {
    customerModel.findOne.mockResolvedValue({
      _id: new Types.ObjectId(),
      userId: customerId,
      totalOrders: 2,
      totalSpend: 0,
    });

    const result = await service.accrueForOrder(orderId.toString());
    expect(result.milestone).toBe(0);
  });

  it('is idempotent: an existing EARN row for the order skips crediting', async () => {
    ledgerModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

    const result = await service.accrueForOrder(orderId.toString());

    expect(result.credited).toBe(false);
    expect(ledgerModel.create).not.toHaveBeenCalled();
    expect(customerModel.updateOne).not.toHaveBeenCalled();
  });

  it('a lost duplicate-key race (E11000) is swallowed as already-credited', async () => {
    const dup = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
    });
    ledgerModel.create.mockRejectedValue(dup);

    const result = await service.accrueForOrder(orderId.toString());
    expect(result.credited).toBe(false);
  });

  it('skips an order that is not PAID (replay after refund)', async () => {
    orderModel.findById.mockResolvedValue(
      order({ paymentStatus: OrderPaymentStatusEnum.PARTIAL }),
    );

    const result = await service.accrueForOrder(orderId.toString());
    expect(result.credited).toBe(false);
    expect(ledgerModel.create).not.toHaveBeenCalled();
  });

  it('maintains rollups and the ledger-derived cached balance in the txn', async () => {
    await service.accrueForOrder(orderId.toString());

    const [filter, update] = customerModel.updateOne.mock.calls[0] as [
      Record<string, unknown>,
      {
        $inc: { totalOrders: number; totalSpend: number };
        $set: { rewardPoints: number };
      },
    ];
    expect(filter).toBeDefined();
    expect(update.$inc).toEqual({ totalOrders: 1, totalSpend: 5250 });
    // Balance comes from the ledger aggregate (52), not a blind $inc.
    expect(update.$set.rewardPoints).toBe(52);
  });

  it('recomputes the tier from the post-order rollups', async () => {
    customerModel.findOne.mockResolvedValue({
      _id: new Types.ObjectId(),
      userId: customerId,
      totalOrders: 10,
      totalSpend: 99000, // + 5250 → 104250 ≥ Silver's 100000
    });

    await service.accrueForOrder(orderId.toString());

    const [, update] = customerModel.updateOne.mock.calls[0] as [
      unknown,
      { $set: { rewardTierId?: Types.ObjectId } },
    ];
    const silver = tiers.find((t) => t.tierName === 'Silver');
    expect(update.$set.rewardTierId?.toString()).toBe(silver?._id.toString());
  });

  it('with no active rules, credits a 0-point EARN row (still idempotency-marked)', async () => {
    ruleModel.find.mockResolvedValue([]);
    ledgerModel.aggregate.mockResolvedValue([{ _id: null, balance: 0 }]);

    const result = await service.accrueForOrder(orderId.toString());

    expect(result.credited).toBe(true);
    expect(result.points).toBe(0);
    expect(ledgerRow().points).toBe(0);
  });
});
