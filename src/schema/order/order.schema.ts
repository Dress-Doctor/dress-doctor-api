import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PickupRequest } from '../pickup/pickup-request.schema';
import { OrderStatus } from './order-status.schema';
import { Currency } from '../catalog/currency.schema';
import { User } from '../user/user.schema';
import { OrderPaymentStatusEnum, PricingModelEnum } from './order.dto';
import { PromoCode } from '../promo/promo-code.schema';
import { Subscription } from '../subscription/subscription.schema';
import { Office } from '../office/office.schema';

export const orderSchemaName = 'order';
@Schema({ timestamps: true, collection: orderSchemaName })
export class Order extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  customerId: Types.ObjectId;

  // Office the order belongs to — office-scopes non-global staff (§3.7).
  @Prop({ required: false, type: Types.ObjectId, ref: Office.name })
  officeId?: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: Currency.name })
  currencyId: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId, ref: PickupRequest.name })
  pickupRequestId?: Types.ObjectId;

  @Prop({ required: true, unique: true })
  orderCode: string;

  // Server-authoritative pricing model (§6-8); never a client price.
  @Prop({
    type: String,
    required: true,
    enum: PricingModelEnum,
    default: PricingModelEnum.PER_PIECE,
  })
  pricingModel: PricingModelEnum;

  // Required (>0) for PER_KG; drives Per KG / Subscription pricing.
  @Prop({ required: true, default: 0 })
  totalWeightKg: number;

  @Prop({ required: true, default: 0 })
  fee: number;

  // subtotal (kept as orderAmount for continuity): Σ lineTotal | weight×rate | overage.
  @Prop({ required: true, default: 0 })
  orderAmount: number;

  // Staff ad-hoc discount (permissioned) — not a promo.
  @Prop({ required: true, default: 0 })
  manualDiscount: number;

  // Discount from the applied promo, computed by the pricing engine.
  @Prop({ required: true, default: 0 })
  promoDiscount: number;

  // Combined manual+promo, kept for existing consumers.
  @Prop({ required: true, default: 0 })
  discountAmount: number;

  // Reward-point redemption applied to this order (int XAF) + the points
  // spent for it. Written only by the transactional redeem path (§10) —
  // reprice() preserves it, never recomputes it.
  @Prop({ required: true, default: 0 })
  rewardDiscount: number;

  @Prop({ required: true, default: 0 })
  redeemedPoints: number;

  // The applied promo code (string) — kept so reprice re-runs the engine; its id
  // is resolved on the snapshot. Usage is recorded once, at confirm.
  @Prop({ required: false })
  promoCode?: string;

  @Prop({ required: false, type: Types.ObjectId, ref: PromoCode.name })
  promoCodeId?: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId, ref: Subscription.name })
  subscriptionId?: Types.ObjectId;

  // Snapshot of quota this order will consume; applied once at confirm.
  @Prop({ required: true, default: 0 })
  quotaConsumed: number;

  @Prop({ required: true, default: 0 })
  totalAmount: number;

  @Prop({ required: true, default: 0 })
  amountPaid: number;

  @Prop({ required: true, default: 0 })
  balanceDue: number;

  @Prop({
    type: String,
    required: true,
    default: 'UNPAID',
    enum: OrderPaymentStatusEnum,
  })
  paymentStatus: OrderPaymentStatusEnum;

  // Computed, never hand-set: an order needing attention — READY/DELIVERED with
  // an outstanding balance, or OVERPAID. Maintained when payments recompute.
  @Prop({ required: true, default: false })
  flagged: boolean;

  @Prop({ required: true })
  estimatedDeliveryDate: Date;

  @Prop({ required: true, type: Types.ObjectId, ref: OrderStatus.name })
  orderStatusId: Types.ObjectId;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
// The flagged view sorts by outstanding balance then age.
OrderSchema.index({ flagged: 1, balanceDue: -1, createdAt: 1 });
OrderSchema.index({ officeId: 1, createdAt: -1 });
OrderSchema.index(
  { pickupRequestId: 1, customerId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      pickupRequestId: { $exists: true, $ne: null },
    },
  },
);
