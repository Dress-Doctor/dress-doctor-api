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

  /**
   * What this row was called in the 2026 Sales sheet it came from — `OR-0001`.
   *
   * Written once by `migrate-sales`, and the only thing that makes that
   * migration re-runnable: the codes here are minted fresh, so without this
   * there is nothing to recognise an already-imported row by, and a second run
   * would import the whole ledger again.
   *
   * Only migrated rows carry one. Anything entered since has none, which is
   * why the index is sparse.
   */
  @Prop({ required: false })
  legacyCode?: string;

  /**
   * Anything specific the customer told us about this order — "no starch on
   * the blue shirt", "collar stain", a delivery instruction. Free text on
   * purpose: it is what the customer said, not a field we can enumerate.
   */
  @Prop({ required: false, trim: true, maxlength: 1000 })
  note?: string;

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

  // The subtotal a human agreed at the counter, when one was given. It is an
  // INPUT, not a result: reprice() feeds it back to the pricing engine as the
  // subtotal, so adding a garment or editing the draft can't quietly reprice
  // the order away from what the customer was told. Unset = engine prices it.
  @Prop({ required: false })
  manualOrderAmount?: number;

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

  // Business date the laundry was physically received from the customer.
  // Entered by whoever creates the order (may differ from the system
  // `createdAt`); defaults to creation time when not supplied. Drives the
  // orders list date-range filter and turnaround statistics.
  @Prop({ required: true, default: () => new Date() })
  receivedAt: Date;

  @Prop({ required: true })
  estimatedDeliveryDate: Date;

  // Business date the finished laundry was actually delivered — stamped once,
  // on the transition into DELIVERED. Null until then. estimatedDeliveryDate
  // vs deliveredAt gives the on-time / turnaround metric.
  @Prop({ required: false })
  deliveredAt?: Date;

  // The user who created the order (staff/system) — set automatically.
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  createdBy: Types.ObjectId;

  // The agent/staff who physically picked up the customer's laundry. Optional
  // at creation; defaults to createdBy when not supplied.
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  pickedUpBy: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: OrderStatus.name })
  orderStatusId: Types.ObjectId;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
// The flagged view sorts by outstanding balance then age.
OrderSchema.index({ flagged: 1, balanceDue: -1, createdAt: 1 });
OrderSchema.index({ officeId: 1, createdAt: -1 });
// The orders list filters/sorts by the business receipt date.
OrderSchema.index({ officeId: 1, receivedAt: -1 });
// Same list narrowed to one payment status — equality first, then the range
// the date window scans and the list sorts on.
OrderSchema.index({ officeId: 1, paymentStatus: 1, receivedAt: -1 });
OrderSchema.index(
  { pickupRequestId: 1, customerId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      pickupRequestId: { $exists: true, $ne: null },
    },
  },
);
// Only migrated rows carry a `legacyCode`, so the index is sparse: rows
// entered since have none and must not collide with each other.
OrderSchema.index({ legacyCode: 1 }, { unique: true, sparse: true });
