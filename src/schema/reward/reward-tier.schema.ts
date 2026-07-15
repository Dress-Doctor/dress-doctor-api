import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { RewardTierMetricEnum } from './reward.dto';

export const rewardTierSchemaName = 'reward_tier';

/**
 * Loyalty tier (Standard/Silver/Gold) — seeded data (§10). A customer qualifies
 * for the highest tier whose `threshold` their rollup (`totalSpend` for SPEND,
 * `totalOrders` for ORDERS) meets; recomputed by the accrual job on paid
 * orders. `perk` is a free-form JSON description consumed by the frontends.
 */
@Schema({ timestamps: true, collection: rewardTierSchemaName })
export class RewardTier extends Document<Types.ObjectId> {
  @Prop({ required: true, unique: true })
  tierName: string;

  @Prop({
    required: true,
    type: String,
    enum: RewardTierMetricEnum,
    default: RewardTierMetricEnum.SPEND,
  })
  metric: RewardTierMetricEnum;

  // Minimum rollup value (int XAF for SPEND, count for ORDERS) to qualify.
  @Prop({ required: true, default: 0 })
  threshold: number;

  @Prop({ required: false, type: Object, default: {} })
  perk?: Record<string, unknown>;

  // Display/compare rank: higher rank = better tier.
  @Prop({ required: true, default: 0 })
  rank: number;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const RewardTierSchema = SchemaFactory.createForClass(RewardTier);
RewardTierSchema.index({ isActive: 1, rank: -1 });
