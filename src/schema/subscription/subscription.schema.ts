import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Office } from '../office/office.schema';
import { User } from '../user/user.schema';
import { SubscriptionPlan } from './subscription-plan.schema';
import {
  BillingCycleEnum,
  OveragePolicyEnum,
  QuotaTypeEnum,
  SubscriptionStatusEnum,
} from './subscription.dto';

export const subscriptionSchemaName = 'subscription';

/**
 * A customer's plan enrolment. Orders on the Subscription pricing model draw
 * on `remainingQuota` (in the plan's unit — pieces or kg); overage beyond it
 * is charged on the order per `overagePolicy` (§6-8). Quota fields are
 * snapshotted from the plan at subscribe/renew time so a later plan edit
 * never rewrites a live period. `remainingQuota` is system-maintained: it
 * only decrements in the order-confirm transaction and resets at renewal
 * (rollover-once honoured via `rolledOverQuota`). The plan fee itself is
 * billed by subscription-billing (Phase 5).
 */
@Schema({ timestamps: true, collection: subscriptionSchemaName })
export class Subscription extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  customerId: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId, ref: SubscriptionPlan.name })
  planId?: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId, ref: Office.name })
  officeId?: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
    enum: SubscriptionStatusEnum,
    default: SubscriptionStatusEnum.ACTIVE,
  })
  status: SubscriptionStatusEnum;

  @Prop({
    required: true,
    type: String,
    enum: BillingCycleEnum,
    default: BillingCycleEnum.MONTHLY,
  })
  billingCycle: BillingCycleEnum;

  @Prop({
    required: true,
    type: String,
    enum: QuotaTypeEnum,
    default: QuotaTypeEnum.WEIGHT_KG,
  })
  quotaType: QuotaTypeEnum;

  // Per-period quota snapshot from the plan (pieces or kg).
  @Prop({ required: true, default: 0 })
  quotaAmount: number;

  @Prop({
    required: true,
    type: String,
    enum: OveragePolicyEnum,
    default: OveragePolicyEnum.PER_UNIT,
  })
  overagePolicy: OveragePolicyEnum;

  @Prop({ required: false })
  currentPeriodStart?: Date;

  @Prop({ required: false })
  currentPeriodEnd?: Date;

  // Remaining covered quota for the current period (base + rollover);
  // decremented once per order at confirm.
  @Prop({ required: true, default: 0 })
  remainingQuota: number;

  // The slice of remainingQuota carried in from the PRIOR period. Consumption
  // draws it down first, so it can never roll over twice.
  @Prop({ required: true, default: 0 })
  rolledOverQuota: number;

  @Prop({ required: true, default: false })
  autoRenew: boolean;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
SubscriptionSchema.index({ customerId: 1 });
SubscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });
