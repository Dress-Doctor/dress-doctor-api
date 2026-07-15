import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  type AppRequestWithUser,
  type PaginationDto,
} from 'src/dto/request-data.dto';
import { scopeFilter, scopePermitsCustomer } from 'src/helper/casl/casl-scope';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { SubscriptionPlan } from 'src/schema/subscription/subscription-plan.schema';
import {
  BillingCycleEnum,
  SubscriptionStatusEnum,
} from 'src/schema/subscription/subscription.dto';
import { Subscription } from 'src/schema/subscription/subscription.schema';
import { User } from 'src/schema/user/user.schema';
import { SubscribeDto } from './dto/subscribe.dto';
import { UpsertPlanDto } from './dto/upsert-plan.dto';

/** Period length per billing cycle, in months. */
const CYCLE_MONTHS: Record<BillingCycleEnum, number> = {
  [BillingCycleEnum.MONTHLY]: 1,
  [BillingCycleEnum.QUARTERLY]: 3,
};

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<Subscription>,
    @InjectModel(SubscriptionPlan.name)
    private readonly planModel: Model<SubscriptionPlan>,
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

  private addMonths(from: Date, months: number): Date {
    const d = new Date(from);
    d.setMonth(d.getMonth() + months);
    return d;
  }

  // ---------------------------------------------------------------- plans

  async listPlans(): Promise<SubscriptionPlan[]> {
    this.can('READ', 'SubscriptionPlan');
    return this.planModel.find({ isActive: true }).sort({ price: 1 });
  }

  async upsertPlan(data: UpsertPlanDto): Promise<SubscriptionPlan> {
    this.can('UPDATE', 'SubscriptionPlan');

    const changedBy = new Types.ObjectId(this.req.user.userId);
    const plan = await this.planModel.findOneAndUpdate(
      { planName: data.planName },
      {
        ...data,
        applicableServiceTypeIds: (data.applicableServiceTypeIds ?? []).map(
          (id) => new Types.ObjectId(id),
        ),
        isActive: data.isActive ?? true,
      },
      {
        upsert: true,
        returnDocument: 'after',
        context: { changedBy },
      } as never,
    );
    return plan as unknown as SubscriptionPlan;
  }

  // ------------------------------------------------------------- lifecycle

  /**
   * Enrol a customer on a plan. Quota/billing fields are snapshotted from the
   * plan so later plan edits never rewrite a live period. One live
   * (ACTIVE/PAUSED) subscription per customer — the pricing engine draws on
   * "the customer's active subscription", singular.
   *
   * Customers subscribe themselves only: the seeded CREATE Subscription
   * `{ customerId: '$self' }` condition is checked against the target.
   */
  async subscribe(data: SubscribeDto): Promise<Subscription> {
    this.can('CREATE', 'Subscription');
    const { userId, ability } = this.req.user;

    const targetCustomerId = new Types.ObjectId(data.customerId ?? userId);

    // Self-scope on create: no document to query yet, so check the candidate
    // row against the caller's CREATE conditions.
    if (
      !scopePermitsCustomer(ability, 'CREATE', 'Subscription', targetCustomerId)
    ) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Customer not found',
      });
    }

    const customer = await this.userModel.findById(targetCustomerId);
    if (!customer) {
      throw new BadRequestException({
        code: 'INVALID_CUSTOMER',
        message: 'Invalid customer id',
      });
    }

    const plan = await this.planModel.findOne({
      _id: new Types.ObjectId(data.planId),
      isActive: true,
    });
    if (!plan) {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        message: 'Subscription plan not found',
      });
    }

    const existing = await this.subscriptionModel.findOne({
      customerId: targetCustomerId,
      status: {
        $in: [SubscriptionStatusEnum.ACTIVE, SubscriptionStatusEnum.PAUSED],
      },
    });
    if (existing) {
      throw new ConflictException({
        code: 'SUBSCRIPTION_EXISTS',
        message: 'The customer already has a live subscription',
      });
    }

    const now = new Date();
    const doc = new this.subscriptionModel({
      customerId: targetCustomerId,
      planId: plan._id,
      officeId: this.req.data.officeId,
      status: SubscriptionStatusEnum.ACTIVE,
      billingCycle: plan.billingCycle,
      quotaType: plan.quotaType,
      quotaAmount: plan.quotaAmount,
      overagePolicy: plan.overagePolicy,
      currentPeriodStart: now,
      currentPeriodEnd: this.addMonths(now, CYCLE_MONTHS[plan.billingCycle]),
      remainingQuota: plan.quotaAmount,
      rolledOverQuota: 0,
      autoRenew: data.autoRenew ?? false,
    });
    doc.$locals.changedBy = new Types.ObjectId(userId);
    await doc.save();

    this.logger.log(
      `customer ${targetCustomerId.toString()} subscribed to ${plan.planName}`,
    );
    return doc;
  }

  /** Scoped by-id fetch: out-of-scope ids simply aren't found (no leak). */
  private async findScoped(
    id: string,
    action: CaslActionsDto,
  ): Promise<Subscription> {
    const scope = scopeFilter(this.req.user.ability, action, 'Subscription');
    const sub = await this.subscriptionModel.findOne({
      _id: new Types.ObjectId(id),
      ...scope,
    });
    if (!sub) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Subscription not found',
      });
    }
    return sub;
  }

  async findOne(id: string) {
    this.can('READ', 'Subscription');
    const sub = await this.findScoped(id, 'READ');
    await sub.populate({ model: SubscriptionPlan.name, path: 'planId' });
    return sub;
  }

  async findAll({ page, size, ...query }: PaginationDto) {
    this.can('READ', 'Subscription');

    const scope = scopeFilter(this.req.user.ability, 'READ', 'Subscription');
    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);
    const total = await this.subscriptionModel.countDocuments(scope);
    const data = await this.subscriptionModel
      .find(scope)
      .sort(sort)
      .skip(skip)
      .limit(size)
      .populate({ model: SubscriptionPlan.name, path: 'planId' });

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;
    return { total, data, nextPage };
  }

  private async transition(
    id: string,
    from: SubscriptionStatusEnum[],
    to: SubscriptionStatusEnum,
  ): Promise<Subscription> {
    this.can('UPDATE', 'Subscription');
    const sub = await this.findScoped(id, 'UPDATE');

    if (!from.includes(sub.status)) {
      throw new ConflictException({
        code: 'INVALID_SUBSCRIPTION_STATUS',
        message: `A ${sub.status} subscription cannot move to ${to}`,
      });
    }

    sub.status = to;
    sub.$locals.changedBy = new Types.ObjectId(this.req.user.userId);
    await sub.save();
    this.logger.log(`subscription ${id} → ${to}`);
    return sub;
  }

  async pause(id: string) {
    await this.transition(
      id,
      [SubscriptionStatusEnum.ACTIVE],
      SubscriptionStatusEnum.PAUSED,
    );
    return 'Subscription paused successfully';
  }

  async resume(id: string) {
    await this.transition(
      id,
      [SubscriptionStatusEnum.PAUSED],
      SubscriptionStatusEnum.ACTIVE,
    );
    return 'Subscription resumed successfully';
  }

  async cancel(id: string) {
    await this.transition(
      id,
      [SubscriptionStatusEnum.ACTIVE, SubscriptionStatusEnum.PAUSED],
      SubscriptionStatusEnum.CANCELLED,
    );
    return 'Subscription cancelled successfully';
  }

  /**
   * Roll a subscription into its next period — rollover-ONCE semantics (§2.2).
   * System path (no CASL): called by unit tests now and the Phase-5
   * subscription-billing cron later.
   *
   * Consumption draws down the carried-in `rolledOverQuota` first, so only
   * unused BASE quota (capped at one period's quotaAmount × rolloverPeriods)
   * carries forward; the prior period's rollover expires and can never roll
   * twice.
   */
  async renewPeriod(subscriptionId: Types.ObjectId): Promise<Subscription> {
    const sub = await this.subscriptionModel.findById(subscriptionId);
    if (!sub) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Subscription not found',
      });
    }

    const plan = sub.planId ? await this.planModel.findById(sub.planId) : null;
    const rolloverPeriods = plan?.rolloverPeriods ?? 1;

    const consumed = sub.quotaAmount + sub.rolledOverQuota - sub.remainingQuota;
    // Rollover is consumed first → whatever of it survived the period expires.
    const survivingRollover = Math.max(0, sub.rolledOverQuota - consumed);
    const baseRemaining = sub.remainingQuota - survivingRollover;
    const carry =
      rolloverPeriods > 0
        ? Math.min(baseRemaining, sub.quotaAmount * rolloverPeriods)
        : 0;

    const start = sub.currentPeriodEnd ?? new Date();
    sub.currentPeriodStart = start;
    sub.currentPeriodEnd = this.addMonths(
      start,
      CYCLE_MONTHS[sub.billingCycle],
    );
    sub.rolledOverQuota = carry;
    sub.remainingQuota = sub.quotaAmount + carry;
    await sub.save();

    this.logger.log(
      `subscription ${subscriptionId.toString()} renewed: carry ${carry}, quota ${sub.remainingQuota}`,
    );
    return sub;
  }
}
