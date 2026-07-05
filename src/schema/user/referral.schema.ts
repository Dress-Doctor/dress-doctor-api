import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from './user.schema';

export const referralSchemaName = 'referral';
@Schema({ timestamps: true, collection: referralSchemaName })
export class Referral extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  referrerId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  referredUserId: Types.ObjectId;

  @Prop({ required: true })
  rewardAmount: number;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);
