import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const paymentStatusSchemaName = 'payment_status';
@Schema({ timestamps: true, collection: paymentStatusSchemaName })
export class PaymentStatus extends Document<Types.ObjectId> {
  @Prop({ required: true })
  paymentStatusName: string; // PENDING, PAID

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const PaymentStatusSchema = SchemaFactory.createForClass(PaymentStatus);
