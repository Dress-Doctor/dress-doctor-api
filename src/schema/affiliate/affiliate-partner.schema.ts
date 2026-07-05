import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { User } from '../user/user.schema';
import { RewardTypeEnum } from './affiliate.dto';

export const affiliatePartnerSchemaName = 'affiliate_partner';
@Schema({ timestamps: true, collection: affiliatePartnerSchemaName })
export class AffiliatePartner extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: RewardTypeEnum })
  rewardType: RewardTypeEnum;

  @Prop({ required: true, default: 0 })
  rewardValue: number;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const AffiliatePartnerSchema =
  SchemaFactory.createForClass(AffiliatePartner);
