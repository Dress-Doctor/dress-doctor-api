import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const paymentMethodSchemaName = 'payment_method';
@Schema({ timestamps: true, collection: paymentMethodSchemaName })
export class PaymentMethod extends Document<Types.ObjectId> {
  @Prop({ required: true })
  paymentMethodName: string; // CASH, MOMO, CARD

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const PaymentMethodSchema = SchemaFactory.createForClass(PaymentMethod);
