import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ReferralStatusEnum } from './referral.dto';
import { User } from './user.schema';

export const referralSchemaName = 'referral';
@Schema({ timestamps: true, collection: referralSchemaName })
export class Referral extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  referrerId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  referredUserId: Types.ObjectId;

  // Registration opens a PENDING referral; qualification/reward happen later.
  @Prop({
    required: true,
    type: String,
    enum: ReferralStatusEnum,
    default: ReferralStatusEnum.PENDING,
  })
  status: ReferralStatusEnum;

  // The referral reward becomes an issued PromoCode in Phase 4 (CLAUDE.md gap
  // #4); kept as a placeholder amount for now, no longer required.
  @Prop({ required: true, default: 0 })
  rewardAmount: number;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);
ReferralSchema.index({ referrerId: 1 });
ReferralSchema.index({ referredUserId: 1 });
