import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EligibilityEnum, RewardTypeEnum } from '../affiliate/affiliate.dto';
import { ServiceType } from '../catalog/service-type.schema';

export const promoCodeSchemaName = 'promo_code';
@Schema({ timestamps: true, collection: promoCodeSchemaName })
export class PromoCode extends Document<Types.ObjectId> {
  @Prop({ required: true, unique: true })
  promoCodeName: string;

  @Prop({ required: true, type: String, enum: RewardTypeEnum })
  discountType: RewardTypeEnum;

  @Prop({ required: true })
  discountValue: number;

  @Prop({ required: false })
  maxUsage: number;

  @Prop({ required: true, default: 0 })
  usedCount: number;

  // Per-customer redemption cap (0 = unlimited). Enforced against
  // promo-code-usages in the validation path.
  @Prop({ required: true, default: 0 })
  perCustomerLimit: number;

  // Minimum order subtotal (XAF) required for the code to apply.
  @Prop({ required: true, default: 0 })
  minOrderValue: number;

  // Empty = applies to all service types; otherwise the code only
  // applies when the order's service type is in this list.
  @Prop({ type: [Types.ObjectId], ref: ServiceType.name, default: [] })
  applicableServiceTypeIds: Types.ObjectId[];

  // Whether this code can be combined with other applied discounts.
  @Prop({ required: true, default: false })
  stackable: boolean;

  @Prop({ required: false })
  validFrom?: Date;

  @Prop({ required: false })
  expiresAt: Date;

  @Prop({ required: true, type: String, enum: EligibilityEnum })
  eligibility: EligibilityEnum;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const PromoCodeSchema = SchemaFactory.createForClass(PromoCode);
PromoCodeSchema.index({ isActive: 1, expiresAt: 1 });
