import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const paymentTypeSchemaName = 'payment_type';
@Schema({ timestamps: true, collection: paymentTypeSchemaName })
export class PaymentType extends Document<Types.ObjectId> {
  // Human-readable identifier, the same idea as a payment's own `reference`:
  // it is what a URL, a table row and a support conversation quote, so nobody
  // has to pass a 24-character mongo id around.
  @Prop({ required: true })
  reference: string;

  /**
   * The name the rest of the platform matches on.
   *
   * NOT a display label: `payment.service` decides whether a payment is a
   * refund by comparing this string against `PaymentTypeEnum.REFUND` inside an
   * aggregation, and groups its KPIs by it; `office.service` groups its
   * takings by it too. Rename one and a refund stops being counted as a
   * refund, which is why the API's update DTO does not accept this field.
   */
  @Prop({ required: true, unique: true })
  paymentTypeName: string; // PAYMENT, REFUND

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const PaymentTypeSchema = SchemaFactory.createForClass(PaymentType);

PaymentTypeSchema.index({ reference: 1 }, { unique: true });
