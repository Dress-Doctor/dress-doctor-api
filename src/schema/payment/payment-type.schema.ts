import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'payment_type' })
export class PaymentType extends Document<Types.ObjectId> {
  @Prop({ required: true, unique: true })
  paymentTypeName: string; // PAYMENT, REFUND

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const PaymentTypeSchema = SchemaFactory.createForClass(PaymentType);
