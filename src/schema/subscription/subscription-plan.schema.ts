import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  BillingCycleEnum,
  OveragePolicyEnum,
  QuotaTypeEnum,
} from './subscription.dto';

export const subscriptionPlanSchemaName = 'subscription_plan';

/** Extra per-category allowance beyond the main quota (e.g. 4 bedsheets). */
export interface IncludedAllowance {
  category: string;
  unit: string;
  amount: number;
}

/**
 * Subscription plan catalog — seeded DATA (Basic/Standard/Premium ×
 * pieces/kg), not code (§2.2). The plan fee (`price`) is billed by
 * subscription-billing (Phase 5), never on an order; orders only draw quota.
 */
@Schema({ timestamps: true, collection: subscriptionPlanSchemaName })
export class SubscriptionPlan extends Document<Types.ObjectId> {
  @Prop({ required: true, unique: true })
  planName: string;

  @Prop({ required: false })
  description?: string;

  // Plan fee per billing cycle — integer XAF.
  @Prop({ required: true })
  price: number;

  @Prop({
    required: true,
    type: String,
    enum: BillingCycleEnum,
    default: BillingCycleEnum.MONTHLY,
  })
  billingCycle: BillingCycleEnum;

  @Prop({ required: true, type: String, enum: QuotaTypeEnum })
  quotaType: QuotaTypeEnum;

  // Pieces or kg per period, per quotaType.
  @Prop({ required: true })
  quotaAmount: number;

  @Prop({
    required: true,
    type: String,
    enum: OveragePolicyEnum,
    default: OveragePolicyEnum.PER_UNIT,
  })
  overagePolicy: OveragePolicyEnum;

  @Prop({ required: false, type: Array, default: [] })
  includedAllowances: IncludedAllowance[];

  // Unused quota rolls over this many periods (default 1 — once).
  @Prop({ required: true, default: 1 })
  rolloverPeriods: number;

  @Prop({ required: false })
  pickupsPerPeriod?: number;

  @Prop({ required: false })
  turnaroundHours?: number;

  @Prop({ required: false, type: [Types.ObjectId], default: [] })
  applicableServiceTypeIds: Types.ObjectId[];

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const SubscriptionPlanSchema =
  SchemaFactory.createForClass(SubscriptionPlan);
SubscriptionPlanSchema.index({ isActive: 1, quotaType: 1 });
