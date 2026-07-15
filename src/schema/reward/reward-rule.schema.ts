import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { RewardRuleTypeEnum } from './reward.dto';

export const rewardRuleSchemaName = 'reward_rule';

/**
 * Configurable rewards rule — data, not code (§10). `criteria` is a JSON blob
 * whose shape depends on `type` (see reward.dto.ts); the accrual job reads the
 * active rules at run time, so changing the economics is a data edit, not a
 * deploy. One active rule per type is enforced by the service.
 */
@Schema({ timestamps: true, collection: rewardRuleSchemaName })
export class RewardRule extends Document<Types.ObjectId> {
  @Prop({ required: true, type: String, enum: RewardRuleTypeEnum })
  type: RewardRuleTypeEnum;

  @Prop({ required: true, type: Object })
  criteria: Partial<Record<string, number>>;

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const RewardRuleSchema = SchemaFactory.createForClass(RewardRule);
RewardRuleSchema.index({ type: 1, isActive: 1 });
