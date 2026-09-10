import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Currency } from '../catalog/currency.schema';
import { Office } from '../office/office.schema';
import { Order } from '../order/order.schema';
import { User } from '../user/user.schema';
import { PaymentPeriodEnum } from './payment.dto';
import { PaymentMethod } from './payment-method.schema';
import { PaymentType } from './payment-type.schema';

export const paymentSchemaName = 'payment';
@Schema({ timestamps: true, collection: paymentSchemaName })
export class Payment extends Document<Types.ObjectId> {
  // Human-readable identifier, the payment's counterpart to an order's
  // `orderCode` and a pickup's `reference` — what staff quote on a receipt.
  @Prop({ required: true })
  reference: string;

  @Prop({ required: true, type: Types.ObjectId, ref: Order.name })
  orderId: Types.ObjectId;

  // The customer *User*, not the Customer profile: it is copied straight from
  // `order.customerId`, which refs User.
  @Prop({ required: false, type: Types.ObjectId, ref: User.name })
  customerId?: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId, ref: Office.name })
  officeId?: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: PaymentMethod.name })
  paymentMethodId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: PaymentType.name })
  paymentTypeId: Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  // CURRENT when the payment falls in the same business month as the order it
  // settles, PRIOR when it clears a balance carried over from an earlier
  // month. Derived on write from the two dates — never hand-set.
  @Prop({
    required: true,
    type: String,
    enum: PaymentPeriodEnum,
    default: PaymentPeriodEnum.CURRENT,
  })
  paymentPeriod: PaymentPeriodEnum;

  @Prop({ type: Types.ObjectId, ref: User.name })
  receivedBy: Types.ObjectId;

  @Prop({ required: true })
  paidAt: Date;

  @Prop({ required: false })
  transactionRef?: string;

  // Client-supplied dedupe key (x-idempotency-key header). Unique but
  // sparse so payments recorded without a key (e.g. staff-entered cash)
  // aren't forced to collide on null.
  @Prop({ required: false })
  idempotencyKey?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: Currency.name })
  currencyId: Types.ObjectId;

  @Prop({ required: false })
  note?: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ reference: 1 }, { unique: true });
PaymentSchema.index({ orderId: 1 });
PaymentSchema.index({ customerId: 1 });
PaymentSchema.index({ officeId: 1, paidAt: -1 });
PaymentSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
