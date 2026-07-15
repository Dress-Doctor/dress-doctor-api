import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
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

export interface AccrualResult {
  credited: boolean;
  points: number;
  accrual: number;
  milestone: number;
}

/**
 * The order.paid side of the rewards engine (§2.1), run by the reward-accrual
 * processor — NOT in a request context (no REQUEST/CASL here; authorization
 * happened on the payment write that emitted the event).
 *
 * Idempotent per order, three layers deep:
 *  1. BullMQ jobId `reward-accrual-<orderId>` dedupes queued duplicates;
 *  2. an EARN-row existence check skips already-credited orders cheaply;
 *  3. the unique (orderId, type) ledger index turns a lost race into E11000,
 *     which is swallowed as "already credited".
 *
 * Inside ONE transaction it: appends the EARN ledger row, bumps the customer
 * rollups (totalOrders/totalSpend — this is their §1 maintenance point),
 * recomputes the cached balance from the ledger (Σ points — ledger-derived,
 * never incremented blindly), and recomputes the tier from the fresh rollups.
 */
@Injectable()
export class RewardAccrualService {
  private readonly logger = new Logger(RewardAccrualService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<Customer>,
    @InjectModel(RewardRule.name)
    private readonly rewardRuleModel: Model<RewardRule>,
    @InjectModel(RewardTier.name)
    private readonly rewardTierModel: Model<RewardTier>,
    @InjectModel(RewardLedger.name)
    private readonly rewardLedgerModel: Model<RewardLedger>,
  ) {}

  /** Σ(points) for a customer — the ledger-derived balance. */
  async balanceOf(
    customerId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<number> {
    const rows = await this.rewardLedgerModel.aggregate<{
      _id: null;
      balance: number;
    }>(
      [
        { $match: { customerId } },
        { $group: { _id: null, balance: { $sum: '$points' } } },
      ],
      session ? { session } : undefined,
    );
    return rows[0]?.balance ?? 0;
  }

  /** Highest active tier the rollups qualify for (by rank), or null. */
  async resolveTier(
    totalSpend: number,
    totalOrders: number,
  ): Promise<RewardTier | null> {
    const tiers = await this.rewardTierModel
      .find({ isActive: true })
      .sort({ rank: -1 });
    for (const tier of tiers) {
      const value =
        tier.metric === RewardTierMetricEnum.ORDERS ? totalOrders : totalSpend;
      if (value >= tier.threshold) return tier;
    }
    return null;
  }

  async accrueForOrder(orderId: string): Promise<AccrualResult> {
    const id = new Types.ObjectId(orderId);
    const none: AccrualResult = {
      credited: false,
      points: 0,
      accrual: 0,
      milestone: 0,
    };

    const order = await this.orderModel.findById(id);
    if (!order) {
      this.logger.warn(`reward-accrual: order ${orderId} not found — skip`);
      return none;
    }
    // Re-check the trigger condition: a replayed/reconciled event may race a
    // refund that un-paid the order.
    if (order.paymentStatus !== OrderPaymentStatusEnum.PAID) {
      this.logger.warn(
        `reward-accrual: order ${order.orderCode} is ${order.paymentStatus}, not PAID — skip`,
      );
      return none;
    }

    // Cheap durable-idempotency check (the unique index is the backstop).
    const already = await this.rewardLedgerModel.exists({
      orderId: id,
      type: RewardLedgerTypeEnum.EARN,
    });
    if (already) {
      this.logger.log(
        `reward-accrual: order ${order.orderCode} already credited — skip`,
      );
      return none;
    }

    const rules = await this.rewardRuleModel.find({ isActive: true });
    const accrualRule = rules.find(
      (r) => r.type === RewardRuleTypeEnum.ACCRUAL,
    );
    const milestoneRule = rules.find(
      (r) => r.type === RewardRuleTypeEnum.MILESTONE,
    );

    // Integer maths, floored explicitly (§1: money = int XAF, no floats).
    let accrualPoints = 0;
    const per = accrualRule?.criteria.per ?? 0;
    if (accrualRule && per > 0) {
      accrualPoints =
        Math.floor(order.totalAmount / per) *
        (accrualRule.criteria.points ?? 0);
    }

    const customer = await this.customerModel.findOne({
      userId: order.customerId,
    });
    if (!customer) {
      this.logger.warn(
        `reward-accrual: no customer profile for user ${order.customerId.toString()} — skip`,
      );
      return none;
    }

    // This paid order's ordinal is the rollup AFTER counting it.
    const paidOrdinal = customer.totalOrders + 1;
    let milestonePoints = 0;
    const everyNth = milestoneRule?.criteria.everyNthOrder ?? 0;
    if (milestoneRule && everyNth > 0 && paidOrdinal % everyNth === 0) {
      milestonePoints = milestoneRule.criteria.points ?? 0;
    }

    const totalPoints = accrualPoints + milestonePoints;
    const newTotalSpend = customer.totalSpend + order.totalAmount;

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.rewardLedgerModel.create(
          [
            {
              customerId: order.customerId,
              type: RewardLedgerTypeEnum.EARN,
              points: totalPoints,
              orderId: id,
              reason: `Paid order ${order.orderCode}`,
              meta: { accrual: accrualPoints, milestone: milestonePoints },
            },
          ],
          { session },
        );

        const balance = await this.balanceOf(order.customerId, session);
        const tier = await this.resolveTier(newTotalSpend, paidOrdinal);

        await this.customerModel.updateOne(
          { _id: customer._id },
          {
            $inc: { totalOrders: 1, totalSpend: order.totalAmount },
            $set: {
              rewardPoints: balance,
              ...(tier ? { rewardTierId: tier._id } : {}),
            },
          },
          { session },
        );
      });
    } catch (err) {
      // Lost race on the unique (orderId, EARN) index → someone else credited.
      if ((err as { code?: number }).code === 11000) {
        this.logger.log(
          `reward-accrual: duplicate credit for ${order.orderCode} blocked by index`,
        );
        return none;
      }
      throw err;
    } finally {
      await session.endSession();
    }

    this.logger.log(
      `reward-accrual: order ${order.orderCode} → +${totalPoints} pts (accrual ${accrualPoints}, milestone ${milestonePoints})`,
    );
    return {
      credited: true,
      points: totalPoints,
      accrual: accrualPoints,
      milestone: milestonePoints,
    };
  }
}
