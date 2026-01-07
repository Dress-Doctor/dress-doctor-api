import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Order } from '../order/order.schema';
import { PaymentMethod } from './payment-method.schema';
import { PaymentStatus } from './payment-status.schema';

export const paymentSchemaName = 'payment';
@Schema({ timestamps: true, collection: paymentSchemaName })
export class Payment extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: Order.name })
  orderId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: PaymentMethod.name })
  paymentMethodId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: PaymentStatus.name })
  paymentStatusId: Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  paidAt: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
