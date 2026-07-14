import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { PromoCode } from './promo-code.schema';
import { User } from '../user/user.schema';
import { Order } from '../order/order.schema';

export const promoCodeUsageSchemaName = 'promo_code_usage';
@Schema({ timestamps: true, collection: promoCodeUsageSchemaName })
export class PromoCodeUsage extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: PromoCode.name })
  promoCodeId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: Order.name })
  orderId: Types.ObjectId;

  // Discount (XAF) this redemption actually applied — recorded so
  // per-customer/total caps and reporting don't have to recompute it.
  @Prop({ required: true, default: 0 })
  discountApplied: number;

  @Prop({ required: true })
  useAt: Date;
}

export const PromoCodeUsageSchema =
  SchemaFactory.createForClass(PromoCodeUsage);
PromoCodeUsageSchema.index({ promoCodeId: 1, userId: 1 });
PromoCodeUsageSchema.index({ orderId: 1 });
