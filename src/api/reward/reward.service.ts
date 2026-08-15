import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  type AppRequestWithUser,
  type PaginationDto,
} from 'src/dto/request-data.dto';
import { scopeFilter } from 'src/helper/casl/casl-scope';
import { auditContext } from 'src/helper/service/audit-context';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { OrderStatusEnum } from 'src/schema/order/order.dto';
import { Order } from 'src/schema/order/order.schema';
import { RewardLedger } from 'src/schema/reward/reward-ledger.schema';
import { RewardRule } from 'src/schema/reward/reward-rule.schema';
import { RewardTier } from 'src/schema/reward/reward-tier.schema';
import {
  RewardLedgerTypeEnum,
  RewardRuleTypeEnum,
} from 'src/schema/reward/reward.dto';
import { Setting, SettingKeys } from 'src/schema/settings/settings.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { RewardAccrualService } from './reward-accrual.service';
import { RedeemDto } from './dto/redeem.dto';
import { UpsertRuleDto } from './dto/upsert-rule.dto';
import { UpsertTierDto } from './dto/upsert-tier.dto';

@Injectable()
export class RewardService {
  private readonly logger = new Logger(RewardService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    private readonly accrualService: RewardAccrualService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(OrderStatus.name)
    private readonly orderStatusModel: Model<OrderStatus>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<Customer>,
    @InjectModel(RewardRule.name)
    private readonly rewardRuleModel: Model<RewardRule>,
    @InjectModel(RewardTier.name)
    private readonly rewardTierModel: Model<RewardTier>,
    @InjectModel(RewardLedger.name)
    private readonly rewardLedgerModel: Model<RewardLedger>,
    @InjectModel(Setting.name) private readonly settingModel: Model<Setting>,
  ) {}

  private can(action: CaslActionsDto, subject: CaslSubjectsDto) {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;

    if (!ability.can(action, subject)) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} is ${log}`);
      throw new BadRequestException(`You are ${log}`);
    }
  }

  // ---------------------------------------------------------------- config

  async listRules(): Promise<RewardRule[]> {
    this.can('READ', 'RewardRule');
    return this.rewardRuleModel.find().sort({ type: 1 });
  }

  /** One active rule per type: upsert by type, criteria validated per shape. */
  async upsertRule(data: UpsertRuleDto): Promise<RewardRule> {
    this.can('UPDATE', 'RewardRule');

    if (data.type === RewardRuleTypeEnum.ACCRUAL && !data.criteria.per) {
      throw new BadRequestException({
        code: 'INVALID_RULE_CRITERIA',
        message: 'An ACCRUAL rule requires criteria.per (XAF per point step)',
      });
    }
    if (
      data.type === RewardRuleTypeEnum.MILESTONE &&
      !data.criteria.everyNthOrder
    ) {
      throw new BadRequestException({
        code: 'INVALID_RULE_CRITERIA',
        message: 'A MILESTONE rule requires criteria.everyNthOrder',
      });
    }

    const changedBy = new Types.ObjectId(this.req.user.userId);
    const rule = await this.rewardRuleModel.findOneAndUpdate(
      { type: data.type },
      {
        type: data.type,
        criteria: data.criteria as unknown as Record<string, number>,
        description: data.description,
        isActive: data.isActive ?? true,
      },
      {
        upsert: true,
        returnDocument: 'after',
        context: auditContext(this.req, changedBy),
      } as never,
    );
    return rule as unknown as RewardRule;
  }

  async listTiers(): Promise<RewardTier[]> {
    this.can('READ', 'RewardTier');
    return this.rewardTierModel.find().sort({ rank: 1 });
  }

  async upsertTier(data: UpsertTierDto): Promise<RewardTier> {
    this.can('UPDATE', 'RewardTier');

    const changedBy = new Types.ObjectId(this.req.user.userId);
    const tier = await this.rewardTierModel.findOneAndUpdate(
      { tierName: data.tierName },
      { ...data, isActive: data.isActive ?? true },
      {
        upsert: true,
        returnDocument: 'after',
        context: auditContext(this.req, changedBy),
      } as never,
    );
    return tier as unknown as RewardTier;
  }

  // ---------------------------------------------------------------- reads

  /** Ledger list — auto-scoped: customers see only their own entries. */
  async listLedger({ page, size, ...query }: PaginationDto) {
    this.can('READ', 'RewardLedger');

    const scope = scopeFilter(this.req.user.ability, 'READ', 'RewardLedger');
    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);
    const total = await this.rewardLedgerModel.countDocuments(scope);
    const data = await this.rewardLedgerModel
      .find(scope)
      .sort(sort)
      .skip(skip)
      .limit(size);

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;
    return { total, data, nextPage };
  }

  /**
   * Balance + tier + progress + recent ledger for one customer (used by the
   * self-scoped `GET /customers/:id/rewards`). The caller has already been
   * scope-checked against the customer id.
   */
  async rewardsSummaryFor(customerUserId: Types.ObjectId) {
    const customer = await this.customerModel.findOne({
      userId: customerUserId,
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Customer not found',
      });
    }

    const [balance, tiers, ledger] = await Promise.all([
      this.accrualService.balanceOf(customerUserId),
      this.rewardTierModel.find({ isActive: true }).sort({ rank: 1 }),
      this.rewardLedgerModel
        .find({ customerId: customerUserId })
        .sort({ createdAt: -1 })
        .limit(20),
    ]);

    const currentTier =
      tiers.find(
        (t) => t._id.toString() === customer.rewardTierId?.toString(),
      ) ?? null;
    const nextTier =
      tiers.find((t) => t.rank > (currentTier?.rank ?? -1)) ?? null;

    return {
      balance,
      totalOrders: customer.totalOrders,
      totalSpend: customer.totalSpend,
      tier: currentTier,
      nextTier,
      ledger,
    };
  }

  // ------------------------------------------------------------- redemption

  /** XAF value of one point (setting; data, not code). */
  private async pointValueXaf(): Promise<number> {
    const setting = await this.settingModel.findOne({
      key: SettingKeys.rewardPointValueXaf,
      officeId: null,
    });
    if (!setting || setting.value <= 0) {
      throw new BadRequestException({
        code: 'SETTING_NOT_CONFIGURED',
        message: `Rate '${SettingKeys.rewardPointValueXaf}' is not configured`,
      });
    }
    return setting.value;
  }

  /**
   * Apply points to a DRAFT order: one transaction writes the REDEEM ledger
   * row, recomputes the cached balance from the ledger, and discounts the
   * order (§2.1). Can't overdraw the balance; integer XAF, floored; one
   * redemption per order (unique (orderId, REDEEM) index).
   *
   * Customers redeem their own points only — the seeded CREATE RewardLedger
   * `{ customerId: '$self' }` condition is enforced as a query filter on the
   * target order, so someone else's order simply isn't found (404, no leak).
   */
  async redeem(data: RedeemDto): Promise<{
    redeemedPoints: number;
    discount: number;
    balance: number;
    message: string;
  }> {
    this.can('CREATE', 'RewardLedger');
    const { userId } = this.req.user;

    const targetCustomerId = new Types.ObjectId(data.customerId ?? userId);
    const orderId = new Types.ObjectId(data.orderId);

    // Self/office scope on the order via the ledger-create conditions: for a
    // customer this resolves to { customerId: <their id> }.
    const scope = scopeFilter(this.req.user.ability, 'CREATE', 'RewardLedger');
    const order = await this.orderModel.findOne({
      _id: orderId,
      customerId: targetCustomerId,
      ...scope,
    });
    if (!order) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Order not found',
      });
    }

    const draftStatus = await this.orderStatusModel.findOne({
      orderStatusName: OrderStatusEnum.DRAFT,
    });
    if (
      !draftStatus ||
      order.orderStatusId.toString() !== draftStatus._id.toString()
    ) {
      throw new BadRequestException({
        code: 'ORDER_NOT_DRAFT',
        message: 'Points can only be redeemed against a draft order',
      });
    }

    const rate = await this.pointValueXaf();
    const discount = data.points * rate; // ints × ints — no flooring loss
    if (discount > order.totalAmount) {
      throw new BadRequestException({
        code: 'REDEEM_EXCEEDS_TOTAL',
        message: `The discount (${discount} XAF) exceeds the order total (${order.totalAmount} XAF)`,
      });
    }

    let balance = 0;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        // Balance check INSIDE the txn: a concurrent redeem conflicts on the
        // customer doc, retries, and re-checks against the fresh ledger.
        const current = await this.accrualService.balanceOf(
          targetCustomerId,
          session,
        );
        if (data.points > current) {
          throw new BadRequestException({
            code: 'INSUFFICIENT_POINTS',
            message: `Balance is ${current} points; cannot redeem ${data.points}`,
          });
        }

        await this.rewardLedgerModel.create(
          [
            {
              customerId: targetCustomerId,
              type: RewardLedgerTypeEnum.REDEEM,
              points: -data.points,
              orderId,
              reason: `Redeemed on order ${order.orderCode}`,
              meta: { discount, rate },
            },
          ],
          { session },
        );

        balance = await this.accrualService.balanceOf(
          targetCustomerId,
          session,
        );
        await this.customerModel.updateOne(
          { userId: targetCustomerId },
          { $set: { rewardPoints: balance } },
          { session },
        );

        const newTotal = Math.max(0, order.totalAmount - discount);
        await this.orderModel.updateOne(
          { _id: orderId },
          {
            $inc: { redeemedPoints: data.points, rewardDiscount: discount },
            $set: {
              totalAmount: newTotal,
              balanceDue: Math.max(0, newTotal - order.amountPaid),
            },
          },
          { session },
        );
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new BadRequestException({
          code: 'ALREADY_REDEEMED',
          message: 'Points have already been redeemed on this order',
        });
      }
      throw err;
    } finally {
      await session.endSession();
    }

    this.logger.log(
      `redeemed ${data.points} pts (${discount} XAF) on order ${order.orderCode}`,
    );
    return {
      redeemedPoints: data.points,
      discount,
      balance,
      message: 'Points redeemed successfully',
    };
  }
}
