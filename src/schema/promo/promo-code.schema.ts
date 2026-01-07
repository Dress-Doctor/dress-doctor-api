import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  EligibilityEnum,
  RewardTypeEnum,
} from '../dto/affiliate-partner-schema.dto';

export const promoCodeSchemaName = 'promo_code';
@Schema({ timestamps: true, collection: promoCodeSchemaName })
export class PromoCode extends Document<Types.ObjectId> {
  @Prop({ required: true, unique: true })
  promoCodeName: string;

  @Prop({ required: true, type: RewardTypeEnum })
  discountType: RewardTypeEnum;

  @Prop({ required: true })
  discountValue: number;

  @Prop({ required: false })
  maxUsage: number;

  @Prop({ required: true, default: 0 })
  usedCount: number;

  @Prop({ required: false })
  expiresAt: Date;

  @Prop({ required: true, type: EligibilityEnum })
  eligibility: EligibilityEnum;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const PromoCodeSchema = SchemaFactory.createForClass(PromoCode);
